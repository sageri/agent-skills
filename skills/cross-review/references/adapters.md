# Adapters — 四 CLI 无头审核调用契约

> 复制自 `agent-cli-dispatch/references/adapters.md`（2026-09-19），按 cross-review 只读审核场景裁剪；上游契约变更（CLI 升级、gotcha 修正）须手工同步本文件。裁剪范围：去掉写类派发（write_scope 执行、预算硬闸细则、FIX/resume 会话延续、新 CLI 适配模板），命令块与保留 gotcha 逐字照搬。取舍记录在作者私有仓库的 ADR-0003（Update 段）。
>
> **已与上游分叉（2026-09-22）**：送审包传参方式——codex 改 stdin、agy 改 `$(cat)`/文件双通道（送审包内联 diff 与译文全文，单引号无法避免；上游八字段任务包不含单引号，无需同改）。同步上游时保留本段分叉，勿覆盖。
>
> **已与上游分叉（2026-10-11）**：外审模型/effort 钉死——agy `gemini-4-hydrogen-high`、codex `gpt-6.1-sol`＋low（2026-11-07 由 medium 下调，同时成为默认外审者）、claude `claude-opus-5-5`＋medium；上游按任务复杂度路由档位。同步上游时保留本分叉，勿覆盖。
>
> **已与上游分叉（2026-11-21）**：CodeBuddy 段的只读手段——上游 worker 带 `-y` 自动批准，本文件改为 `--tools "Read,Grep,Glob"` 只挂只读工具、`--strict-mcp-config` 不加载 MCP。同步上游时保留本分叉，勿覆盖。
>
> **已与上游分叉（2026-11-22）**：agy >30K 送审包走 stream-json 输入通道（上游 dispatch 为小任务包 argv 直传，无此分支；原 dp-packet 文件通道作废）。同步上游时保留本分叉，勿覆盖。
>
> **已与上游分叉（2026-11-22）**：新增 Qoder 段——正文与上游 dispatch adapters 同源，差异只在只读调用参数（`--tools` 只挂 Read/Grep/Glob ＋ `--strict-mcp-config` 不加载 MCP；上游 worker 为 `--dangerously-skip-permissions` 全放行）。同步上游时保留本分叉，勿覆盖。
>
> **已与上游分叉（2026-11-25）**：新增 pi 段——上游无此 CLI；只读手段同 CodeBuddy/Qoder 思路（`-t` 只挂 read,grep,find,ls ＋ `--no-mcp` 不连 MCP）。同步上游时保留本分叉，勿覆盖。
>
> **已与上游分叉（2026-11-26）**：新增 dsh 段——正文与上游 dispatch adapters 同源，差异只在只读调用参数（`--permission-mode read-only --approval-policy never`；上游 worker 为 workspace-write）。同步上游时保留本分叉，勿覆盖。

## Claude Code

```bash
# ① 探测
claude --version                    # 存在性
echo "Reply with exactly: pong" | claude -p --output-format json --permission-prompts none 2>&1 | head -c 600   # 无头+登录态一次验证

# ② 无头审核调用（prompt 一律走 stdin，绝不作 positional 参数；模型/effort 钉死，2026-10-11 实测）
claude -p --output-format json --permission-prompts none --restricted --model claude-opus-5-5 --effort medium < packet.md
# --restricted：砍执行类工具与 WebFetch、留检索与文件工具、文件工具限工作目录——审核者只读的执行手段

# ③ 输出契约（实测 2.1.235 / 2.1.259）
# json：单 JSON 对象——result（回复文本=审核结果所在）、is_error、session_id、total_cost_usd、
#       permission_denials[]（被自动拒的操作清单）
# 审核结果在 result 字段内按 SKILL.md「审核结果」格式解析
```

