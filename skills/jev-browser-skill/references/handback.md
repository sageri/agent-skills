# hand-back 与续跑

## session 归属

- loop 自己开的 session，只有 `done` 时由 loop `bsk session stop`。
- 其他状态只要 stdout 带 `session_id`，session 就保持原样（同一个 Agent Window、同一页），归接手者：用完负责 `bsk session stop <session_id>`。
- 放弃任务也要 stop；收尾后 `bsk session list` 不应再有它。

## 续跑

```bash
node <skill目录>/scripts/loop.mjs --resume <session_id> --goal "<原目标>" [--values …] [--url <原起始URL>] [断言与预算旗标]
```

- `--resume` 只校验 session 仍在 `bsk session list` 里，然后从**当前页**继续；不 navigate，绝不从 URL 重跑（重跑会丢掉已填的表单和筛选）。session 已失效时返回 `error`，是否从头再来问用户。
- `--goal` 每次都要传（loop 不存状态）。传 `--url` 时它只作起始站点锁的锚点；不传则以当前页为锚点。
- 步数与 deadline 按本次调用重新计。

## 各状态的接手命令

| status | 接手动作 |
|---|---|
| `likely_done` | 报告 `observation` 够用就直接取结果；否则 `bsk observe --session <id>` 目检。已完成 → `bsk session stop <id>`；未完成 → 按 browser-skill 在原 session 逐轮做完剩余步骤，再 stop |
| `confirm_required` | `reason` 里写着要点的 `@eN` 和文本。把操作原样转述给用户征得同意 → `bsk observe --session <id>` 取新 ref → `bsk click @eN --session <id>` → 需要继续就 `--resume`，否则 stop |
| `text_value_unavailable` | `reason` 里有字段名。向用户要值（或从上下文取）→ `--resume <id> --values <名>=<值>` |
| `stuck` | 看报告 `steps` 最后几步点了什么、页面为何没变。能看出下一步 → 按 browser-skill 在原 session 接着做完（或推过卡点后 `--resume`），再 stop；看不出 → 问用户 |
| `max_steps` / `deadline` | 看进度：有进展 → `--resume` 加大 `--max-steps` / `--deadline-secs`，或按 browser-skill 在原 session 做完剩余步骤；在兜圈 → 问用户 |
| `blocked` | 按 `reason` 前缀处理：`sensitive_site` / `origin_exit` 问用户是否授权（`--allow-host` / `--allow-origin-exit`）；`credential_page` / 验证码 / 登录墙交用户在 Agent Window 里自己完成，之后 `--resume`；`sensitive_field` 交用户手动填。无 `session_id` 说明 session 还没开 |
| `error` | 看 `reason`；TypeSafe 401 = key 无效，bsk 报错按 browser-skill 的 environment / help-and-recovery 处理。有 `session_id` 先 stop |

## 报告字段

`report` 路径（UTF-8 JSON，位于系统临时目录的 `jev-browser-skill/` 下）：`status`、`reason`、`url`、`title`、`goal`、`session_id`、`elapsed_ms`、`jev_calls`、`usage`（token）、`steps`（每步 op / ref / label / ok / error / page_changed / jev_ms / confidence）、`observation`（最后一页的 VOM 原文，未打码，只在本机）。
