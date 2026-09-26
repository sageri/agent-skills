# Adapters — 三 CLI 无头审核调用契约

> 复制自 `agent-cli-dispatch/references/adapters.md`（2026-09-19），按 cross-review 只读审核场景裁剪；上游契约变更（CLI 升级、gotcha 修正）须手工同步本文件。裁剪范围：去掉写类派发（write_scope 执行、预算硬闸细则、FIX/resume 会话延续、新 CLI 适配模板），命令块与保留 gotcha 逐字照搬。取舍记录在作者私有仓库的 ADR-0003（Update 段）。
>
> **已与上游分叉（2026-09-22）**：送审包传参方式——codex 改 stdin、agy 改 `$(cat)`/文件双通道（送审包内联 diff 与译文全文，单引号无法避免；上游八字段任务包不含单引号，无需同改）。同步上游时保留本段分叉，勿覆盖。

## Claude Code

```bash
# ① 探测
claude --version                    # 存在性
echo "Reply with exactly: pong" | claude -p --output-format json --permission-prompts none 2>&1 | head -c 600   # 无头+登录态一次验证

# ② 无头审核调用（prompt 一律走 stdin，绝不作 positional 参数）
claude -p --output-format json --permission-prompts none --restricted < packet.md
# --restricted：砍执行类工具与 WebFetch、留检索与文件工具、文件工具限工作目录——审核者只读的执行手段

# ③ 输出契约（实测 2.1.235 / 2.1.259）
# json：单 JSON 对象——result（回复文本=审核结果所在）、is_error、session_id、total_cost_usd、
#       permission_denials[]（被自动拒的操作清单）
# 审核结果在 result 字段内按 SKILL.md「审核结果」格式解析
```

- 模型档位：`opus`（复杂）/ `sonnet`（常规）
- **模型别名随 CLI 版本冻结（2026-09-23 实测 2.1.280）**：`opus`→`claude-opus-5-5`、`sonnet`→`claude-sonnet-5`；2.1.278 的 `opus` 仍解析旧 `claude-opus-5`，显式传 `claude-opus-5-5` 直接 400（须 CLI ≥2.1.280）——模型换代后先 `claude update` 再派发，或显式传新代 ID 钉版本。Opus 5.5 默认 effort=medium（Opus 5 为 high），把关/思考档显式传 `--effort`
- **stdin 硬约束**：`--allowedTools / --tools / --add-dir / --mcp-config / --file` 均为变长参数，会静默吞掉紧随其后的 positional prompt（实测真 bug）——送审包写临时文件后 `<` 重定向传入，命令行里不出现 prompt 参数
- **`--permission-prompts none` 必带**：无头安全阀——会弹权限的操作被自动拒并记入 `permission_denials[]`，而非挂起等输入
- **权限模式**：权限行为受本机 settings.json 漂移影响，调用参数须显式钉全（工具开关写在命令行）
- 工作目录：无头调用继承当前工作目录
- **成本 gotcha（2026-09-03 实测，直连 Anthropic 官方）**：每次无头调用注入大系统上下文（cache_creation ~25k tokens）。pong 级成本 2.1.259 实测 $0.011-0.023/次——usage 汇总用 `total_cost_usd` 字段实测监控
- 跑飞防护可选：`--max-budget-usd <amount>` 超预算硬停（exit=1、is_error）

## Codex

```bash
# ① 探测
codex --version
codex exec "Reply with exactly: pong" --skip-git-repo-check 2>&1 | head -c 600   # 无头+登录态一次验证

# ② 无头审核调用（审核属深度分析，默认 sol＋high；-s read-only 锁死只读——codex 默认 workspace-write，会破坏审核者只读）
# 送审包写临时文件后走 stdin（`-` ＝从 stdin 读 prompt；2026-09-22 实测引号/中文/反引号/$/反斜杠逐字保真）
codex exec - --skip-git-repo-check -s read-only -m gpt-6-sol -c model_reasoning_effort="high" --json < packet.md

# ③ 输出契约（0.150 实测）
# --json 输出 NDJSON 事件流；终态回复文本在最后一个 item.type=agent_message 的 item.completed 事件的 item.text（=审核结果所在）
# 流里可能有多个 item.completed（如 error 类的 skills 预算警告）——取最后一个 agent_message，别取第一个
# thread.started 事件带 thread_id；turn.completed 事件带 usage
# （input_tokens / cached_input_tokens / output_tokens / reasoning_output_tokens）
# stdout 混有宿主 hook 行，人工读时过滤
# 无 JSON 时降级：text stdout 直接作为审核结果解析
```

- **信任目录 gotcha（实测 0.148.0）**：非 git 信任目录下 `codex exec` 直接拒绝（"Not inside a trusted directory and --skip-git-repo-check was not specified"）——无头调用**必须带 `--skip-git-repo-check`**
- 模型档位：`gpt-6-sol`（复杂/深度分析，审核首选配 high effort）/ `gpt-6-luna`（均衡省额，配 xhigh effort）；均 ~1.05M 上下文
- reasoning effort：low/medium/high/xhigh，按分析深度选
- 登录态：codex 账号登录一次即可；探测失败按"CLI 不可用"处理