- 模型：固定 `claude-opus-5-5` ＋ effort `medium`（Opus 5.5 默认 effort 即 medium，显式传防本机配置漂移）
- **模型别名随 CLI 版本冻结（2026-09-23 实测 2.1.280）**：`opus`→`claude-opus-5-5`、`sonnet`→`claude-sonnet-5`；2.1.278 的 `opus` 仍解析旧 `claude-opus-5`，显式传 `claude-opus-5-5` 直接 400（须 CLI ≥2.1.280）——命令已显式钉 `claude-opus-5-5`，模型换代后先 `claude update`，再更新此处钉死 ID
- **stdin 硬约束**：`--allowedTools / --tools / --add-dir / --mcp-config / --file` 均为变长参数，会静默吞掉紧随其后的 positional prompt（实测真 bug）——送审包写临时文件后 `<` 重定向传入，命令行里不出现 prompt 参数
- **`--permission-prompts none` 必带**：无头安全阀——会弹权限的操作被自动拒并记入 `permission_denials[]`，而非挂起等输入
- **权限模式**：权限行为受本机 settings.json 漂移影响，调用参数须显式钉全（工具开关写在命令行）
- 工作目录：无头调用继承当前工作目录
- **成本 gotcha（2026-09-03 实测，直连 Anthropic 官方）**：每次无头调用注入大系统上下文（cache_creation ~25k tokens）。pong 级成本 2.1.259 实测 $0.011-0.023/次（钉 opus-5-5 后 2026-10-11 实测 ~$0.19/次）——usage 汇总用 `total_cost_usd` 字段实测监控
- 跑飞防护可选：`--max-budget-usd <amount>` 超预算硬停（exit=1、is_error）

## Codex

```bash
# ① 探测
codex --version
codex exec "Reply with exactly: pong" --skip-git-repo-check 2>&1 | head -c 600   # 无头+登录态一次验证

# ② 无头审核调用（模型/effort 钉死：gpt-6.1-sol＋low，2026-11-07 由 medium 下调；-s read-only 锁死只读——codex 默认 workspace-write，会破坏审核者只读）
# 送审包写临时文件后走 stdin（`-` ＝从 stdin 读 prompt；2026-09-22 实测引号/中文/反引号/$/反斜杠逐字保真）
codex exec - --skip-git-repo-check -s read-only -m gpt-6.1-sol -c model_reasoning_effort="low" --json < packet.md

# ③ 输出契约（0.150 实测）
# --json 输出 NDJSON 事件流；终态回复文本在最后一个 item.type=agent_message 的 item.completed 事件的 item.text（=审核结果所在）
# 流里可能有多个 item.completed（如 error 类的 skills 预算警告）——取最后一个 agent_message，别取第一个
# thread.started 事件带 thread_id；turn.completed 事件带 usage
# （input_tokens / cached_input_tokens / output_tokens / reasoning_output_tokens）
# stdout 混有宿主 hook 行，人工读时过滤
# 无 JSON 时降级：text stdout 直接作为审核结果解析
```

- **信任目录 gotcha（实测 0.148.0）**：非 git 信任目录下 `codex exec` 直接拒绝（"Not inside a trusted directory and --skip-git-repo-check was not specified"）——无头调用**必须带 `--skip-git-repo-check`**
- 模型：固定 `gpt-6.1-sol`（复杂/深度分析）＋ effort `low`（可用档位 low/medium/high/xhigh）；~1.05M 上下文
- 登录态：codex 账号登录一次即可；探测失败按"CLI 不可用"处理

## Antigravity CLI（agy）

```bash
# ① 探测
agy --version
agy -p "Reply with exactly: pong" --output-format json 2>&1 | head -c 600   # 无头+登录态一次验证

# ② 无头审核调用（模型钉死：gemini-4-hydrogen-high；effort 走 ID 后缀或独立 --effort 皆可；--print-timeout 见下方条目）
# 送审包 ≤30K 字符：命令替换把整个文件作单个 argv 元素，对包内任意引号免疫
agy -p "$(cat packet.md)" --mode plan --model gemini-4-hydrogen-high --output-format json [--print-timeout 9m]
# 送审包 >30K 字符（Windows argv 上限 ~32K）：全文走 stream-json 输入通道，不给 -p（给了报错）；
# 2026-11-22 实测 62KB 全量送达（标记/计数全对）；文本 stdin（-p -）不可靠，勿用
python -c "import json,sys;print(json.dumps({'event':'user','message':{'role':'user','content':[{'type':'text','text':open(sys.argv[1],encoding='utf-8').read()}]}},ensure_ascii=False))" packet.md \
  | agy --input-format stream-json --output-format stream-json --mode plan --model gemini-4-hydrogen-high [--print-timeout 9m]
# 包尾放校验串并按 SECTION 分块，包尾指令回复首行 Read-Check:、第二行 SECTIONS:（判据见下方「大包校验」）
# ≤30K 内联分支实跑（2026-09-22）：单/双引号、中文、$VAR 字面量、反引号回复中逐字保真（3.9s）

# ③ 输出契约：单 JSON 对象（官方 headless 文档；2026-11-22 1.5.13 复核）
# 字段：conversation_id, status(SUCCESS/ERROR/失败态), response(审核结果所在), duration_seconds,
#       usage(input/output/thinking/cache_read/total tokens 字典), num_turns
#       失败态另带 error / finished_reason（如 print_timeout）；被拒操作在 denied_actions[]（如 {"action":"mcp"}）
# stdout=响应，stderr=诊断（错误/认证/权限提示）——配额识别看 stderr
```

