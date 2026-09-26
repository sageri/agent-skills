#!/usr/bin/env python3
"""read_article.py — 小红书笔记 / 微信公众号文章 链接 → Markdown。

ローカル回線直撃（ブラウザ UA）で取得するため、クラウド出口 IP は
WeChat の風控に弾かれる点に注意（WebFetch 系は使わないこと）。

Usage:
    python read_article.py <url> [--save out.md]

Exit codes: 0 = OK, 1 = fetch/parse failure (reason to stderr)
"""
import argparse
import html as htmllib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from curl_cffi import requests as creq
from markdownify import markdownify

UA_DESKTOP = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
# 小红书はモバイル SSR ページ（discovery/item + xsec_token）が無ログインで
# 安定する：App 共有リンクは「未ログインで微信内から開く」前提の配信のため。
# デスクトップ経路（explore + __INITIAL_STATE__）は IP リスク制御で弾かれやすい。
UA_MOBILE = (
    "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36"
)


def fail(msg: str) -> None:
    print(f"[read-article] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def fetch_html(url: str) -> str:
    try:
        r = requests.get(
            url,
            headers={
                "User-Agent": UA_DESKTOP,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "zh-CN,zh;q=0.9",
            },
            timeout=30,
        )
    except requests.RequestException as e:
        fail(f"请求失败: {e}")
    if r.status_code != 200:
        fail(f"HTTP {r.status_code}: {r.url[:120]}")
    r.encoding = "utf-8"
    return r.text


# 小红书モバイル経路。TLS 指紋対策に curl_cffi の chrome impersonate を使用
# （素の Python requests は指紋でログイン弾きされる）。Cookie は任意の兜底。
COOKIE_PATH = Path.home() / ".xhs-cookie.txt"


def load_xhs_cookie() -> str:
    if os.environ.get("XHS_COOKIE"):
        return os.environ["XHS_COOKIE"].strip()
    try:
        return COOKIE_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _normalize_xhs_url(url: str) -> str:
    """任意の共有リンク → discovery/item URL。xsec_token は生文字のまま転写。"""
    if "xhslink.com" in url:
        try:
            r = creq.get(url, headers={"User-Agent": UA_MOBILE}, impersonate="chrome", timeout=30)
            url = str(r.url)
        except Exception as e:
            fail(f"短链跳转失败: {e}")
    m = re.search(r"/(?:explore|discovery/item)/([0-9a-fA-F]+)", url)
    if not m:
        fail(f"无法从链接提取笔记 ID（非笔记页链接？）: {url[:80]}")
    t = re.search(r"[?&]xsec_token=([^&]+)", url)
    if not t:
        fail("链接缺少 xsec_token（仅支持 App 分享出来的完整链接，裸链接拿不到内容）。")
    s = re.search(r"[?&]xsec_source=([^&]+)", url)
    src = s.group(1) if s else "pc_feed"
    return (
        f"https://www.xiaohongshu.com/discovery/item/{m.group(1)}"
        f"?xsec_token={t.group(1)}&xsec_source={src}"
    )


def fetch_xhs_html(url: str) -> str:
    headers = {"User-Agent": UA_MOBILE, "Accept-Language": "zh-CN,zh;q=0.9"}
    cookie = load_xhs_cookie()
    if cookie:
        headers["Cookie"] = cookie
    try:
        r = creq.get(_normalize_xhs_url(url), headers=headers, impersonate="chrome", timeout=30)
    except Exception as e:
        fail(f"请求失败: {e}")
    if r.status_code != 200:
        fail(f"HTTP {r.status_code}: {str(r.url)[:120]}")
    return r.text


# ---------------------------------------------------------------- wechat

def parse_wechat(url: str, html: str) -> str:
    title = (re.search(r'<meta property="og:title" content="([^"]*)"', html) or [None, ""])[1]
    author = (re.search(r'<meta property="og:article:author" content="([^"]*)"', html) or [None, ""])[1]
    if not author:
        author = (re.search(r'var nickname = "([^"]*)"', html) or [None, ""])[1]
    author = htmllib.unescape(author).strip()

    ct = (re.search(r'var ct = "(\d+)"', html) or [None, None])[1]
    published = datetime.fromtimestamp(int(ct)).strftime("%Y-%m-%d %H:%M") if ct else ""

    if "环境异常" in html[:8000] and "js_content" not in html:
        fail("被微信风控拦截（环境异常验证页）。稍后重试或换本机网络。")

    soup = BeautifulSoup(html, "html.parser")
    content = soup.find(id="js_content")
    if content is None:
        fail("未找到正文容器 js_content（文章可能已删除、仅群发可见或需登录）。")

    # 微信 img の実URLは data-src（src はプレースホルダ）
    for img in content.find_all("img"):
        src = img.get("data-src") or img.get("src")
        if src:
            img.attrs = {"src": src}

    body = markdownify(str(content), heading_style="ATX", bullets="-")
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    if not body:
        fail("正文为空（文章可能仅图片或已被删除）。")

    fm = [
        "---",
        f"platform: wechat_mp",
        f"title: {title}",
        f"author: {author}",
        f"published: {published}",
        f"url: {url}",
        "---",
        "",
    ]
    return "\n".join(fm) + f"# {title}\n\n{body}\n"


# ---------------------------------------------------------------- xhs

def _xhs_img_url(im: dict) -> str:
    u = im.get("urlDefault") or im.get("url")
    if not u:
        for info in im.get("infoList") or []:
            if info.get("imageScene") == "H5_DTL":
                u = info.get("url")
                break
    return (u or "").replace("http://", "https://", 1)


def parse_xhs(url: str, html: str) -> str:
    m = re.search(r"window\.__SETUP_SERVER_STATE__\s*=\s*(.*?)</script>", html, re.DOTALL)
    if not m:
        fail("页面无笔记数据（链接过期、笔记删除或被风控）。换 App 重新分享的链接重试。")
    try:
        pd = json.loads(m.group(1)).get("LAUNCHER_SSR_STORE_PAGE_DATA") or {}
    except json.JSONDecodeError:
        fail("笔记数据解析失败（页面结构可能已变化）。")
    note = pd.get("noteData") or {}
    if not (note.get("title") or note.get("desc")):
        fail("笔记字段为空（链接过期或笔记不可见）。")

    user = note.get("user") or {}
    nickname = user.get("nickName") or user.get("nickname") or ""
    published = ""
    if note.get("time"):
        published = datetime.fromtimestamp(note["time"] / 1000).strftime("%Y-%m-%d %H:%M")

    tags = ", ".join(t.get("name", "") for t in note.get("tagList") or [] if t.get("name"))
    inter = note.get("interactInfo") or {}
    interact = " / ".join(
        f"{k} {v}" for k, v in [
            ("赞", inter.get("likedCount", "")), ("藏", inter.get("collectedCount", "")),
            ("评论", inter.get("commentCount", "")), ("转", inter.get("shareCount", "")),
        ] if v
    )

    lines = [
        "---",
        "platform: xiaohongshu",
        f"title: {note.get('title', '')}",
        f"author: {nickname}",
        f"published: {published}",
        f"ip_location: {note.get('ipLocation', '')}",
        f"tags: {tags}",
        f"url: {url}",
        "---",
        "",
        f"# {note.get('title', '')}",
        "",
    ]
    desc = (note.get("desc") or "").strip()
    if desc:
        lines += [desc, ""]

    if note.get("type") == "video":
        h264 = ((note.get("video") or {}).get("media", {}).get("stream", {}).get("h264") or [{}])[0]
        dur = h264.get("duration") or (note.get("video") or {}).get("capa", {}).get("duration")
        dur_s = f"{dur // 1000}s" if isinstance(dur, int) else ""
        if h264.get("masterUrl"):
            lines += [f"**视频**: [{dur_s or 'video'}]({h264['masterUrl']})", ""]

    imgs = note.get("imageList") or []
    img_urls = [u for u in (_xhs_img_url(im) for im in imgs) if u]
    if img_urls:
        lines.append(f"**图片 x{len(img_urls)}**:")
        for n, u in enumerate(img_urls, 1):
            lines.append(f"{n}. {u}")
        lines.append("")

    if interact:
        lines.append(f"**互动**: {interact}")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- main

def main() -> None:
    # cp932 コンソールでの中文出力崩れ対策（リダイレクト先も UTF-8 固定）
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description="小红书/微信公众号链接 → Markdown")
    ap.add_argument("url", help="mp.weixin.qq.com / xiaohongshu.com / xhslink.com 链接")
    ap.add_argument("--save", help="另存到文件（默认只输出 stdout）")
    args = ap.parse_args()

    url = args.url.strip()

    if "mp.weixin.qq.com" in url:
        md = parse_wechat(url, fetch_html(url))
    elif "xiaohongshu.com" in url or "xhslink.com" in url:
        md = parse_xhs(url, fetch_xhs_html(url))
    else:
        fail(f"不支持的链接（仅支持微信公众号/小红书）: {url[:80]}")

    if args.save:
        with open(args.save, "w", encoding="utf-8", newline="\n") as f:
            f.write(md)
        print(f"[read-article] saved: {args.save}")
    else:
        print(md)


if __name__ == "__main__":
    main()
