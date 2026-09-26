# agent-skills

[English](README.md) | **简体中文** | [日本語](README.ja.md)

四个实用的 **Agent Skills**（`SKILL.md`），适用于 **Claude Code**、**Codex**、**ZCode** 以及任何能加载 skill 的 AI 编程助手：快速浏览器自动化循环、跨模型双审、动笔前的思路整理、小红书 / 公众号文章读取。

| Skill | 一句话 | 怎么触发 |
|---|---|---|
| [jev-browser-skill](#jev-browser-skill一次调用完成多步浏览器任务) | 多步浏览器任务一次脚本调用做完，比 agent 逐步操作快约 3 倍 | `/jev-browser-skill` |
| [cross-review](#cross-review另一个模型审你的每一步) | 另一个 AI（agy / Codex / Claude）只读审核你每个阶段的产物 | 说"双审"或 `/cross-review` |
| [prewrite](#prewrite把一团乱的想法变成写作地图) | 把零散想法整理成一张可以直接开写的地图 | 自动触发，或 `/prewrite` |
| [read-article](#read-article小红书--公众号转-markdown) | 小红书笔记、微信公众号文章 → Markdown | 贴出链接时自动触发 |

## 安装

使用 [`skills`](https://www.npmjs.com/package/skills) CLI：

```bash
npx skills add sageri/agent-skills -s jev-browser-skill -g
```

把 `jev-browser-skill` 换成任意 skill 名；`-s '*'` 一次装全部四个。`-g` 装到用户级，去掉则装到当前项目。

---

## jev-browser-skill：一次调用完成多步浏览器任务

让 agent 逐步操作浏览器时，每点一下都要主模型走一整轮：读一大段页面快照、思考、动作，再来一遍。这个 skill 把整个子任务交给一个小循环脚本：每一步问 **[TypeSafe Jev](https://docs.typesafe.ai)**（几百毫秒返回类型化选择的快速判断模型）该操作哪个元素，再通过 **[腾讯 BrowserSkill](https://github.com/Tencent/BrowserSkill)**（`bsk`）在你已登录的真实浏览器里执行。

```bash
node <skill目录>/scripts/loop.mjs --url https://transit.yahoo.co.jp/ \
  --goal "乗換案内で、出発に from、到着に to を入力し、日時を 2026年9月27日 9時00分 出発に設定して検索する" \
  --values from=川崎,to=大阪 \
  --expect-url 'search/result.*d=27&hh=09&m1=0&m2=0'
```

目标用任何语言的自然语言写都可以（这条的意思是：填入出发地和到达地，把出发时间设为 2026-09-27 09:00，然后检索）。平时不用自己敲：输入 `/jev-browser-skill <任务>`，agent 会替你写好这条命令。

真实网站实测（同一台机器、同一批任务、端到端耗时；样本少，不是正式基准）：

| 任务 | agent 逐步操作浏览器 | jev-browser-skill |
|---|---|---|
| Yahoo! 新闻：取头条前三条 | 主模型 5 次调用，68 秒 | 1 次调用，6–12 秒 |
| Yahoo! 路线：按日期时间查换乘 | 主模型 7 次调用，54 秒 | 1 次调用，约 17 秒 |
| 友都八喜：查最近买的 3 件商品 | 主模型 8 次调用，53 秒 | 1 次调用，约 19 秒 |

**安全靠代码，不靠提示词。** 所有门禁都在页面内容离开你的电脑之前执行：

- 银行、医疗、登录页、公司内网，以及任何出现密码框的页面，都在发给模型之前拦下。
- 用 `--values` 传入的值永远不发给 Jev，它只看得到字段名。
- 不可逆的点击（购买、发送、删除、提交……）先停下来问你；敏感字段（卡号、PIN……）一律不填。
- 做没做完由你给的 `--expect-url` / `--expect-text` 断言判定，不问模型"你做完了吗"。

循环做不完时，会带着类型化状态**交还**（`confirm_required`、`text_value_unavailable`、`stuck`、`blocked`……），浏览器会话保持打开，agent 或你本人可以用 `--resume` 从停下的地方接着做。

**前置条件：**[BrowserSkill](https://github.com/Tencent/BrowserSkill)（`bsk` CLI + 浏览器扩展 + `browser-skill` skill）、Node.js 18+、环境变量 `TYPESAFE_API_KEY`。零 npm 依赖。页面文本会发送到 TypeSafe API，详见[隐私边界](skills/jev-browser-skill/references/privacy.md)。移植自 [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)。

## cross-review：另一个模型审你的每一步

主 agent 负责干活，**另一个 AI CLI 只读审核**，每条意见都要明确写下"采纳 / 驳回 + 理由"。单个模型漏掉的问题能被抓出来，审核者又碰不到你的文件。

- **代码任务**：五段流水线（需求 → 构架 → 规格 → 实现＋测试 → 验证），每段后面一道审核门，规格阶段还要你本人确认。
- **非代码交付物**（翻译、报告、PPT）：对成品过一道审核门。
- **已有产物**：直接指定设计文档、diff 或测试结果，只审这一份。
- 每道门恰好一名审核者，默认 `agy`（Antigravity CLI），可以点名 `codex` 或 `claude`；某个 CLI 调用失败时自动换下一个。
- 送审包、审核原文、裁决和 token 用量都落盘在 `.cross-review/<task-id>/`，每个决定都有据可查。

**前置条件：**本机装好并登录 `agy`、`codex`、`claude` 中至少一个 CLI。

## prewrite：把一团乱的想法变成写作地图

第一句写不出来？prewrite 先找出你**卡在哪**，再交给你一张地图，而不是一篇代写的稿子：

- **起不了头** → 先倒空：你写的时候它保持安静，写完再帮你提炼要点。
- **素材太多找不到主线** → KJ 聚类，或四层蒸馏，一直压到只剩一句话。
- **有观点但说不清** → 过三关：磨锋利观点、搭逻辑链、压力测试。

一次只问一个问题；所有标题都写成"有人会反对"的判断句。除非你明确要求，它不替你写正文。已有初稿要润色时不适用。

## read-article：小红书 / 公众号转 Markdown

贴出**小红书**笔记或**微信公众号**文章链接，得到干净的 Markdown：标题、作者、时间、正文、图片 / 视频直链，agent 接着帮你阅读或总结。不需要登录 Cookie；因为两家平台都会拦截云端 IP，所以在你本机运行。

```bash
pip install requests beautifulsoup4 curl_cffi markdownify
```

小红书链接必须是 App 分享出来的完整链接（带 `xsec_token`）。可选配置 Cookie（`XHS_COOKIE` 环境变量或 `~/.xhs-cookie.txt`），抓取更稳定。

> **免责声明：**本 skill 通过模拟移动端和浏览器指纹抓取页面，可能与相应平台的服务条款冲突。仅供个人学习使用，风险由使用者自负。

---

## 许可证

[MIT](LICENSE)
