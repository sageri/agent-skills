---
name: read-article
description: 读取小红书笔记或微信公众号文章链接的正文，输出 Markdown。用户提供 mp.weixin.qq.com、xiaohongshu.com、xhslink.com 链接并要求阅读或总结该文章时使用；抓取须走本 skill 的本机直抓脚本，云端出口会被风控拦截。
---

# read-article — 小红书 / 公众号链接 → Markdown

本机出口直抓（不走云端代理），两平台均无需登录 Cookie。

## 运行

```bash
python "<skill目录>/scripts/read_article.py" "<url>" > temp/article.md 2> temp/article.err
```

- 上式即正确形式：中文输出必须重定向到文件后 Read（cp932 console 直出会乱码）
- 输出：Markdown（frontmatter 含标题/作者/时间/来源，正文或笔记文案 + 图片/视频直链清单）；`--save <path>` 可另存文件
- 退出码 1 = 失败，原因在 stderr，按「失败判读」表处置

## 平台行为

- **微信公众号**（mp.weixin.qq.com）：未登录直抓（桌面 UA + requests），正文从 `js_content` 提取。图片为 `mmbiz.qpic.cn` 链接（有防盗链，CLI 中只列 URL；需看图内容时配合 `analyze_image` MCP 逐张读）。
- **小红书**（xiaohongshu.com / xhslink.com）：走**移动端 SSR 页面**（`/discovery/item/{id}?xsec_token=...` + 移动 UA + curl_cffi Chrome 指纹），从 `__SETUP_SERVER_STATE__` 提取笔记数据。原理：App 分享链接天生为未登录用户设计（微信内点开），此路径不消耗桌面端游客配额，且是唯一稳定入口（桌面端 explore 路径已被 IP 风控弃用）。链接必须是 App 分享出来的完整链接（带 `xsec_token`），裸链接拿不到内容。数据含：标题/文案/作者/时间/标签/图片或视频直链/互动数；`ip_location` 移动端为空属正常。

## 可选兜底：小红书 Cookie

若移动端路径也被风控（报"页面无笔记数据"），可配置登录 Cookie 增强稳定性：

1. 浏览器登录 xiaohongshu.com
2. F12 → Network → 刷新 → 任选 `xiaohongshu.com` 域请求 → Request Headers → 复制整行 `Cookie` 值
3. 存为 `~/.xhs-cookie.txt`（单行原文即可），或设 `XHS_COOKIE` 环境变量

配置后工具会自动附带；Cookie 数周至数月有效。

## 失败判读

| stderr 关键词 | 原因 | 处置 |
|---|---|---|
| 被微信风控拦截 | 微信侧环境验证 | 稍等重试；确认是本机网络 |
| 未找到正文容器 js_content | 文章删除/仅群发可见/需登录 | 让用户在微信里打开确认 |
| 页面无笔记数据 | 分享链接过期或被风控 | 让用户在 App 重新分享新链接；或配 Cookie |
| 链接缺少 xsec_token | 裸链接（非 App 分享） | 让用户从 App 分享拿完整链接 |
| 笔记数据解析失败 | 页面结构变化 | 需人工排查脚本 |
| （表外消息） | HTTP/请求失败、正文为空、链接非笔记页等 | stderr 原文即处置说明，多为链接或网络问题，非脚本 bug |
