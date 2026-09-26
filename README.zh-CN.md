# Agent Skills 🧩

> **让 AI 编程助手，从"能用"变"好用"。**
> 四个开箱即用的 Skill —— 浏览器自动化、跨模型双审、写作前置、小红书/公众号抓取。
> Claude Code · Codex · ZCode · 以及任何能加载 Skill 的 AI。

[English](README.md) · **简体中文** · [日本語](README.ja.md)　　⭐ **如果它帮到了你，欢迎点个 Star——这是开源作者最大的鼓励。**

---

## ✨ 为什么是这些 Skill？

你大概经历过这些瞬间：

- 🤖 让 AI 帮你点网页，它点一下、思考一轮、再点一下……点 7 次用了 1 分钟
- 👀 自己写的代码总觉得哪里不对，但又找不出来
- ✍️ 标题想了 3 小时，正文还没动
- 📱 丢给 AI 一个小红书链接，它却读不到内容

这四个 Skill，就是为这些瞬间准备的。

---

## 🚀 一览

| Skill | 一句话 | 触发方式 |
|---|---|---|
| 🖱️ **[jev-browser-skill](#jev-browser-skill)** | 把多步浏览器任务压成一次调用，**快约 3 倍** | `/jev-browser-skill` |
| 🛡️ **[cross-review](#cross-review)** | 另一个 AI 只读审你的每一步，盲点被揪出来 | 说"双审"或 `/cross-review` |
| 🗺️ **[prewrite](#prewrite)** | 把一团乱的想法，整理成一张可以直接开写的地图 | 自动触发，或 `/prewrite` |
| 📰 **[read-article](#read-article)** | 小红书 / 公众号文章 → 干净的 Markdown | 贴出链接时自动触发 |

---

## 📦 安装

```bash
npx skills add sageri/agent-skills -s jev-browser-skill -g
```

把 `jev-browser-skill` 换成任意 skill 名；`-s '*'` 一次装全部四个。`-g` 装到用户级，去掉则装到当前项目。

---

<a id="jev-browser-skill"></a>

## 🖱️ jev-browser-skill：让浏览器自动化，**不再一卡一顿**

让 agent 逐步操作浏览器时，每点一下都要主模型走一整轮：读一大段页面快照、思考、动作，再来一遍。

这个 skill 把整个子任务交给一个小循环脚本：每一步问 [TypeSafe Jev](https://docs.typesafe.ai)（几百毫秒返回类型化选择的快速判断模型）该操作哪个元素，再通过 [腾讯 BrowserSkill](https://github.com/Tencent/BrowserSkill)（bsk）在你**已登录的真实浏览器**里执行。

```bash
node <skill目录>/scripts/loop.mjs \
  --url https://transit.yahoo.co.jp/ \
  --goal "乗換案内で、出発に from、到着に to を入力し、日時を 2026年9月27日 9時00分 出発に設定して検索する" \
  --values from=川崎,to=大阪 \
  --expect-url 'search/result.*d=27&hh=09&m1=0&m2=0'
```

> 目标用任何语言的自然语言写都可以。平时不用自己敲：输入 `/jev-browser-skill <任务>`，agent 会替你写好这条命令。

### ⚡ 真实网站实测

*同一台机器、同一批任务、端到端耗时（样本少，不是正式基准）：*

| 任务 | agent 逐步操作 | jev-browser-skill | 提速 |
|---|---|---|---|
| Yahoo! 新闻：取头条前三条 | 5 次调用 · 68 秒 | 1 次调用 · 6–12 秒 | **🚀 ~6–11×** |
| Yahoo! 路线：按日期时间查换乘 | 7 次调用 · 54 秒 | 1 次调用 · ~17 秒 | **🚀 ~3×** |
| 友都八喜：查最近买的 3 件商品 | 8 次调用 · 53 秒 | 1 次调用 · ~19 秒 | **🚀 ~3×** |

### 🔒 安全靠代码，不靠提示词

所有门禁都在页面内容**离开你的电脑之前**执行：

- 🚫 银行、医疗、登录页、公司内网，以及任何出现密码框的页面，都在发给模型之前拦下
- 🚫 用 `--values` 传入的值永远不发给 Jev，它只看得到字段名
- 🚫 不可逆的点击（购买、发送、删除、提交……）先停下来问你
- 🚫 敏感字段（卡号、PIN……）一律不填
- ✅ 做没做完由你给的 `--expect-url` / `--expect-text` 断言判定，不问模型"你做完了吗"

循环做不完时，会带着**类型化状态**交还（`confirm_required` / `text_value_unavailable` / `stuck` / `blocked` …），浏览器会话保持打开，agent 或你本人可以用 `--resume` 从停下的地方接着做。

**前置条件：** [BrowserSkill](https://github.com/Tencent/BrowserSkill)（bsk CLI + 浏览器扩展 + browser-skill skill）、Node.js 18+、环境变量 `TYPESAFE_API_KEY`。零 npm 依赖。页面文本会发送到 TypeSafe API，详见[隐私边界](skills/jev-browser-skill/references/privacy.md)。移植自 [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)。

---

<a id="cross-review"></a>

## 🛡️ cross-review：让另一个 AI，**只读审你的每一步**

> 一个人写的代码，审不出自己的盲点。

主 agent 负责干活，另一个 AI CLI 只读审核，每条意见都要明确写下"**采纳 / 驳回 + 理由**"。单个模型漏掉的问题能被揪出来，审核者又碰不到你的文件。

- 🧱 **代码任务**：五段流水线（需求 → 构架 → 规格 → 实现＋测试 → 验证），每段后面一道审核门，规格阶段还要你本人确认
- 📝 **非代码交付物**（翻译、报告、PPT）：对成品过一道审核门
- 📂 **已有产物**：直接指定设计文档、diff 或测试结果，只审这一份
- 👥 **每道门恰好一名审核者**，默认 agy（Antigravity CLI），可以点名 codex 或 claude；某个 CLI 调用失败时自动换下一个
- 📁 送审包、审核原文、裁决和 token 用量都落盘在 `.cross-review/`，每个决定都有据可查

**前置条件：** 本机装好并登录 agy、codex、claude 中至少一个 CLI。

---

<a id="prewrite"></a>

## 🗺️ prewrite：把一团乱的想法，**变成一张地图**

> 第一句写不出来？先别写。

prewrite 先找出你卡在哪，再交给你**一张地图**，而不是一篇代写的稿子：

- 🧱 **起不了头** → 先倒空：你写的时候它保持安静，写完再帮你提炼要点
- 🌪️ **素材太多找不到主线** → KJ 聚类，或四层蒸馏，一直压到只剩一句话
- 🎯 **有观点但说不清** → 过三关：磨锋利观点、搭逻辑链、压力测试

✨ 一次只问一个问题；所有标题都写成"**有人会反对**"的判断句。除非你明确要求，它**不替你写正文**。

> ℹ️ 已有初稿要润色时不适用。

---

<a id="read-article"></a>

## 📰 read-article：小红书 / 公众号 → Markdown

> 贴一个链接，得一篇干净的 Markdown。

得到的内容包含：标题、作者、时间、正文、图片 / 视频直链。agent 接着帮你阅读或总结。

- 🍪 不需要登录 Cookie
- 🏠 因为两家平台都会拦截云端 IP，所以**在你本机运行**
- 🐍 依赖只有 4 个：`requests`、`beautifulsoup4`、`curl_cffi`、`markdownify`

```bash
pip install requests beautifulsoup4 curl_cffi markdownify
```

> 📌 小红书链接必须是 App 分享出来的完整链接（带 `xsec_token`）。可选配置 Cookie（`XHS_COOKIE` 环境变量或 `~/.xhs-cookie.txt`），抓取更稳定。

⚠️ **免责声明：** 本 skill 通过模拟移动端和浏览器指纹抓取页面，可能与相应平台的服务条款冲突。仅供个人学习使用，风险由使用者自负。

---

## 🤝 一起让它更好

Bug、想法、想贡献一个自己的 skill？欢迎：

- 🐛 [提一个 Issue](https://github.com/sageri/agent-skills/issues)
- 🔀 [发一个 PR](https://github.com/sageri/agent-skills/pulls)

---

## 📜 许可证

[MIT](LICENSE)

---

<sub>如果这个项目帮到了你，**点一下右上角的 ⭐ Star** —— 这是开源作者继续写下去的最大动力。也欢迎转发给你身边写代码、做产品、被"点网页 7 次花 1 分钟"折磨过的朋友。</sub>