## Antigravity CLI（agy）

```bash
# ① 探测
agy --version
agy -p "Reply with exactly: pong" --output-format json 2>&1 | head -c 600   # 无头+登录态一次验证

# ② 无头审核调用（预估 >5 分钟显式传 --print-timeout）
# 送审包 ≤30K 字符：命令替换把整个文件作单个 argv 元素，对包内任意引号免疫
agy -p "$(cat packet.md)" --output-format json [--print-timeout 16m]
# 送审包 >30K 字符（Windows argv 上限 ~32K）：落 <项目根>/dp-packet-<gate>.md（项目根＝trusted workspace，非点前缀），-p 只传 ASCII 短提示：
agy -p "Read the whole file <绝对路径，正斜杠> and follow it. Read-only: do not modify files. Do not call any MCP tool. First line of your reply: Read-Check: <file末尾校验串>. Second line: SECTIONS: <file中 SECTION 块数>. Then the review result." --output-format json [--print-timeout 16m]
# 用完删 dp-packet 文件；送审包原文照旧存 review-<gate>.md
# 2026-09-22 实测：41K 字符/83 块文件，--print 长形 16.8s、-p 短形 21.5s 均 SUCCESS，校验串与计数均命中，无 auto-deny；
# ≤30K 内联分支实跑：单/双引号、中文、$VAR 字面量、反引号回复中逐字保真（3.9s）

# ③ 输出契约：单 JSON 对象（官方 headless 文档）
# 字段：conversation_id, status(SUCCESS/失败态), response(审核结果所在), duration_seconds,
#       usage(input/output/thinking/cache_read/total tokens 字典), num_turns
# stdout=响应，stderr=诊断（错误/认证/权限提示）——配额识别看 stderr
```

- 模型：当前账号仅 Flash，无头调用**不指定模型参数**；消耗 Google AI 订阅计算预算额度（5h 窗口），非免费
- **`--print-timeout` 硬约束（2026-09-03 实测）**：默认 5m，到点 agy 主动 exit 1 + status ERROR——预估 >5 分钟的调用显式传（如 `--print-timeout 16m`）
- **前置条件**：必须先交互式 `agy` 登录过一次（缓存凭据）；无终端环境未登录时直接报 `authentication required` 而非挂起——探测时注意区分
- **MCP auto-deny 吞任务（2026-09-03 实测）**：全局 `~/.gemini/mcp_config.json` 注入的 MCP 服务器对审核者可见，agy 可能主动调用 MCP 工具；无头下 `mcp` 权限无 allow 规则即 auto-deny，**任务不执行但返回 `status:"SUCCESS"` + 空 response**——空 response 按解析失败走降级链。规避：送审包 persona 写明"禁止调用任何 MCP 工具，只用内置工具"（实测加此指令后成功）
- **cwd 锚定 trusted workspace 根（2026-09-03 实测）**：无头调用时 agy 把"当前工作目录"解析为 trusted workspace 根，不跟随子进程 cwd——送审包内的文件路径一律写绝对路径，不依赖 cwd 相对解析
- **文件通道校验（>30K 时）**：dp-packet 文件末尾放随机校验串（如 `RC-E06299`），包内按 `## SECTION n` 分块。解析时先核回复第一行 `Read-Check:` 与第二行 `SECTIONS:`（计数须通读才答得对，防只 grep 末尾），两行都对上才剥掉、再按 `Status:` 解析；任一对不上＝审核失败走降级链
- **`--print=-` 静默空转（2026-09-22 实测）**：`-` 被当字面 prompt、stdin 被完全忽略，返回 `status:"SUCCESS"`＋通用问候——agy 无文本 stdin（唯一 stdin 通道 `--input-format stream-json` 要换消息 schema，不用）
- 隐藏路径限制：agy 拒绝 dot 前缀祖先目录的工作区——`.cross-review/` 内产物一律内联进送审包，不传路径
- **Git Bash gotcha（实测复核）**：Git Bash 下无头调用正常（首次偶发挂起为冷启动）；探测建议加 60s 超时上限，挂起时重试一次再定性
- 权限：无头下未匹配 allow 的操作 auto-deny（读文件被拒时输出为空或失败态，走降级链）

## Windows 注意事项

- 送审包一律先写临时文件：claude / codex 走 stdin 重定向；agy 走 `"$(cat packet.md)"`（≤30K）或 dp-packet 文件通道（>30K）——包内单引号无需回避
- Windows 单个命令行上限 ~32K 字符（CreateProcess），这是 agy 30K 分流线的来由
- PowerShell 手动复现时：多行包先写临时文件再 `Get-Content -Raw` 传入，绕开引号转义
- 送审包内路径统一正斜杠写（CLI 在 Windows 上均接受）
- 命令示例按 Git Bash 语法给出（`head` 等）；在其他 shell（PowerShell / cmd）下执行时自行等价改写