- 模型：固定 `gemini-4-hydrogen-high`（`agy models` 2026-11-25 实列 10 个：gemini-4-hydrogen low/medium/high/xhigh、gemini-3.8-flash high/medium/low、claude-sonnet-4-6、claude-opus-4-6-thinking、gpt-oss-120b-medium——不指定即跟账号默认走）；effort 走模型 ID 后缀或独立 `--effort`（low～max）皆可；消耗 Google AI 订阅计算预算额度（5h 窗口），非免费
- **`--print-timeout`（2026-11-22 复核，行为已变）**：默认不限时。到期＝exit 3 + `status:"ERROR"` + `response:""`（stderr `AGY_ERROR`，`finished_reason:"print_timeout"`）——旧版「exit 0 + SUCCESS + 部分输出」已废除，按显式失败走降级链。真正的上限是宿主前台命令超时（Claude Code Bash 最长 10 分钟）：显式传值须低于它（如 9m），预估更长则后台调用
- **前置条件**：必须先交互式 `agy` 登录过一次（缓存凭据）；无终端环境未登录时直接报 `authentication required` 而非挂起——探测时注意区分
- **MCP auto-deny 吞任务（2026-09-22、2026-11-22 复核，同形，与上游同步）**：全局 `~/.gemini/config/mcp_config.json` 注入的 MCP 服务器对审核者可见，agy 可能主动调用 MCP 工具；无头下 `mcp` 权限无 allow 规则即 auto-deny，**任务不执行但返回 `status:"SUCCESS"` + 空 response**（`denied_actions` 含 `{"action":"mcp"}`，stderr 有 `no output produced — a tool required the "mcp" permission`）——空 response 按解析失败走降级链。规避：送审包 persona 写明"禁止调用任何 MCP 工具，只用内置工具"（实测加此指令后成功）
- **cwd（2026-11-22 复核）**：旧行为「无头时 cwd 锚定 trusted workspace 根、不跟随子进程 cwd」已不复现；送审包内文件路径仍一律写绝对路径，不依赖 cwd 相对解析
- **审核调用一律 `--mode plan`（2026-10-10 实测）**：不加时 agy 会在 workspace 根写临时文件（曾一次留下 18 个 `temp_*.txt`），persona 的「只读」挡不住；plan 模式下读文件、`git log` 等只读命令正常，写文件被拒
- **大包校验（>30K 时）**：送审包末尾放随机校验串（如 `RC-E06299`），包内按 `## SECTION n` 分块，包尾指令回复首行 `Read-Check:`、第二行 `SECTIONS:`。解析时先核这两行（计数须通读才答得对，防只读末尾），两行都对上才剥掉、再按 `Status:` 解析；任一对不上＝审核失败走降级链
- **文本 stdin 不可靠（2026-09-22 初测 / 2026-11-22 复核）**：`-p -` / `--print=-` 只偶发送达，多数失败（空 response、复读原文、答非所问），失败时疑似静默续上最近会话——回包必须核对是否在答本任务。可靠 stdin 通道是 `--input-format stream-json`（消息 schema 见 ② 代码块），>30K 已改走该通道（见头部 2026-11-22 分叉说明）
- dot 前缀路径：2026-09-03 曾拒绝 dot 前缀祖先目录作工作区，1.5.13 复核不复现；`.cross-review/` 内产物仍一律内联进送审包（自包含，不依赖路径行为）
- **Git Bash gotcha（实测复核）**：Git Bash 下无头调用正常（首次偶发挂起为冷启动）；探测建议加 60s 超时上限，挂起时重试一次再定性
- 权限：无头下未匹配 allow 的操作 auto-deny（读文件被拒时输出为空或失败态，走降级链）

