# Installed Software Inventory

> **Source of truth per install method:**
> - GUI apps (casks), asdf + build deps, tapped tools: `configuration.nix`'s `homebrew` block
> - CLI tools available in nixpkgs: `home.nix`'s `home.packages` / `programs.*`
> - Language runtime versions: `.tool-versions`
> - Non-Homebrew, non-Nix installs: `bootstrap.sh`
>
> Update this file whenever any of the above change.

---

## Bootstrap (installed before everything else)

| Tool | Installed via | Notes |
|------|---------------|-------|
| Xcode Command Line Tools | `xcode-select --install` | Required for `git` and native compilation on macOS; installed by `bootstrap.sh` |
| Determinate Nix | `curl \| sh` (install.determinate.systems) | Nix package manager; installed by `bootstrap.sh` |
| Homebrew | Adopted by nix-homebrew (`autoMigrate = true` in `configuration.nix`) | Package manager for GUI apps + a few CLI tools; management itself is now declared in `configuration.nix`, not a separate bootstrap step |

---

## GUI Applications

All declared in `configuration.nix`'s `homebrew.casks` (applied via `darwin-rebuild switch`, i.e. `./bootstrap.sh` or `./rebuild.sh`).

| App | Installed via | Category | Notes |
|-----|---------------|----------|-------|
| Ghostty | `configuration.nix` (homebrew.casks) | Terminal | GPU-accelerated; replaces iTerm2 |
| WezTerm | `configuration.nix` (homebrew.casks) | Terminal | GPU-accelerated, cross-platform terminal emulator |
| Visual Studio Code | `configuration.nix` (homebrew.casks) | Editor | |
| Cursor | `configuration.nix` (homebrew.casks) | Editor | AI-native code editor; global instructions symlinked from `home/AGENTS.md` to `~/.cursor/rules/master-rules.md` |
| Docker Desktop | `configuration.nix` (homebrew.casks) | Containers | Provides `docker` and `docker compose` CLIs — see [Docker cheat sheet](cheatsheets/docker-cheatsheet.md) |
| Google Chrome | `configuration.nix` (homebrew.casks) | Browser | |
| Firefox | `configuration.nix` (homebrew.casks) | Browser | |
| ChatGPT Atlas | `configuration.nix` (homebrew.casks) | Browser | OpenAI's browser with ChatGPT built in; requires arm64 + macOS 14 |
| Google Cloud CLI | `configuration.nix` (homebrew.casks) | Cloud | Includes `gcloud`, `gsutil`, `bq`; kubectl installed on demand |
| Rectangle | `configuration.nix` (homebrew.casks) | Productivity | Keyboard-driven window tiling |
| AppCleaner | `configuration.nix` (homebrew.casks) | Productivity | Clean app uninstalls |
| Maccy | `configuration.nix` (homebrew.casks) | Productivity | Clipboard history (Cmd+Shift+C) |
| LinearMouse | `configuration.nix` (homebrew.casks) | Productivity | Mouse customization: side buttons, scroll, acceleration. Config write-back handled by `home.nix`'s `mkOutOfStoreSymlink` + `home.activation.backupLinearMouseConfig` |
| OpenSuperWhisper | `configuration.nix` (homebrew.casks) | Productivity | Open-source AI voice-to-text dictation (system-wide) |
| Obsidian | `configuration.nix` (homebrew.casks) | Productivity | Markdown-based knowledge base / note-taking. `docs/cheatsheets/` doubles as a vault folder — see `home.nix`'s `Documents/workspace/my-matrix/a-utils/cheatsheets` symlink |
| Granola | `configuration.nix` (homebrew.casks) | Productivity | AI-powered notepad for meetings |
| Postman | `configuration.nix` (homebrew.casks) | API Testing | REST client |
| Whimsical | `configuration.nix` (homebrew.casks) | Productivity | Collaboration and diagramming tool |
| Baby Menu | `configuration.nix` (homebrew.casks: `kunchenguid/tap/baby-menu`) | Productivity | Agent-editable macOS menu bar — ask Claude/Codex (or a custom ACP agent) to add widgets. Extensions, `preferences.json`, and `agents.json` are edit-in-place via `home.nix`'s `mkOutOfStoreSymlink` + `home.activation.backupBabyMenuConfig` (`home/.baby-menu/`); SQLite DB and caches stay machine-local under `~/.baby-menu/` |
| Claude (desktop) | `configuration.nix` (homebrew.casks: `claude`) | AI | Anthropic Claude desktop app |
| Codex (desktop) | `configuration.nix` (homebrew.casks: `codex-app`) | AI | OpenAI Codex desktop app for managing coding agents; global instructions symlinked from `home/AGENTS.md` to `~/.codex/AGENTS.md` |
| Claude Code | `configuration.nix` (homebrew.casks: `claude-code`) | AI / CLI | Global config (`CLAUDE.md` from `home/AGENTS.md`, `settings.json`, `statusline-command.sh`) symlinked via home-manager into `~/.claude/`. Updates via Homebrew's `onActivation.autoUpdate`, not a native installer. |

