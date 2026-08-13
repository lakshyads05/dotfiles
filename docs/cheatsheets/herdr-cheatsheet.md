---
tag:
  - type/cheatsheet
  - topic/herdr
  - topic/terminal
related:
  - "[[ghostty-cheatsheet]]"
  - "[[claude-code-cheatsheet]]"
  - "[[cursor-cli-cheatsheet]]"
  - "[[pi-cheatsheet]]"
  - "[[git-cheatsheet]]"
---

# Herdr Cheat Sheet

A reference for herdr, the terminal workspace manager for AI coding agents used in this setup (tmux-style `Ctrl+B` prefix, config at `home/.config/herdr/config.toml`, edit-in-place — no rebuild needed). herdr runs a persistent background server; the terminal you attach to is a thin client, so agent sessions survive terminal restarts and can be detached/reattached like tmux.

Official docs: <https://herdr.dev>

---

## Table of Contents

- [Mental Model: Session → Workspace → Tab → Pane](#mental-model-session--workspace--tab--pane)
- [Launching & Sessions](#launching--sessions)
- [Prefix Keybindings (this repo's config)](#prefix-keybindings-this-repos-config)
- [Default Keybindings (unconfigured actions)](#default-keybindings-unconfigured-actions)
- [Workspaces](#workspaces)
- [Tabs](#tabs)
- [Panes](#panes)
- [Worktrees](#worktrees)
- [Agent Integrations](#agent-integrations)
- [Socket API — Scripting Herdr](#socket-api--scripting-herdr)
- [Remote & Server](#remote--server)
- [Configuration](#configuration)
- [Common Workflows](#common-workflows)
- [Tips & Gotchas](#tips--gotchas)

---

## Mental Model: Session → Workspace → Tab → Pane

herdr's structure nests four levels, each with its own subcommand namespace:

| Level | Analogy | What it holds |
|---|---|---|
| Session | tmux session | A named, persistent server-backed connection. Survives detach/terminal close. |
| Workspace | tmux session-within-a-session / project | A logical project context (often one per repo or git worktree). Has its own set of tabs. |
| Tab | tmux window | A named tab within a workspace, holding one or more panes. |
| Pane | tmux pane | A split terminal running a shell or a detected AI agent (Claude Code, Codex, Cursor, etc.). |

herdr auto-detects which coding agent is running in a pane (via [integrations](#agent-integrations)) and tracks its state (`idle` / `working` / `blocked` / `unknown`), which drives notifications and the `herdr agent wait` / `herdr wait` scripting commands.

---

## Launching & Sessions

```bash
herdr                              # launch or attach to the persistent (default) session
herdr --session <name>             # use or create a named persistent session
herdr --no-session                 # run monolithically, no server/client (escape hatch)
herdr --remote user@host           # attach through SSH to a remote herdr server
herdr status                       # local client + running server status
```

| Command | Action |
|---|---|
| `herdr session list [--json]` | List named sessions |
| `herdr session attach <name>` | Attach to a named session |
| `herdr session stop <name>` | Stop a session (`default` targets the default session) |
| `herdr session delete <name>` | Delete a named session |

Detach without killing anything with the `detach` keybinding (default `prefix+q`) — the server keeps running headless, agents keep working, and `herdr` or `herdr session attach <name>` picks the session back up.

---

## Prefix Keybindings (this repo's config)

All prefix actions require pressing `Ctrl+B` first, then the key — same two-step model as tmux. This repo intentionally mirrors tmux's split keys (`"` / `%`) instead of herdr's defaults.

| Key | Action |
|---|---|
| `Ctrl+B h` / `j` / `k` / `l` | Focus pane left / down / up / right |
| `Ctrl+B "` | Split horizontal |
| `Ctrl+B %` | Split vertical |
| `Ctrl+B c` | New tab |
| `Ctrl+B &` | Close tab |
| `Ctrl+B w` | Workspace picker |
| `Ctrl+B g` | Goto (jump menu) |
| `Ctrl+B Shift+O` | Open worktree (jump to an existing worktree-backed workspace) |
| `Ctrl+B Shift+X` | Remove worktree (opens confirmation) |
| `Ctrl+B y` | Enter copy mode |
| `Ctrl+B Alt+1..9` | Jump to agent N (indexed `focus_agent`) |

Copy mode's internal keys (`v`/`space` select, `y`/`Enter` copy, `q`/`Esc` cancel) aren't configurable. Edit `home/.config/herdr/config.toml` to change any of these — changes apply live via `herdr server reload-config` or the `reload_config` keybinding (default `prefix+shift+r`), no rebuild needed.

---

## Default Keybindings (unconfigured actions)

Everything below is herdr's out-of-the-box binding for actions this repo hasn't overridden. See `herdr --default-config` for the full annotated list.

| Key | Action |
|---|---|
| `prefix+?` | Help |
| `prefix+s` | Settings |
| `prefix+q` | Detach |
| `prefix+shift+r` | Reload config |
| `prefix+o` | Open notification target |
| `prefix+shift+n` | New workspace |
| `prefix+shift+g` | New worktree |
| `prefix+shift+w` | Rename workspace |
| `prefix+shift+d` | Close workspace |
| `prefix+shift+t` | Rename tab |
| `prefix+p` / `prefix+n` | Previous / next tab |
| `prefix+1..9` | Switch tab by index |
| `prefix+shift+p` | Rename pane |
| `prefix+e` | Edit scrollback |
| `prefix+tab` / `prefix+shift+tab` | Cycle pane next / previous |
| `prefix+z` | Zoom pane (alias: fullscreen) |
| `prefix+r` | Resize mode |
| `prefix+b` | Toggle sidebar |

Indexed bindings and navigate-mode movement keys are opt-in — see the commented block in `herdr --default-config`. This repo now sets `focus_agent` (see [Prefix Keybindings](#prefix-keybindings-this-repos-config) above); `switch_workspace` remains unset.

Indexed bindings only accept a modifier (`alt`/`ctrl`/`shift`/`cmd`) before `1..9` — plain letters like `prefix+w+1..9` are rejected at reload (`invalid keybinding: ...; disabling binding`).

---

## Workspaces

```bash
herdr workspace list
herdr workspace create [--cwd PATH] [--label TEXT] [--focus]
herdr workspace get <workspace_id>
herdr workspace focus <workspace_id>
herdr workspace rename <workspace_id> <label>
herdr workspace close <workspace_id>
```

---

## Tabs

```bash
herdr tab list [--workspace <id>]
herdr tab create [--workspace <id>] [--cwd PATH] [--label TEXT] [--focus]
herdr tab get <tab_id>
herdr tab focus <tab_id>
herdr tab rename <tab_id> <label>
herdr tab close <tab_id>
```

---

## Panes

```bash
herdr pane list [--workspace <id>]
herdr pane split [<pane_id>] --direction right|down [--ratio FLOAT] [--cwd PATH]
herdr pane focus --direction left|right|up|down
herdr pane zoom [<pane_id>] [--toggle|--on|--off]
herdr pane resize --direction left|right|up|down [--amount FLOAT]
herdr pane swap --direction left|right|up|down
herdr pane move <pane_id> --tab <tab_id> --split right|down
herdr pane rename <pane_id> <label>
herdr pane close <pane_id>
```

Reading and driving pane content programmatically (used heavily for agent orchestration):

```bash
herdr pane read <pane_id> [--source visible|recent|recent-unwrapped] [--lines N]
herdr pane send-text <pane_id> <text>          # types text, no Enter
herdr pane send-keys <pane_id> <key> [key...]  # e.g. send literal keys like Enter
herdr pane run <pane_id> <command>              # command text + Enter, in one call
```

---

## Worktrees

herdr can spin up a workspace bound to a fresh git worktree in one step:

```bash
herdr worktree list [--workspace ID | --cwd PATH]
herdr worktree create [--branch NAME] [--base REF] [--path PATH] [--label TEXT] [--focus]
herdr worktree open (--path PATH | --branch NAME)
herdr worktree remove --workspace ID [--force]
```

Worktrees are created under `~/.herdr/worktrees` by default (one single directory for every project — `herdr worktree create` has no concept of "nest it inside the repo it came from"). Override the root with `[worktrees].directory` in `config.toml`, but note this repo deliberately leaves it unset: an earlier attempt pointed it at `~/github/lakshyads05/` so worktrees would at least live near projects, but that just mixed worktree dirs in flat with actual project repos at the top level — herdr's own default is the better tradeoff.

If a project uses the bare-repo worktree pattern (see [git-cheatsheet.md](git-cheatsheet.md#worktrees-bare-repo-pattern)) and you want new worktrees to land as siblings of `.bare` instead of under `~/.herdr/worktrees`, either pass `--path` explicitly to `herdr worktree create`, or (preferred) create the worktree with plain `git worktree add` / this repo's `wtnew` shell function and then run `herdr worktree open --path <path>` to attach a herdr session to it afterward — that gets the right location and herdr's session/agent-status tracking together.

The `new_worktree` prefix binding (default `prefix+shift+g`) does the same thing as `herdr worktree create` interactively — handy for ad hoc worktrees, but has the same "always in the default directory" behavior. `open_worktree` and `remove_worktree` are bindable actions too but ship unset (`""`) in herdr's default config — this repo binds them to `prefix+shift+o` (jump to an existing worktree-backed workspace) and `prefix+shift+x` (remove, with confirmation).

---

## Agent Integrations

herdr auto-detects supported coding agents running in a pane and surfaces their state (idle/working/blocked) in the sidebar and via notifications. Manage integrations with:

```bash
herdr integration status [--outdated-only]
herdr integration install <name>
herdr integration uninstall <name>
```

Supported names: `claude`, `codex`, `cursor`, `copilot`, `devin`, `droid`, `kimi`, `opencode`, `kilo`, `hermes`, `qodercli`, `mastracode`, `pi`, `omp`.

Interact with agents directly:

```bash
herdr agent list
herdr agent get <target>
herdr agent send <target> <text>                 # writes literal text (no Enter)
herdr agent wait <target> --status <idle|working|blocked|unknown> [--timeout MS]
herdr agent attach <target> [--takeover]
herdr agent explain <target> [--json]            # why herdr thinks this is agent X
```

`<target>` accepts a terminal id, a unique agent name, a detected/reported agent label, or a legacy pane id. Use `herdr pane run` instead of `agent send` when you need command text followed by Enter.

---

## Socket API — Scripting Herdr

herdr exposes everything above over a local Unix socket API, which is what makes it useful for orchestrating multiple agents from a script (e.g. a supervisor loop that fans work out to several panes and waits on completion):

```bash
herdr api snapshot                  # dump live runtime state as JSON
herdr api schema [--json|--output PATH]
herdr wait output <pane_id> --match <text> [--timeout MS] [--regex]
herdr wait agent-status <pane_id> --status <idle|working|blocked|done|unknown> [--timeout MS]
```

Pane-side reporting hooks (`herdr pane report-agent`, `report-agent-session`, `release-agent`, `report-metadata`) are what the official integrations use internally to tell herdr an agent's state changed — useful as a reference if wiring up a custom/unsupported agent.

---

## Remote & Server

```bash
herdr --remote user@host [--session name]   # attach to a remote herdr server over SSH
herdr server                                # run as headless server
herdr server stop                           # stop the running server via the API socket
herdr server reload-config                  # hot-reload config.toml into the running server
herdr update [--handoff]                    # download and install latest version
herdr channel show                          # print update channel
herdr channel set <stable|preview>
herdr config reset-keys                     # back up config.toml, strip custom keybindings
```

`brew services start herdr` runs the server as a login-time background service instead of launching it on demand (see `brew info herdr` caveats) — not configured by default in this repo.

---

## Configuration

Config lives at `home/.config/herdr/config.toml` in this repo (edit-in-place, symlinked via `home.nix`'s `mkOutOfStoreSymlink` — no `./rebuild.sh` needed). See the current keybindings in [Prefix Keybindings](#prefix-keybindings-this-repos-config) above.

```bash
herdr --default-config          # print the full annotated default config to stdout
herdr server reload-config      # apply config.toml changes to the running server live
```

Beyond keybindings, `config.toml` also controls: theme (`catppuccin`, `tokyo-night`, `dracula`, `nord`, `gruvbox`, `one-dark`, `solarized`, `kanagawa`, `rose-pine`, `vesper`, plus light/dark auto-switch), default shell and pane CWD policy, toast/sound notifications per agent, worktree directory, and scrollback limits.

---

## Common Workflows

### Start a fresh workspace for a new branch

1. `Ctrl+B Shift+G` (new worktree) — creates a git worktree + bound workspace in one step
2. herdr focuses the new workspace automatically (unless `--no-focus`)
3. Launch your agent of choice in the pane; herdr detects it via its integration

### Run several agents side by side and wait for all of them

```bash
herdr agent start claude --cwd ~/proj/a --split right -- claude
herdr agent start codex  --cwd ~/proj/b --split right -- codex
herdr wait agent-status <pane_a> --status idle --timeout 600000
herdr wait agent-status <pane_b> --status idle --timeout 600000
```

### Detach and resume later

1. `Ctrl+B q` to detach — server keeps every pane and agent running headless
2. Later: `herdr` (default session) or `herdr session attach <name>`
3. With `resume_agents_on_restore = true` (default), supported agent panes resume their native conversation session even across a full server restart

### Feed an agent a prompt programmatically

```bash
herdr pane run <pane_id> "explain the failing test in tests/foo_test.py"
herdr wait agent-status <pane_id> --status idle --timeout 300000
herdr pane read <pane_id> --lines 200
```

---

## Tips & Gotchas

### herdr is a client/server split, not a single process

Like tmux, the actual session lives in a background server; what you attach to is a client. `herdr status` shows both independently — a client can be a newer version than the running server until you reload/restart it.

### `agent send` vs `pane run`

`herdr agent send` writes literal text only — no trailing Enter, so it's safe for building up multi-line input. `herdr pane run` appends Enter, so use it when you want the command to execute immediately.

### Copy mode keys aren't configurable

Only the entry keybinding (`copy_mode`, bound to `prefix+y` in this repo) is configurable. Once inside copy mode, `v`/`space` to select, `y`/`Enter` to copy, `q`/`Esc` to cancel are fixed.

### Config changes are live, no restart needed

`config.toml` is edit-in-place already (symlinked from this repo). After editing, run `herdr server reload-config` or use the `reload_config` keybinding rather than restarting the server — panes and agent state are preserved either way, but reload is faster.

### Worktrees keep agent contexts isolated

Since each `herdr worktree create` gets its own path under `~/.herdr/worktrees` and its own workspace, running multiple agents against different branches of the same repo won't clash on working-tree state — each agent gets a clean, isolated checkout.