## CodeBuddy CLI（codebuddy / cbc）

```bash
# ① 探测
codebuddy --version
echo "Reply with exactly: pong" | codebuddy -p --output-format json --tools "" --max-turns 1   # 无头+登录态一次验证
# 判定：result trim 后＝pong、is_error=false、stderr 无连接/认证错误——连接失败时 exit 仍为 0，只看退出码必误判

# ② 无头审核调用（模型/effort 沿用上游 worker 默认 deepseek-v4.1-flash＋max；送审包走 stdin）
codebuddy -p --output-format json --model deepseek-v4.1-flash --effort max \
  --tools "Read,Grep,Glob" --strict-mcp-config --max-turns 20 < packet.md
# --tools 只挂只读内置工具（无 Write/Edit/Bash）——审核者只读的执行手段；--strict-mcp-config 不带 --mcp-config ＝不加载任何 MCP

# ③ 输出契约（2.185.0 实测）
# json：事件数组，取最后一个 type:"result" 对象（兼容直接返回单个终态对象的版本）
# 字段：result（审核结果所在）、is_error、session_id、total_cost_usd、permission_denials、usage
# 审核结果在 result 字段内按 SKILL.md「审核结果」格式解析
```

- **只读实测（2026-11-21，2.185.0）**：上述参数下读文件正常；要求写文件时模型自报只有 Read/Glob/Grep、目标文件未生成。`permission_denials=[]` 不证明未写，只读性以工具挂载为准
- **stdin 保真（2026-11-21 实测）**：40K 字符/700 块送审包经 stdin 计数与末尾校验串全中；中文、单双引号、反引号、`$VAR`、反斜杠逐字保真——无 argv 上限，不需要 agy 的 30K 分流
- 模型：`--model` 可选值见 `--help`（hy4 / deepseek / glm / kimi / minimax 等）；effort 档位 minimal/low/medium/high/xhigh/max
- usage：`total_cost_usd` 实测为 0（不代表订阅实付），原样记 `usage` token 字段
- `--max-turns` 限的是 agent 轮数，不是金额；审核通读大文件时轮数耗尽会提前返回，解析不出 `Status` 即走降级链

## Qoder CN CLI（qoderclicn）