---

## CLI Tools & Utilities

### Version control & core utilities

Installed via `home.nix`'s `home.packages` (Nix), unless noted otherwise.

| Tool | Description |
|------|-------------|
| `git` | Version control |
| `gh` | GitHub CLI |
| `jq` | JSON processor |
| `tree` | Directory tree visualizer |
| `wget` | HTTP downloader |
| `nvim` (neovim) | Modal text editor — see `home/.config/nvim/` for the full lazy.nvim config |
| `tree-sitter` | Parser generator CLI; nvim-treesitter shells out to it to compile Neovim's syntax parsers |

### Modern CLI replacements

Installed via `home.nix`'s `home.packages` (Nix), unless noted otherwise.

| Tool | Replaces | Description |
|------|----------|-------------|
| `rg` (ripgrep) | `grep` | Fast recursive search; respects `.gitignore` |
| `fd` | `find` | Intuitive file finder; parallel, regex by default |
| `bat` | `cat` | Syntax-highlighted file viewer with line numbers |
| `eza` | `ls` | Modern listing with icons, git status, tree view |
| `zoxide` (`z`) | `cd` | Learns habits; jump to dirs by partial name — `home.nix`'s `programs.zoxide` (Nix, home-manager module, handles shell init) |
| `fzf` | — | Fuzzy finder for history, files, branches, processes — `home.nix`'s `programs.fzf` (Nix, home-manager module, handles shell integration) |
| `delta` | `diff` pager | Syntax-highlighted, side-by-side git diffs; declared in `home.nix`'s `programs.git.settings` (home-manager, applied to `~/.config/git/config`) (nixpkgs package name is `delta`, not `git-delta`) |
| `lazygit` (`lg`) | — | Full terminal UI for git |
| `btop` | `top` / `htop` | Modern resource monitor with graphs |
| `dust` | `du` | Tree-based disk usage visualizer |
| `tldr` | `man` (common cases) | Simplified man pages with real examples |
| `atuin` | `~/.zsh_history` | SQLite-backed shell history with search — `home.nix`'s `programs.atuin` (Nix, home-manager module) |

### AI coding CLIs

