---
tag:
  - type/cheatsheet
  - topic/ai-agent
related:
  - "[[claude-code-cheatsheet]]"
  - "[[cursor-cli-cheatsheet]]"
  - "[[herdr-cheatsheet]]"
---

# Pi Coding Agent Cheat Sheet

Reference for Pi, a minimal terminal coding harness. Installed via nixpkgs package `pi-coding-agent` (binary `pi`) in `home.nix`'s `home.packages`. Global instructions are symlinked from `home/AGENTS.md` to `~/.pi/agent/AGENTS.md`. Shared skills under `~/.agents/skills` are discovered natively.

Official docs: <https://pi.dev/> · source: <https://github.com/earendil-works/pi>

---

## Table of Contents

- [Installation & Authentication](#installation--authentication)
- [CLI Flags](#cli-flags)
- [Slash Commands](#slash-commands)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Context Files & Skills](#context-files--skills)
- [Packages & Extensions](#packages--extensions)
- [Common Workflows](#common-workflows)
- [Tips & Gotchas](#tips--gotchas)

---

## Installation & Authentication

Managed by this repo (Nix). After editing `home.nix`, run `./rebuild.sh`.

```bash
pi --version
pi                 # first run: /login to pick a provider, or export an API key
```

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or OpenAI / Google / etc. — see pi.dev providers docs
pi
/login             # OAuth for Claude Pro/Max, ChatGPT, Copilot, etc.
```

Config lives under `~/.pi/agent/` (`settings.json`, sessions, models, extensions). Override with `PI_CODING_AGENT_DIR`.

---

## CLI Flags

```bash
pi [options] [@files...] [messages...]
```

| Flag | Description |
|---|---|
| `pi` | Interactive TUI |
| `-p`, `--print` | One-shot: print response and exit |
| `--mode json` | JSONL event stream |
| `--mode rpc` | RPC over stdin/stdout |
| `--provider NAME` | Provider (anthropic, openai, google, …) |
| `--model ID` | Model id or `provider/id` (optional `:thinking`) |
| `--thinking LEVEL` | `off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` |
| `-c`, `--continue` | Continue most recent session |
| `-r`, `--resume` | Pick a previous session |
| `--session PATH\|ID` | Use a specific session |
| `--fork PATH\|ID` | Fork a session |
| `--no-session` | Ephemeral (don't save) |
| `-n`, `--name NAME` | Session display name |
| `-t`, `--tools LIST` | Allowlist tools (built-in: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) |
| `-xt`, `--exclude-tools LIST` | Disable specific tools |
| `-nbt`, `--no-builtin-tools` | Disable built-ins; keep extensions |
| `-nt`, `--no-tools` | Disable all tools |
| `-e`, `--extension PATH` | Load an extension (repeatable) |
| `--skill NAME` | Load a skill (repeatable) |
| `--no-skills` | Disable skill discovery |
| `-nc`, `--no-context-files` | Skip AGENTS.md / CLAUDE.md |
| `-a`, `--approve` | Trust project-local `.pi/` for this run |
| `-na`, `--no-approve` | Ignore project-local files for this run |
| `--list-models [search]` | List available models |
| `-v`, `--version` | Version |

```bash
pi -p "Summarize this codebase"
cat README.md | pi -p "Summarize this text"
pi @src/main.ts "Review this file"
pi --model anthropic/claude-sonnet-4-5:high "Hard problem"
pi --tools read,grep,find,ls -p "Read-only review"
```

---

## Slash Commands

Type `/` in the editor.

| Command | Description |
|---|---|
| `/login`, `/logout` | Provider credentials |
| `/model` | Switch model (also Ctrl+L) |
| `/settings` | Thinking, theme, delivery, transport |
| `/resume` | Previous sessions |
| `/new` | New session |
| `/name …` | Rename session |
| `/session` | Session info (path, tokens, cost) |
| `/tree` | Jump to any point in the session tree |
| `/fork` | New session from a prior user message |
| `/compact [prompt]` | Manual context compaction |
| `/export [file]` | Export HTML/JSONL |
| `/share` | Private gist + shareable HTML |
| `/reload` | Reload keybindings, extensions, skills, context |
| `/trust` | Save project trust decision (restart to apply) |
| `/hotkeys` | Full shortcut list |
| `/quit` | Exit |

Skills appear as `/skill:name`. Prompt templates expand as `/templatename`.

---

## Keyboard Shortcuts

Full list: `/hotkeys`. Customize via `~/.pi/agent/keybindings.json`.

| Key | Action |
|---|---|
| Ctrl+C | Clear editor; twice to quit |
| Escape | Abort; twice opens `/tree` |
| Ctrl+L | Model selector |
| Ctrl+P / Shift+Ctrl+P | Cycle scoped models |
| Shift+Tab | Cycle thinking level |
| Ctrl+O | Collapse/expand tool output |
| Ctrl+T | Collapse/expand thinking |
| Ctrl+G | External editor |
| Ctrl+X | Copy last assistant message |
| Enter (while working) | Queue steering message |
| Alt+Enter (while working) | Queue follow-up (after agent finishes) |
| `!cmd` | Run bash, send output to model |
| `!!cmd` | Run bash without sending |

---

## Context Files & Skills

Loaded at startup (concatenated):

- `~/.pi/agent/AGENTS.md` (global — this repo's `home/AGENTS.md`)
- parent dirs and cwd: `AGENTS.md` or `CLAUDE.md`
- `AGENTS.override.md` in a dir replaces that dir's AGENTS/CLAUDE file

Replace the system prompt with `~/.pi/agent/SYSTEM.md` or `.pi/SYSTEM.md`; append via `APPEND_SYSTEM.md`.

Skills (Agent Skills format) from:

- `~/.pi/agent/skills/`
- `~/.agents/skills/` (shared with Codex / Cursor / OpenCode in this setup)
- `.pi/skills/` / `.agents/skills/` walking up from cwd

Invoke with `/skill:name` or let the model load them on demand.

---

## Packages & Extensions

```bash
pi install npm:@foo/pi-tools
pi install git:github.com/user/repo@v1
pi list
pi update --all
pi update --self
pi config                  # enable/disable package resources
```

Packages land in `~/.pi/agent/npm/` or `~/.pi/agent/git/` (`-l` for project-local `.pi/`). Extensions are TypeScript modules under `~/.pi/agent/extensions/` or `.pi/extensions/`.

Pi intentionally has no built-in MCP, sub-agents, permission popups, or plan mode — add those via extensions/packages if you want them. herdr already auto-detects `pi` panes (see [[herdr-cheatsheet]]).

---

## Common Workflows

```bash
# Continue yesterday's work
pi -c

# Named audit, print mode
pi --name "release audit" -p "Audit this repository"

# Read-only exploration
pi --tools read,grep,find,ls "Explain the auth flow"

# herdr pane
herdr agent start pi --cwd ~/proj --split right -- pi
```

---

## Tips & Gotchas

- **No permission prompts by default** — treat the sandbox (or your own confirmation extension) as the safety layer.
- Project `.pi/` and project `.agents/skills` require a trust decision (`/trust`, `-a`, or `defaultProjectTrust` in settings).
- Nix installs pin a nixpkgs version; `pi update --self` updates the npm-style install path, not the Nix package — bump via flake/nixpkgs update instead.
- Opt out of install telemetry: `PI_TELEMETRY=0` or `enableInstallTelemetry: false` in `~/.pi/agent/settings.json`.
- Offline startup: `PI_OFFLINE=1` or `--offline`.
