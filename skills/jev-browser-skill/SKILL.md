---
name: jev-browser-skill
description: 主模型规划、TypeSafe Jev 判断、bsk 执行的浏览器控制，主模型不读页面快照以省 token。
disable-model-invocation: true
---

# jev-browser-skill

**你规划，Jev 判断，代码执行，最终验证归你。** Jev 只回答类型化的选择题（是/否、选一个，带概率），百毫秒级，不写文本、不做多步规划。所以要输入的文字由你给，步骤顺序由你定；页面由 Jev 读，你只读脚本回传的一行 JSON 或筛过的原文。浏览器、session、`@eN` 的语义归 [browser-skill](../browser-skill/SKILL.md)。

三个脚本，都在 `scripts/` 下，都需要 `TYPESAFE_API_KEY`，旗标与退出码见各自 `--help`：

| 脚本 | 做什么 | 回传给你 |
|---|---|---|
| `loop.mjs` | 朝一个结果循环：observe → Jev 选操作和目标 → bsk 执行 | 末行 JSON：`status` / `reason` / `session_id` / `candidates`… |
| `check.mjs` | 对当前页问一个是/否问题 | `p_yes` 与 `verdict`（yes / no / unsure） |
| `read.mjs` | 按问题从全文里筛出相关原文块 | 页面原文（≤ `--max-chars`）+ 末行统计 |

## 工作流

1. **一次一个可验证结果**：`node loop.mjs --url <url> --goal "<结果>" [--values k=v,…] [--expect-url <regex> | --expect-text <str>]`。「登录」「把 X 加入购物车」各一次；后续步骤用 `--resume <session_id>` 在同一页接着跑，**不从 URL 重跑**。
2. **看 `status`**：`done` 往下走，其余见下表。
3. **有副作用的步骤之后**：`node check.mjs --session <id> --question "<该变的变了 / 不该变的没变>"`。`unsure` 时自己用 bsk 看。
4. **信息类目标**：loop 加 `--keep-session` 把页面留着，再 `node read.mjs --session <id> --question "<要找什么>"`；短页面整页返回、不调 Jev。
5. **收尾**：任务结束 `bsk session stop <id>`；`bsk session list` 不应再有它。

## 写目标

- 要输入的字符串放进 `--values`，键名写清含义（`email`、`postal_code`）：Jev 只看到键名，看不到值。也可在 `--goal` 里用引号写出（`"…"`、`「…」`），引号内文本会作为候选值发给 Jev。
- 有先后的多个子目标（"加两条、完成一条、清空已完成"）拆成多次调用；开放式目标（"往下多加载些"）改写成能断言的（"直到出现至少 3 条新结果"）。
- 配 `--expect-url` / `--expect-text` 才可能拿到 `done`：断言未过时 Jev 的 DONE 被驳回、改执行次高操作（至多 2 次）；没配断言时 DONE 只能落到 `likely_done`。
- 横向比较（排序对不对、恰好变了一处）、看图、文字内容的好坏，留给你自己判断，不写进 goal 或 check。
- Git Bash 会把参数里的 `\.` 改写成 `/.`（MSYS 路径转换），断言正则静默失效：写成 `[.]`。改用 `MSYS_NO_PATHCONV=1` 时脚本路径须写成 `C:/…`。
- 一次调用默认 20 步 / 300s，留在 Bash 单次 600s 上限内。bsk daemon 起不来（sandbox / Job Object 报错）按 browser-skill 的 [environment](../browser-skill/references/environment.md) 处理，不重启共享 daemon。

## loop 的 status

`done` 时 loop 自己 stop session（加了 `--keep-session` 则留着）。其余带 `session_id` 的状态把 session 原样留给你：接手、用完、由你 stop。

| status | 含义 | 你该做 |
|---|---|---|
| `done` | 断言全部通过 | 往下走 |
| `likely_done` | Jev 判完成，但没配断言，或驳回 2 次后断言仍未过 | `check` 验证：yes → 往下；no → 在原 session 接着做 |
| `ambiguous` | Jev 对点哪 / 填哪 / 选哪没把握（低于 `--min-confidence`，默认 0.55），未执行 | 从 `candidates` 挑一个用 bsk 执行，再 `--resume` |
| `stuck` / `max_steps` / `deadline` | 无进展 / 超预算 | 有 `candidates` 先从中挑；看不出下一步再 `bsk observe` 或问用户 |
| `confirm_required` | 下一步是不可逆操作（送信/購入/削除…），未执行 | 问用户；同意后用 bsk 手动点，再 `--resume` 或 stop |
| `text_value_unavailable` | 某字段需要的值不在 `--values` | 补值后 `--resume <id> --values …` |
| `blocked` | 敏感站点、离开起始站点、密码页、敏感字段、验证码/登录墙 | 按 `reason` 交用户或 browser-skill 手动；无 `session_id` 表示没开 session |
| `error` | API / bsk / 参数失败 | 看 `reason`；有 `session_id` 就先 stop |

`candidates` 每项 `{op, target, value?, label, p}`，按 `op` 拼命令：`click` → `bsk click <target>`；`fill` → `bsk fill <target> --value <你给的文字>`；`select` → `bsk select <target> --value <value>`，都加 `--session <id>`。各状态的接手细节见 [handback](references/handback.md)；三个脚本发什么、不发什么见 [privacy](references/privacy.md)。
