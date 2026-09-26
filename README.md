# agent-skills

Agent Skills for Claude Code, Codex, ZCode and other hosts that read `SKILL.md`. Most skills are written in Chinese.

## Install

```bash
npx skills add sageri/agent-skills -s <name> -g
```

`jev-browser-skill` runs only when you type `/jev-browser-skill`; the others can also be triggered by the model from their descriptions.

## Skills

### [jev-browser-skill](skills/jev-browser-skill/SKILL.md)

用 TypeSafe Jev 的类型化判断驱动 Tencent BrowserSkill 的 `bsk` CLI，把多步浏览器子任务（导航、搜索、筛选、表单）压成一次脚本调用：每步一次 Jev 请求，完成由 URL / 文本代码断言判定。敏感站点、内网、密码页、敏感字段、不可逆操作全部在代码门禁里交还（hand-back），`--values` 的值永不发给 Jev，hand-back 保留 session 供 `--resume` 原地续跑。零 npm 依赖。移植自 [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)。

前置：[BrowserSkill](https://github.com/Tencent/BrowserSkill)（`bsk` CLI、浏览器扩展、`browser-skill` skill）、Node.js 18+、环境变量 `TYPESAFE_API_KEY`。页面可见文本会发送到 TypeSafe API，详见 [privacy](skills/jev-browser-skill/references/privacy.md)。

### [cross-review](skills/cross-review/SKILL.md)

双审（外审门）：主代理做、外部 CLI（agy / codex / claude）只读审、逐条裁决落盘。代码任务走五段流水线（需求→构架→规格→实现＋测试→测试），非代码交付物走产物门，已有产物可定点门审。

### [prewrite](skills/prewrite/SKILL.md)

动笔前把想法整理成一张可以直接开写的地图：起不了头先倒空、素材过载找主轴、有观点说不清过三关。

### [read-article](skills/read-article/SKILL.md)

把小红书笔记 / 微信公众号文章链接读成 Markdown（Python 本机直抓）。抓取方式模拟移动端与浏览器指纹，可能与相应平台的服务条款冲突：仅供个人学习使用，风险由使用者自负。

## License

[MIT](LICENSE)