依据：2026-11-22 本机 1.1.95 实测（`--help` 与 [cli-reference](https://docs.qoder.cn/cli/cli-reference)、[run-in-scripts](https://docs.qoder.cn/cli/run-in-scripts) 一致）。命令行形态与 Claude Code 同源，用量字段换成 Credits。

```bash
# ① 探测
qoderclicn --version
echo "Reply with exactly: pong" | qoderclicn -p -o json 2>&1 | head -c 600   # 无头+登录态一次验证

# ② 无头审核调用（模型/effort 钉死：Qwen3.8-Flash＋high；送审包走 stdin）
qoderclicn -p -o json -m Qwen3.8-Flash --reasoning-effort high \
  --tools=Read,Grep,Glob --strict-mcp-config --max-turns 20 < packet.md
# --tools 只挂只读内置工具（无 Write/Edit/Bash）——审核者只读的执行手段；
# --strict-mcp-config 不带 --mcp-config ＝不加载任何 MCP；--max-turns 是隐藏参数（--help 未列，实测可用）

# ③ 输出契约（1.1.95 实测）
# json：单 JSON 对象——type:"result"、subtype:"success"、result（审核结果所在）、is_error、num_turns、
#       permission_denials[]、session_id、total_credits、modelUsage{<内部别名>:{credits}}
#       usage 的 token 全为 0（仅 context_usage_ratio 有值）→ token 记 n/a；total_cost_usd 恒 0
# 审核结果在 result 字段内按 SKILL.md「审核结果」格式解析
```

- **只读实测（2026-11-22，1.1.95）**：上述参数下 Read 正常（读回指定文件内容、`num_turns=2`）；要求建文件时模型自报只有 Read/Glob/Grep、目标文件未生成
- **权限记录**：默认 mode 下 headless 的 ask 转 deny 并写入 `permission_denials`（实测 Write 被拒，条目含 `tool_name` / `tool_use_id` / `tool_input.file_path`）——可作事后核对
- **stdin 保真（2026-11-22 实测）**：73KB / 200 段送审包经 stdin 全量送达（末尾标记与段数计数全对），中文、单双引号、反引号、`$VAR`、反斜杠逐字保真——无 argv 上限，不需要 agy 的 30K 分流
- **模型名写错不报错**：`-m` 传不存在的名字时只 stderr 警告 `Model "X" is not available right now; using "auto" instead`，退出码 0、`is_error=false`——外审后核对 `modelUsage` 的键（`qfmodel`＝Qwen3.8-Flash 等内部别名）确认没落到 auto
- **会话 id**：`--session-id` 只用于新建会话预指定，对已存在 id 再传＝stderr `Session ID ... is already in use`；本 skill 外审不复用会话，忽略此项
- **成本（pong 单次实测）**：Qwen3.8-Flash＋high 0.584 credits（Auto 0.145、Qwen3.8-Max＋high 6.33）；只记 `total_credits`，不折算 USD
- **前置条件**：需已登录（`qoderclicn login` 或 `QODERCN_PERSONAL_ACCESS_TOKEN`）；未登录时 `--list-models` 报 `Not logged in`
- **无 `--json-schema`**：结构化结果包只能解析 `result` 文本
- **Windows**：`qoderclicn.exe` 由安装脚本放到 `%USERPROFILE%\.qoder-cn\bin\qoderclicn`；Git Bash 下用 `qoderclicn`，`qodercn` 是 `.cmd` shim、Bash 里找不到

## pi（pi-coding-agent）

依据：2026-11-25 本机 1.6.0 实测（npm 全局包 `@earendil-works/pi-coding-agent`；模型经本地 9router，`--list-models` 实列仅 `9router/ComboToCodex`，后端以终态 `responseModel` 为准）。

```bash
# ① 探测
pi --version
pi -p --mode json --no-session -t read,grep,find,ls --no-mcp --no-extensions --no-context-files --model 9router/ComboToCodex "Reply with exactly: pong" > probe.json 2>probe-stderr.log
# 判定：exit=0、末 assistant 事件 content[].text=pong、stopReason=stop

# ② 无头审核调用（模型/effort 钉死：9router/ComboToCodex，--thinking 不传（默认 high）；送审包走 stdin 或 @file，73KB 实测保真）
pi -p --mode json --no-session -t read,grep,find,ls --no-mcp --no-extensions --no-context-files --model 9router/ComboToCodex < packet.md > review-raw.json 2>review-stderr.log
# -t 白名单只挂只读工具（无 write/edit/bash）——审核者只读的执行手段；--no-mcp 不连任何 MCP server；
# --no-extensions 禁扩展（本机装了 context-mode/pi-web-access 等带执行面工具的扩展）；--no-context-files 不加载 cwd 的 AGENTS.md/CLAUDE.md（防仓库规则与自包含送审包冲突）

# ③ 输出契约（--mode json＝NDJSON 事件流）
# assistant 终态在 role:"assistant" 的 message 事件：content[].text（审核结果所在）、
# usage{input,output,cacheRead,cacheWrite,reasoning,totalTokens,cost.total=0}、stopReason、
# responseModel（后端真实模型名）、durationMs、thinkingLevel（默认 high）
# 解析输出先落文件再读——stdout 进管道被截断会 EPIPE 崩溃
```

- **只读实测（2026-11-25，1.6.0）**：上述参数下读正常；要求建文件时模型自报 CANNOT、目标文件未生成（`-t` 未挂 write/edit/bash；含 `--no-extensions`/`--no-context-files` 的完整旗标组合当日复测通过）。扩展自带工具未逐个只读验证——隔离靠 `--no-extensions` 整体排除，不依赖逐工具判定
- **无 permission_denials 字段**：被拒动作表现为工具未挂载（模型自述无法执行）——判定以产物实物为准
- **无静默回退**：`--model` 写错＝硬报错 exit=1（`Error: Model "X" not found`）
- **stdin 保真（2026-11-25 实测）**：73KB / 200 段送审包经 stdin 全量送达（末尾标记与段数计数全对），中文、单双引号、反引号、`$VAR`、反斜杠逐字保真；`@file` 附件通道同过——无 argv 上限，不需要 agy 的 30K 分流
- **usage 记 `usage.totalTokens`**（input/output/cacheRead/reasoning 分项）；`cost.total` 恒 0（9router 本地代理）→ USD 记 n/a
- **thinking 默认 high**：无头不传 `--thinking` 时 reasoning tokens 常开；压成本显式传 `--thinking low`

## dsh（DeepSeek Harness）

依据：2026-11-26 本机 0.2.2-rc.5 实测。无头走 `headless` profile，**没有 `--model`/`--effort` 参数**——模型经 `--patch` overlay 钉死；provider `theturbo` 与模型定义在用户层 `~/.dsh/profiles/headless/cordis.patch.yml`（该层自带 max，勿改，靠 overlay 覆盖）。

```bash
# ⓪ 模型 overlay（与送审包同一临时目录；钉死 deepseek-v4.1-flash＋high）
cat > dsh-model.patch.yml <<'EOF'
- id: agent-default-model
  config:
    provider: theturbo
    model: deepseek-v4.1-flash
    reasoningEffort: high
EOF
# ① 探测
dsh --version
echo "Reply with exactly: pong" | dsh headless --patch ./dsh-model.patch.yml --json --permission-mode read-only --approval-policy never - > probe.json 2>probe.err
# 判定：exit=0、末行 type:"final" 的 reason.kind="completed" 且 text=pong

# ② 无头审核调用（送审包走 stdin，`-` 读 stdin）
dsh headless --patch ./dsh-model.patch.yml --json --permission-mode read-only --approval-policy never - < packet.md > review-raw.json 2>review-stderr.log
# read-only＝沙箱拒写；--approval-policy never＝不升级权限、不卡在审批

# ③ 输出契约（--json＝NDJSON 事件流）
# 审核结果取末行 type:"final" 的 text；reason.kind = completed | error（error 带 {message, code}）
# 用量：各 status/step_end 事件的 usage{inputTokens,outputTokens,totalTokens,cacheReadTokens} 累加；无 USD 字段
```

- **只读实测（2026-11-26）**：上述参数下要求用文件工具建文件，tool_result 报 `file access denied under read-only mode`、文件未生成；改让 pwsh 工具执行 `Set-Content`，被受限语言模式拦下（InvalidOperation）、文件同样未生成。只验证了文件工具与 pwsh 两条写入面；无 permission_denials 汇总字段——判定以产物实物为准
- **模型核对**：事件流不回显模型名/effort；需要时 `dsh headless --patch ./dsh-model.patch.yml --dump-config | grep -A5 agent-default-model` 核对。模型名写错＝硬报错 exit=1（`UNKNOWN_MODEL`），无静默回退
- **未隔离面**：headless profile 默认挂 web fetch/search 工具（可对外发请求），read-only 只管本机写入；`--dump-config` 里只有 `mcp-resources` 插件、未见 MCP server 配置（未逐项验证）。送审包须自包含，不依赖联网
- **厂商**：DeepSeek，与 codebuddy 默认模型同厂同模型——降级在二者间切换不算换厂

## Windows 注意事项

- 送审包一律先写临时文件：claude / codex / codebuddy / qoder / pi / dsh 走 stdin 重定向；agy ≤30K 走 `"$(cat packet.md)"`、>30K 走 stream-json 输入通道——包内单引号无需回避
- Windows 单个命令行上限 ~32K 字符（CreateProcess），这是 agy 30K 分流线的来由
- PowerShell 手动复现时：多行包先写临时文件再 `Get-Content -Raw` 传入，绕开引号转义
- 送审包内路径统一正斜杠写（CLI 在 Windows 上均接受）
- 命令示例按 Git Bash 语法给出（`head` 等）；在其他 shell（PowerShell / cmd）下执行时自行等价改写
