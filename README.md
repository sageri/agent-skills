# Agent Skills 🧩

> **Make your AI coding assistant not just capable, but genuinely useful.**
> Four ready-to-use Skills: browser automation, cross-model review, pre-writing, and Xiaohongshu / WeChat article reading.
> Claude Code · Codex · ZCode · and any AI that can load Skills.

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)　　⭐ **If this helps you, a Star means a lot to an open-source author.**

---

## ✨ Why these Skills?

You've probably been here:

- 🤖 You ask your AI to click through a website. It clicks, thinks a whole round, clicks again… 7 clicks, one full minute
- 👀 Something about the code you just wrote feels off, but you can't spot it
- ✍️ Three hours on the title, and the body is still empty
- 📱 You hand your AI a Xiaohongshu link, and it can't read a word of it

These four Skills are built for exactly those moments.

> The skill instructions are written in Chinese. Agents follow them fine, and you can talk to your agent in English.

---

## 🚀 At a glance

| Skill | In one line | How to trigger |
|---|---|---|
| 🖱️ **[jev-browser-skill](#jev-browser-skill)** | Squeeze a multi-step browser task into one call, **about 3× faster** | `/jev-browser-skill` |
| 🛡️ **[cross-review](#cross-review)** | A second AI reviews every step, read-only, and catches your blind spots | say "双审" or `/cross-review` |
| 🗺️ **[prewrite](#prewrite)** | Turn a tangle of ideas into a map you can start writing from | automatic, or `/prewrite` |
| 📰 **[read-article](#read-article)** | Xiaohongshu / WeChat articles → clean Markdown | automatic when you paste a link |

---

## 📦 Install

```bash
npx skills add sageri/agent-skills -s jev-browser-skill -g
```

Replace `jev-browser-skill` with any skill name, or use `-s '*'` to install all four. `-g` installs for your user; drop it to install into the current project.

---

<a id="jev-browser-skill"></a>

## 🖱️ jev-browser-skill: browser automation **without the stop-and-go**

When an agent drives a browser step by step, every single click costs your main model a full round: read a large page snapshot, think, act, repeat.

This skill hands the whole sub-task to a small loop script. At each step it asks [TypeSafe Jev](https://docs.typesafe.ai) (a fast judgment model that returns typed choices in a few hundred milliseconds) which element to act on, then executes it through [Tencent BrowserSkill](https://github.com/Tencent/BrowserSkill) (bsk) in **your real, logged-in browser**.

```bash
node <skill-dir>/scripts/loop.mjs \
  --url https://transit.yahoo.co.jp/ \
  --goal "乗換案内で、出発に from、到着に to を入力し、日時を 2026年9月27日 9時00分 出発に設定して検索する" \
  --values from=川崎,to=大阪 \
  --expect-url 'search/result.*d=27&hh=09&m1=0&m2=0'
```

> Write the goal in plain language, in any language (this one says: enter `from` and `to`, set departure to 2026-09-27 09:00, search). You rarely type this yourself: run `/jev-browser-skill <task>` and your agent writes the command for you.

### ⚡ Measured on real websites

*Same machine, same tasks, end-to-end wall-clock time (a small sample, not a formal benchmark):*

| Task | Agent, step by step | jev-browser-skill | Speedup |
|---|---|---|---|
| Yahoo! News: top 3 headlines | 5 calls · 68 s | 1 call · 6–12 s | **🚀 ~6–11×** |
| Yahoo! Transit: route by date and time | 7 calls · 54 s | 1 call · ~17 s | **🚀 ~3×** |
| Yodobashi: my 3 most recent purchases | 8 calls · 53 s | 1 call · ~19 s | **🚀 ~3×** |

### 🔒 Safety lives in code, not in prompts

Every guard runs **before page content leaves your machine**:

- 🚫 Banks, medical sites, login pages, company intranets, and any page showing a password field are stopped before anything is sent to the model
- 🚫 Values passed with `--values` are never sent to Jev; it only sees the field names
- 🚫 Irreversible clicks (buy, send, delete, submit…) stop and ask you first
- 🚫 Sensitive fields (card numbers, PINs…) are never filled
- ✅ Whether the task is done is decided by your `--expect-url` / `--expect-text` assertions, never by asking the model "are you done?"

When the loop can't finish, it hands back with a **typed status** (`confirm_required` / `text_value_unavailable` / `stuck` / `blocked` …) and keeps the browser session open, so your agent or you can pick up exactly where it stopped with `--resume`.

**Requirements:** [BrowserSkill](https://github.com/Tencent/BrowserSkill) (bsk CLI + browser extension + browser-skill skill), Node.js 18+, and the `TYPESAFE_API_KEY` environment variable. Zero npm dependencies. Page text is sent to the TypeSafe API; see [privacy](skills/jev-browser-skill/references/privacy.md). Ported from [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast).

---

<a id="cross-review"></a>

## 🛡️ cross-review: a second AI **reviews every step, read-only**

> Nobody can review their own blind spots.

Your main agent does the work while a different AI CLI reviews it read-only, and every finding gets an explicit "**accept / reject + reason**". Problems a single model misses get caught, and the reviewer never touches your files.

- 🧱 **Code tasks**: a five-stage pipeline (requirements → architecture → spec → implementation + tests → verification), with a review gate after each stage and your own sign-off on the spec
- 📝 **Non-code deliverables** (translations, reports, slides): one review gate on the finished product
- 📂 **Existing work**: point it at a design doc, a diff, or test results and review just that
- 👥 **Exactly one reviewer per gate**: `agy` (Antigravity CLI) by default; you can name `codex` or `claude`, and it switches to the next one automatically if a CLI call fails
- 📁 Review packets, raw reviews, verdicts, and token usage are all saved under `.cross-review/`, so every decision is traceable

**Requirements:** at least one of the `agy`, `codex`, or `claude` CLIs installed and logged in.

---

<a id="prewrite"></a>

## 🗺️ prewrite: turn a tangle of ideas into **a map**

> Can't write the first sentence? Don't write yet.

prewrite first figures out where you're stuck, then hands you **a map**, not a ghost-written draft:

- 🧱 **Can't get started** → brain-dump first: it stays quiet while you write, then helps you pull out what matters
- 🌪️ **Too much material, no through-line** → KJ clustering, or four-layer distillation down to a single sentence
- 🎯 **You have a point but can't explain it** → three gates: sharpen the claim, build the logic chain, stress-test it

✨ One question at a time; every heading is written as a claim **someone could disagree with**. Unless you explicitly ask, it **won't write the body for you**.

> ℹ️ Not meant for polishing an existing draft.

---

<a id="read-article"></a>

## 📰 read-article: Xiaohongshu / WeChat → Markdown

> Paste a link, get clean Markdown.

You get the title, author, date, full text, and direct image / video links. Your agent then reads or summarizes it for you.

- 🍪 No login cookie needed
- 🏠 Both platforms block cloud IPs, so it **runs on your own machine**
- 🐍 Only 4 dependencies: `requests`, `beautifulsoup4`, `curl_cffi`, `markdownify`

```bash
pip install requests beautifulsoup4 curl_cffi markdownify
```

> 📌 Xiaohongshu links must be full share links from the app (with `xsec_token`). An optional cookie (`XHS_COOKIE` environment variable or `~/.xhs-cookie.txt`) makes fetching more reliable.

⚠️ **Disclaimer:** this skill fetches pages by mimicking a mobile client and browser fingerprint, which may conflict with the platforms' terms of service. For personal study only; use at your own risk.

---

## 🤝 Help make it better

Found a bug, have an idea, or want to contribute a skill of your own? Welcome:

- 🐛 [Open an issue](https://github.com/sageri/agent-skills/issues)
- 🔀 [Send a pull request](https://github.com/sageri/agent-skills/pulls)

---

## 📜 License

[MIT](LICENSE)

---

<sub>If this project helped you, **click the ⭐ Star in the top-right corner**: it's what keeps open-source authors writing. And feel free to share it with friends who code, build products, or have suffered through "7 clicks, one whole minute."</sub>
