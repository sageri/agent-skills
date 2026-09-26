---
name: jev-browser-skill
description: 用 TypeSafe Jev 驱动 bsk，把多步浏览器子任务压成一次脚本调用。
disable-model-invocation: true
---

# jev-browser-skill

`scripts/loop.mjs` 在一个进程里跑完 observe → Jev 判断 → bsk 动作的循环：每步一次 Jev 调用（百毫秒级），主模型只在开头调用一次、在结尾读一次报告。浏览器、session、`@eN` 引用的语义归 [browser-skill](../browser-skill/SKILL.md)，本 skill 只管循环。

## 何时用

- 适合：多步导航 / 搜索 / 筛选 / 表单填写，只要结果、不在乎过程，公开或非敏感站点。
- 交给 browser-skill 逐轮做：需要读图或 Canvas、需要推理才能决定下一步、登录与验证码、银行/医疗/凭据页/公司内网——后几类循环本身也会在代码门禁里 hand-back（规则见 [privacy](references/privacy.md)）。

## 调用

```bash
node <skill目录>/scripts/loop.mjs --url <url> --goal "<目标>" --values k1=v1,k2=v2 [--expect-url <regex>] [--expect-text <str>] [--max-steps 20] [--deadline-secs 300] > <输出文件>
```

- 目标里要输入的字符串二选一：放进 `--values`（Jev 只看到字段名，看不到值），或在 `--goal` 里用引号写出（`"…"`、`「…」`，引号内文本会作为候选值发给 Jev）。loop 不生成文本。
- 配上 `--expect-url` / `--expect-text` 才可能拿到 `done`：完成由代码断言判定，断言通过即提前收尾；断言未过时 Jev 的 DONE 被驳回、改执行次高操作（至多 2 次）。没配断言时 DONE 只能落到 `likely_done`。
- Git Bash 会把参数里的 `\.` 改写成 `/.`（MSYS 路径转换），断言正则静默失效：写成 `[.]`。改用 `MSYS_NO_PATHCONV=1` 时，脚本路径也不再转换，须写成 `C:/…` 形式（`/c/…`、`~/…` 会找不到文件）。
- 其余旗标（`--allow-origin-exit`、`--allow-host`、`--browser`）见 `--help`。需要环境变量 `TYPESAFE_API_KEY`。
- stdout 末行是一行 ASCII 转义的 JSON：`status` / `reason` / `url` / `steps` / `session_id` / `report`。完整报告在 `report` 路径（UTF-8），其 `observation` 字段是最后一页的 VOM 快照：信息类目标（"取前三条标题"）从这里读结果，不用再开 observe。
- 退出码与 status 一一对应（`--help` 有表）。deadline 默认 300s，留在 Bash 单次 600s 上限内。
- bsk daemon 起不来（sandbox / Job Object 报错）按 browser-skill 的 [environment](../browser-skill/references/environment.md) 处理，不重启共享 daemon。

## hand-back 处理

`done` 由 loop 自己 `bsk session stop`。其余带 `session_id` 的状态都把 session 原样留给你：接手、用完、由你 stop。续跑一律 `--resume <session_id>` 原地继续，**不从 URL 重跑**。

| status | 含义 | 你该做 |
|---|---|---|
| `done` | 断言全部通过 | 从报告取结果 |
| `likely_done` | Jev 判 DONE，但没配断言，或驳回 2 次后断言仍未过 | 读报告 `observation` 或用 bsk 目检：已完成 → 取结果后 stop；未完成 → 按 browser-skill 在原 session 接着做完剩余步骤，再 stop |
| `confirm_required` | 下一步是不可逆操作（送信/購入/削除…），未执行 | 问用户；同意后用 bsk 手动点，再 `--resume` 或 stop |
| `text_value_unavailable` | 某字段需要的值不在 `--values` | 补值后 `--resume <session_id> --values …` |
| `stuck` / `max_steps` / `deadline` | 无进展 / 超预算 | 看 `steps` 与报告 `observation`：能看出下一步 → 按 browser-skill 在原 session 接着做完，再 stop；看不出 → 问用户 |
| `blocked` | 敏感站点、离开起始站点、密码页、敏感字段、验证码/登录墙 | 按 `reason` 交用户或 browser-skill 手动；无 `session_id` 表示根本没开 session |
| `error` | API / bsk / 参数失败 | 看 `reason`；有 `session_id` 就先 stop |

各状态的细节与续跑命令对照见 [handback](references/handback.md)。