| Tool | Installed via | Description |
|------|---------------|-------------|
| `claude` | `configuration.nix` (homebrew.casks: `claude-code`) | Anthropic Claude Code CLI |
| `codex` | `configuration.nix` (homebrew.casks: `codex`) | OpenAI Codex CLI — coding agent in terminal |
| `opencode` | `home.nix` (home.packages) | AI coding agent, built for the terminal |
| `pi` | `home.nix` (home.packages: `pi-coding-agent`) | Minimal coding agent harness ([pi.dev](https://pi.dev)); global instructions at `~/.pi/agent/AGENTS.md` |
| `agent` / `cursor-agent` | Installed independently by Cursor (not via this repo) | Cursor's agent CLI, under `~/.local/bin` — aliased to `aa` in `home.nix`'s `programs.zsh.shellAliases` |

#### Shared agent skills

Claude Code, Codex CLI, Cursor, OpenCode, and Pi all read the same open `SKILL.md` format (YAML frontmatter with `name`/`description`, then markdown instructions). Codex, Cursor, OpenCode, and Pi scan `~/.agents/skills` natively; Claude Code only reads its own `~/.claude/skills`, so `home.nix` symlinks each skill into both directories from one canonical copy in this repo's `home/skills/<name>/`.

| Skill | Canonical source | Symlinked into |
|-------|-------------------|-----------------|
| `smell` | `home/skills/smell/SKILL.md` | `~/.agents/skills/smell`, `~/.claude/skills/smell` |
| `commit-message` | `home/skills/commit-message/SKILL.md` | `~/.agents/skills/commit-message`, `~/.claude/skills/commit-message` |
| `pr-description` | `home/skills/pr-description/SKILL.md` | `~/.agents/skills/pr-description`, `~/.claude/skills/pr-description` |
| `architecture-plan` | `home/skills/architecture-plan/SKILL.md` | `~/.agents/skills/architecture-plan`, `~/.claude/skills/architecture-plan` |

See [git cheatsheet — Code smell review](cheatsheets/git-cheatsheet.md), [git cheatsheet — Commit message conventions](cheatsheets/git-cheatsheet.md), and [git cheatsheet — Pull request description conventions](cheatsheets/git-cheatsheet.md) for usage.

### Terminal multiplexing

| Tool | Installed via | Description |
|------|---------------|-------------|
| `herdr` | `configuration.nix` (homebrew.brews) | Agent multiplexer for the terminal (tmux-style `Ctrl+B` prefix bindings) — config in `home/.config/herdr/config.toml` |

### Cloud, infrastructure & payments CLIs

| Tool | Installed via | Description |
|------|---------------|-------------|
| `terraform` | `configuration.nix` (homebrew.brews, tap: `hashicorp/tap`) | Infrastructure-as-code CLI |
| `stripe` | `configuration.nix` (homebrew.brews, tap: `stripe/stripe-cli`) | Stripe CLI: webhook testing, API calls |

### Shell productivity

| Tool | Installed via | Description |
|------|---------------|-------------|
| `starship` | `home.nix` (programs.starship) | Cross-shell prompt (replaces Powerlevel10k) |

Zsh plugin management (autosuggestions, syntax-highlighting, completion) is native to home-manager now — see [Zsh plugins](#zsh-plugins) below. Antidote and `.zsh_plugins.txt` were retired.

### Zsh plugins

**Retired.** Antidote (the plugin manager) and `.zsh_plugins.txt` no longer exist. Their functionality is replaced by home-manager's native `programs.zsh` toggles, declared directly in `home.nix`:

| Former plugin | Now |
|--------|---------|
| `zsh-users/zsh-autosuggestions` | `programs.zsh.autosuggestion.enable = true` |
| `zsh-users/zsh-syntax-highlighting` | `programs.zsh.syntaxHighlighting.enable = true` |
| `zsh-users/zsh-completions` | `home.packages`' `zsh-completions` + `programs.zsh.enableCompletion = true`, with the extra completion fpath wired in `programs.zsh.initContent` |

### Language version manager

| Tool | Installed via | Description |
|------|---------------|-------------|
| `asdf` | `configuration.nix` (homebrew.brews) | Manages language runtimes via `.tool-versions`. Kept Homebrew-managed and outside Nix by design — see README's Design Decisions. |

### Post-install integration

| Tool | Installed via | Description |
|------|---------------|-------------|
| fzf key bindings | `home.nix`'s `programs.fzf.enableZshIntegration` (Nix, home-manager module) | Wires `Ctrl+T`, `Ctrl+R`, `Alt+C` into Zsh — no separate install script needed anymore |

### Build & compilation support

| Tool | Installed via | Required by |
|------|---------------|-------------|
| `coreutils` | `configuration.nix` (homebrew.brews) | asdf on macOS |
| `openssl@3` | `configuration.nix` (homebrew.brews) | Python and Node native modules |
| `readline` | `configuration.nix` (homebrew.brews) | Python build |
| `xz` | `configuration.nix` (homebrew.brews) | Python build |

### Developer fonts

Installed via `home.nix`'s `home.packages` (Nix nerd-fonts derivations), not Homebrew casks.

| Font | Use |
|------|-----|
| Hack Nerd Font | Primary system font (Ghostty + WezTerm default) |
| JetBrains Mono Nerd Font | Alternative — see README "Personalize Theme & Font" for how to switch |
| Fira Code Nerd Font | Alternative with strong ligatures |

---

## Language Runtimes

Managed by **asdf**. Versions are declared in **`.tool-versions`** — that is the only source of truth for version numbers. Edit that file and run `./bootstrap.sh` (or `asdf install` directly) to add or change a version. Deliberately kept outside Nix's management — see README's Design Decisions for why.

| Language | `.tool-versions` key |
|----------|----------------------|
| Node.js | `nodejs` |
| Python | `python` |
| Go | `golang` |
| Java | `java` |
