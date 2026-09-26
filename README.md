# agent-skills

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

Four practical **Agent Skills** (`SKILL.md`) for **Claude Code**, **Codex**, **ZCode**, and any AI coding agent that loads skills: a fast browser-automation loop, a cross-model review gate, a pre-writing coach, and a Xiaohongshu / WeChat article reader.

| Skill | One line | Trigger |
|---|---|---|
| [jev-browser-skill](#jev-browser-skill--browser-tasks-in-one-call) | Multi-step browser tasks in one script call, ~3× faster than step-by-step agent control | `/jev-browser-skill` |
| [cross-review](#cross-review--a-second-model-reviews-every-stage) | A second AI (agy / Codex / Claude) reviews each stage of your work, read-only | say "双审" or `/cross-review` |
| [prewrite](#prewrite--from-messy-ideas-to-a-writing-map) | Turn scattered ideas into a map you can start writing from | automatic, or `/prewrite` |
| [read-article](#read-article--xiaohongshu--wechat-to-markdown) | Xiaohongshu (RED) notes and WeChat articles → Markdown | automatic when you paste a link |

> The skill instructions are written in Chinese. Agents follow them fine in any language; you can talk to your agent in English.

## Install

Uses the [`skills`](https://www.npmjs.com/package/skills) CLI:

```bash
npx skills add sageri/agent-skills -s jev-browser-skill -g
```

Replace `jev-browser-skill` with any skill name, or pass `-s '*'` for all four. `-g` installs for your user; drop it to install into the current project.

---

## jev-browser-skill — browser tasks in one call

Driving a browser step by step makes your main model do a full round trip for every click: read a big page snapshot, think, act, repeat. This skill hands the whole sub-task to a small loop script instead. Each step asks **[TypeSafe Jev](https://docs.typesafe.ai)**, a fast judgment model that returns typed choices in a few hundred milliseconds, which element to act on, and executes it through **[Tencent BrowserSkill](https://github.com/Tencent/BrowserSkill)** (`bsk`) in your real, logged-in browser.

```bash
node <skill-dir>/scripts/loop.mjs --url https://transit.yahoo.co.jp/ \
  --goal "乗換案内で、出発に from、到着に to を入力し、日時を 2026年9月27日 9時00分 出発に設定して検索する" \
  --values from=川崎,to=大阪 \
  --expect-url 'search/result.*d=27&hh=09&m1=0&m2=0'
```

The goal is plain language in any language (this one says: enter `from` and `to`, set the departure to 2026-09-27 09:00, search). You normally don't type this yourself: invoke `/jev-browser-skill <task>` and your agent writes the call.

Measured on real sites (same machine, same tasks, wall-clock time; a small sample, not a benchmark suite):

| Task | Agent driving the browser step by step | jev-browser-skill |
|---|---|---|
| Yahoo! News: top 3 headlines | 5 model calls, 68 s | 1 call, 6–12 s |
| Yahoo! Transit: route search with date and time | 7 model calls, 54 s | 1 call, ~17 s |
| Yodobashi: latest 3 purchases | 8 model calls, 53 s | 1 call, ~19 s |

**Safe by construction.** Every guard lives in code, not in the prompt, and runs before any page content leaves your machine:

- Banks, medical sites, login pages, intranets, and anything with a visible password field are stopped before the page is sent to the model.
- Values you pass with `--values` are never sent to Jev; it only sees their names.
- Irreversible clicks (buy, send, delete, submit…) stop and ask. Sensitive fields (card numbers, PINs…) are never filled.
- Completion is checked by your `--expect-url` / `--expect-text` assertions, not by asking the model "are you done?"

When the loop cannot finish, it **hands back** with a typed status (`confirm_required`, `text_value_unavailable`, `stuck`, `blocked`…) and keeps the browser session open, so your agent or you can continue right where it stopped with `--resume`.

**Requires:** [BrowserSkill](https://github.com/Tencent/BrowserSkill) (`bsk` CLI + browser extension + `browser-skill` skill), Node.js 18+, and a `TYPESAFE_API_KEY` environment variable. No npm dependencies. Page text is sent to the TypeSafe API; see [privacy](skills/jev-browser-skill/references/privacy.md). Ported from [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast).

## cross-review — a second model reviews every stage

Your main agent does the work; a **different AI CLI reviews it read-only**, and every finding gets an explicit accept / reject verdict with a reason. Catch what a single model misses without letting the reviewer touch your files.

- **Code tasks:** a five-stage pipeline (requirements → architecture → spec → implementation + tests → verification) with a review gate after each stage and a user sign-off on the spec.
- **Non-code deliverables** (translations, reports, slides): one review gate on the finished product.
- **Existing work:** point it at a design doc, a diff, or test results and review just that.
- Reviewer: exactly one per gate. The default is `agy` (Antigravity CLI); you can name `codex` or `claude`, and it falls back automatically if a CLI fails.
- Every packet, raw review, verdict, and token usage is saved under `.cross-review/<task-id>/`, so each decision is traceable.

**Requires:** at least one of `agy`, `codex`, or `claude` CLI installed and logged in.

## prewrite — from messy ideas to a writing map

Stuck before the first sentence? prewrite finds out *why* you're stuck and gives you a map, not a draft:

- **Can't start** → brain-dump first; it stays quiet until you're done, then pulls out what matters.
- **Too much material** → cluster it (KJ method) or distill it in four layers down to one sentence.
- **Have a point but can't argue it** → three gates: sharpen the claim, build the logic chain, pressure-test it.

It asks one question at a time and writes every heading as a claim someone could disagree with. It won't write the article for you unless you ask. It isn't meant for polishing an existing draft.

## read-article — Xiaohongshu / WeChat to Markdown

Paste a **Xiaohongshu (小红书 / RED)** note or **WeChat Official Account (微信公众号)** article link and get clean Markdown: title, author, date, full text, and image / video URLs. The agent then reads or summarizes it for you. No login cookie needed; it runs from your own machine because cloud IPs are blocked by both platforms.

```bash
pip install requests beautifulsoup4 curl_cffi markdownify
```

Xiaohongshu links must be full share links from the app (with `xsec_token`). An optional cookie (`XHS_COOKIE` or `~/.xhs-cookie.txt`) improves stability.

> **Disclaimer:** this skill mimics a mobile client and browser fingerprint to fetch pages, which may conflict with the platforms' terms of service. For personal study only; use at your own risk.

---

## License

[MIT](LICENSE)
