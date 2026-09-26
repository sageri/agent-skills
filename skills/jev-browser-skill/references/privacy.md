# 隐私边界

循环里每一步的页面 URL、标题和 VOM 快照（可见文本 + 元素名）都会发到 `api.typesafe.ai`（TypeSafe 托管、权重闭源）。所以敏感页面必须在**发送之前**被代码拦下，不靠提示词。规则都在 `scripts/loop.mjs` 顶部的常量里，改规则就改那里。

## 每步发送前的门禁（按顺序）

每步先 observe（等页面稳定）再判定下表；判定全过才调用 Jev。

| 门禁 | 判定 | 结果 |
|---|---|---|
| 协议 | 非 `http(s)` 页面（错误页、`chrome://` 等） | `blocked` |
| 敏感站点 `SENSITIVE_HOST` | 去掉顶级域后，主机名某一段（按 `.`/`-` 切分）是 bank、shinkin、smbc、mizuho、securities、nenkin、mynumber、e-tax、hospital、clinic、medical、login、signin、auth、sso、account(s)、id、wallet、pay 等 | `blocked: sensitive_site` |
| 内网 `INTRANET_HOST` | localhost、`0.0.0.0`、私有 IP、IPv6 字面量、无点的单段主机名、`.local` / `.internal` / `.intranet` / `.corp` / `.lan` / `.home.arpa` | `blocked: sensitive_site` |
| 起始站点锁 | 主机不等于起始站点（去掉 `www.`）且不是它的子域；如 `www.yahoo.co.jp` → `news.yahoo.co.jp` 放行 | `blocked: origin_exit`；`--allow-origin-exit` 关闭此锁 |
| 凭据页 | DOM 里有可见的 `input[type=password]` | `blocked: credential_page`，页面文本不发送 |

起始 URL 在开 session 之前就先过一遍前三道。

## 动作级门禁

- `--values` 的**值**永不发送：页面快照、URL、标题、下拉选项文本、历史里出现的值都替换成 `<value:名字>`（值短于 3 字符时只替换字段值位置）。Jev 只选"填哪个名字"。
- 敏感字段 `SENSITIVE_FIELD`（password、pin、暗証、card、クレジット、cvv、有効期限、口座、マイナンバー、otp…）：对输入框的 label、name、placeholder、id、autocomplete 及所在容器的周边文本判定，另外 autocomplete 为 `cc-*` / `*password` / `one-time-code` 也算；select 判定其 label。命中即 `blocked: sensitive_field`，绝不 fill。
- 不可逆操作 `COMMIT_WORDS`（送信、購入、注文、削除、確認、確定、支払、予約、登録、pay、send、delete、submit、book、checkout、order…）：点击目标的名字命中即 `confirm_required`，不点击。button 一律严格；link 名字另含「履歴 / 一覧 / 状況 / 照会 / history / status / list」且不含破坏性词（削除、解約、キャンセル、delete、remove、clear、cancel…，见 `DESTRUCTIVE`）时视为浏览放行（「ご注文履歴を確認する」放行，「閲覧履歴の削除」照拦）。宁可误停也不误点，误停只是一次 hand-back。

## 白名单

`--allow-host <host>`（可重复）让指定主机名跳过敏感站点与内网两道门禁，只对本次调用生效。用于用户明确同意的场景，例如本机测试页 `--allow-host 127.0.0.1`。它不放行凭据页、敏感字段和不可逆操作。
