# macOS Developer Setup (2026)

A reproducible macOS development environment, managed with **nix-darwin** and **home-manager**. Clone this repo onto a fresh Mac, run one script, and you get:

- A modern terminal stack (Ghostty + WezTerm) with an actively-maintained cross-shell prompt (Starship)
- Language runtimes pinned per-project via asdf
- Rust-based CLI replacements for classic Unix tools, all aliased transparently
- Code editors, containers, cloud tools, and developer utilities — declared once, applied atomically
- Everything wired together via `flake.nix`, `configuration.nix`, `home.nix`, and a bootstrap script

See [`docs/inventory.md`](docs/inventory.md) for the complete list of every installed tool, app, and runtime — including how each one is installed.

---

## Table of Contents

- [Quick Start](#quick-start)
- [What the Setup Gives You](#what-the-setup-gives-you)
  - [Terminal & Shell](#terminal--shell)
  - [CLI Tools & Aliases](#cli-tools--aliases)
  - [Language Runtimes (via asdf)](#language-runtimes-via-asdf)
  - [Applications Installed](#applications-installed)
- [Manual Steps (After `./bootstrap.sh`)](#manual-steps-after-bootstrapsh)
  - [1. Grant Accessibility Permissions](#1-grant-accessibility-permissions-one-time-per-app)
  - [2. Configure Git Identity](#2-configure-git-identity)
  - [3. Authenticate GitHub CLI](#3-authenticate-github-cli)
  - [4. Launch Docker Desktop Once](#4-launch-docker-desktop-once)
  - [5. Sign Into GUI Apps](#5-sign-into-gui-apps)
  - [6. Authenticate Cloud CLIs](#6-authenticate-cloud-clis-as-needed)
  - [7. Authenticate Claude Code](#7-authenticate-claude-code)
  - [8. Optional: Enable Atuin History Sync](#8-optional-enable-atuin-history-sync)
  - [9. Optional: Set Ghostty as Default Terminal](#9-optional-set-ghostty-as-default-terminal)
  - [10. Optional: Personalize Theme & Font](#10-optional-personalize-theme--font)
- [Daily Usage: Keybindings & Commands](#daily-usage-keybindings--commands)
- [Customization](#customization)
- [Updating Your Setup](#updating-your-setup)
  - [Update everything](#update-everything)
  - [Update just Homebrew packages](#update-just-homebrew-packages)
  - [Roll back a bad switch](#roll-back-a-bad-switch)
  - [Update asdf plugins](#update-asdf-plugins)
- [Troubleshooting](#troubleshooting)
  - [`./bootstrap.sh` returns "permission denied"](#bootstrapsh-returns-permission-denied)
  - [`sudo: darwin-rebuild: command not found`](#sudo-darwin-rebuild-command-not-found)
  - ["command not found" on a tool that should exist](#command-not-found-on-a-tool-that-should-exist)
  - [Icons show as squares in Starship / eza](#icons-show-as-squares-in-starship--eza)
  - [Ghostty Quick Terminal doesn't respond](#ghostty-quick-terminal-doesnt-respond)
  - [SSH session looks broken](#ssh-session-looks-broken-vim--less-render-incorrectly)
  - [asdf says "No version is set"](#asdf-says-no-version-is-set-for-command-x)
  - [`darwin-rebuild switch` fails on a Homebrew step](#darwin-rebuild-switch-fails-on-a-homebrew-step)
  - [Atuin doesn't import my old history](#atuin-doesnt-import-my-old-history)
  - [Starting over on a single tool](#starting-over-on-a-single-tool)
- [Cheat Sheets & References](#cheat-sheets--references)
- [Repository Layout](#repository-layout)
- [Design Decisions (Short Version)](#design-decisions-short-version)

---

## Quick Start

On a fresh Mac:

```bash
# 1. macOS prompts for Xcode Command Line Tools on first `git` invocation.
#    If you want to trigger it explicitly:
xcode-select --install

# 2. Clone and bootstrap
git clone https://github.com/lakshyads/dotfiles.git ~/dotfiles
cd ~/dotfiles
chmod +x bootstrap.sh      # first time only; see note below
./bootstrap.sh
```

`bootstrap.sh` is the single entry point. In order, it: installs Xcode CLT if missing, installs Determinate Nix if missing, symlinks the repo to `~/.dotfiles`, runs the first `darwin-rebuild switch` (this installs every package — Homebrew via nix-homebrew, CLI tools via home-manager — and wires up every dotfile symlink), then registers asdf plugins and installs runtimes from `.tool-versions`, and finally prompts for your git identity.

It's designed to be re-run: some steps (Xcode CLT install, first Nix install) deliberately exit and ask you to re-run once they finish, since they need a fresh shell or a GUI installer to complete first. Pass `--full` to skip the interactive git-identity prompt (just reports current state instead):

```bash
./bootstrap.sh --full
```

Every step is idempotent — safe to re-run at any time. Already-applied steps are detected and skipped.

When it finishes, open Ghostty or WezTerm, run `exec zsh`, and you're in the new environment.

To verify everything installed correctly in a new shell:

```bash
./verify.sh
```

This runs non-destructive smoke tests: checks every CLI tool resolves, every dotfile symlink is wired correctly, every GUI app is installed, language runtimes match `.tool-versions`, fonts are detected, and Git is configured. It also runs `nix flake check --no-build` as its first check — that's the primary structural contract now (anything declared in `configuration.nix`/`home.nix` that fails to evaluate fails there first). Exit 0 on success, 1 with a failure summary otherwise.

After the first bootstrap, day-to-day changes to configuration go through:

```bash
./rebuild.sh              # build + apply configuration.nix / home.nix changes
./rebuild.sh --dry-run    # build only, validate before switching
```

> **Why `chmod +x`?** Depending on how you cloned or downloaded the repo, the executable bit on `bootstrap.sh` may not be preserved (macOS Gatekeeper strips it for quarantined files, and some git configs do too). Running `chmod +x bootstrap.sh` once fixes it permanently. If you cloned via plain `git clone` into a trusted directory, it may already be executable and this step is a no-op.

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## What the Setup Gives You

See [`docs/inventory.md`](docs/inventory.md) for a full list of what's provisioned automatically. Everything below is set up for you — no manual configuration required after running `./bootstrap.sh`.

### Terminal & Shell

- **Ghostty** and **WezTerm**, both themed `rose-pine-moon` with Hack Nerd Font, 25M-line scrollback, and split keybindings
- **Quick Terminal** (Quake-style dropdown) bound to ```Ctrl+` ```; see manual steps for required permission
- **Zsh** with native home-manager plugin support (autosuggestions, syntax-highlighting) — see [`home.nix`](home.nix)'s `programs.zsh` block
- **Starship** prompt showing directory, git branch + status, active language version, and command duration
- **Atuin** replacing `Ctrl+R` with a full-screen SQLite-backed history search
- **herdr**, a terminal-based agent multiplexer (tmux-style `Ctrl+B` prefix), for running multiple coding agent sessions side by side

### CLI Tools & Aliases

Classic commands (`ls`, `cat`, `top`, `du`, `git`) are aliased to their modern replacements. Shell key bindings for history search and fuzzy file/directory picking are wired up. See [`docs/cheatsheets/modern-cli-cheatsheet.md`](docs/cheatsheets/modern-cli-cheatsheet.md) for the full alias map, key bindings, and usage reference.

### Language Runtimes (via asdf)

Versions are pinned in `.tool-versions` — that is the only place versions are defined. Runtimes stay asdf-managed by design (not Nix-managed): asdf's per-project `.tool-versions` override, walking up the directory tree, is a workflow Nix doesn't replicate without a heavier devshell/direnv setup. See [`docs/inventory.md`](docs/inventory.md#language-runtimes) for the list of managed languages and [`docs/cheatsheets/asdf-cheatsheet.md`](docs/cheatsheets/asdf-cheatsheet.md) for version management commands.

### Applications Installed

See **[`docs/inventory.md`](docs/inventory.md)** for the full list of GUI apps, CLI tools, and language runtimes.

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Manual Steps (After `./bootstrap.sh`)

These genuinely require human action, either because they need you to sign in, grant macOS permissions, or make personal choices. Work through them in order:

### 1. Grant Accessibility Permissions (one-time, per app)

Some apps need Accessibility permission to function. macOS will prompt on first launch, but you can pre-approve them:

**System Settings > Privacy & Security > Accessibility**, add:

- **Maccy**: required to read clipboard (app won't work without it)
- **Ghostty**: required only if you use the Quake-style Quick Terminal global hotkey (`Ctrl+\``)
- **Rectangle**: required for window snapping to work
- **LinearMouse**: required to intercept mouse events (side buttons, scroll customization)

### 2. Configure Git Identity

`./bootstrap.sh` already prompted you for this interactively. To change it later:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main

# Optional but useful
git config --global pull.rebase true
git config --global rebase.autoStash true
```

This is deliberately kept out of home-manager's `programs.git` — that would make `~/.gitconfig` an immutable Nix-store symlink. Full recommended git config and a workflow reference are in [`docs/cheatsheets/git-cheatsheet.md`](docs/cheatsheets/git-cheatsheet.md).

### 3. Authenticate GitHub CLI

```bash
gh auth login                   # follow prompts, choose SSH or HTTPS
```

### 4. Launch Docker Desktop Once

First launch triggers a macOS prompt to install a privileged helper. Click through it. After that, `docker` and `docker compose` work from any terminal.

Docker Desktop also appends a CLI completions block to `~/.zshrc` on first launch — but `~/.zshrc` is now home-manager generated (not a plain file), so that append doesn't persist across a `./rebuild.sh`. The Docker completions fpath addition is already handled declaratively in `home.nix`'s `programs.zsh.initContent`, so this is a no-op in practice.

### 5. Sign Into GUI Apps

- **Chrome**: sign in, set as default browser if desired
- **Cursor / VS Code**: sign in for settings sync
- **Maccy**: no account, but enable "Launch at Login" in its preferences
- See the [inventory section](docs/inventory.md) for other GUI apps that may require login or manual setup after first launch

### 6. Authenticate Cloud CLIs (as needed)

```bash
# Google Cloud
gcloud auth login
gcloud config set project <your-project-id>
gcloud auth application-default login   # for SDK libraries

# Skip if you don't use GCP
```

### 7. Authenticate Claude Code

```bash
claude          # first run opens browser for OAuth login
claude doctor   # verifies installation + auth
```

Requires a paid Anthropic account (Pro, Max, Team, Enterprise, or Console with API credits). Claude Code is installed via the `claude-code` Homebrew cask (declared in `configuration.nix`), not a native installer — Homebrew's `onActivation.autoUpdate` keeps it current on every `./rebuild.sh`.

### 8. Optional: Enable Atuin History Sync

Atuin works fully offline by default. To sync history across machines (end-to-end encrypted):

```bash
atuin register -u <username> -e <email>
atuin key                    # save this somewhere safe (you'll need it on other machines)
```

Skip if you only use one Mac or don't want cloud sync.

### 9. Optional: Set Ghostty as Default Terminal

If you want `open .` and similar commands to open Ghostty instead of Terminal.app:

System Settings > Desktop & Dock > Scroll to "Default web browser / Default terminal". (Ghostty will offer to set itself as default on first launch.)

### 10. Optional: Personalize Theme & Font

The defaults are chosen carefully, but if you want to customize:

- **Ghostty theme:** edit `home/.config/ghostty/config`, change the `theme = ...` line. Preview options with `ghostty +list-themes`.
- **Font:** Hack Nerd Font is the primary system font (Ghostty + WezTerm). JetBrains Mono and Fira Code are also installed (via `home.nix`'s `home.packages`) as alternatives — to switch, change `font-family` in `home/.config/ghostty/config` and `config.font`/`config.window_frame.font` in `home/.config/wezterm/wezterm.lua` to `JetBrainsMono Nerd Font` or `FiraCode Nerd Font`, then run `./rebuild.sh`.
- **Starship prompt:** edit `home.nix`'s `programs.starship.settings`, then run `./rebuild.sh`.
- **Shell aliases:** edit `home.nix`'s `programs.zsh.shellAliases`, then run `./rebuild.sh`.

`home/.config/{wezterm,ghostty,nvim,herdr}/` files are edit-in-place — home-manager symlinks them directly into place (`mkOutOfStoreSymlink`), so editing them takes effect immediately, no rebuild needed. Everything else (packages, shell aliases, Starship settings) requires `./rebuild.sh` to apply.

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Daily Usage: Keybindings & Commands

| What you need | Where to look |
|---|---|
| Terminal keybindings (tabs, splits, Quick Terminal) | [`docs/cheatsheets/ghostty-cheatsheet.md`](docs/cheatsheets/ghostty-cheatsheet.md) |
| Shell history search, fuzzy file/dir picker, autosuggestions | [`docs/cheatsheets/modern-cli-cheatsheet.md`](docs/cheatsheets/modern-cli-cheatsheet.md) |
| Directory jumping (`z`) | [`docs/cheatsheets/modern-cli-cheatsheet.md`](docs/cheatsheets/modern-cli-cheatsheet.md#jumping-to-directories-zoxide) |
| `rg`, `fd`, `bat`, `eza`, `dust`, `btop` usage | [`docs/cheatsheets/modern-cli-cheatsheet.md`](docs/cheatsheets/modern-cli-cheatsheet.md) |
| Git TUI (`lg`) | [`docs/cheatsheets/lazygit-cheatsheet.md`](docs/cheatsheets/lazygit-cheatsheet.md) |
| Language runtime commands (`asdf current`, `asdf install`) | [`docs/cheatsheets/asdf-cheatsheet.md`](docs/cheatsheets/asdf-cheatsheet.md) |
| Nix / nix-darwin / home-manager commands (`darwin-rebuild`, rollback, GC) | [`docs/cheatsheets/nix-cheatsheet.md`](docs/cheatsheets/nix-cheatsheet.md) |

> **On Mac, `Alt` = `Option` (⌥).** fzf and readline docs use "Alt" historically.

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Customization

This repo is meant to be forked and personalized. The files worth editing:

| File | What it controls |
|---|---|
| `configuration.nix` | System defaults, and Homebrew packages: GUI apps (casks), asdf + its build deps, and the two tapped tools (`terraform`, `stripe`) not worth moving to Nix. Run `./rebuild.sh` after editing. |
| `home.nix` | CLI tools available in nixpkgs (`home.packages`), zsh aliases/keybinds/plugins (`programs.zsh`), Starship prompt (`programs.starship`), and every dotfile symlink (`home.file`). Run `./rebuild.sh` after editing. |
| `home/.tool-versions` | Language runtime versions. Edit and run `./bootstrap.sh` (registers asdf plugins + runs `asdf install`). |
| `home/.config/wezterm/wezterm.lua` | WezTerm terminal appearance. Edit-in-place, no rebuild needed. |
| `home/.config/ghostty/config` | Ghostty terminal appearance and keybindings. Edit-in-place, no rebuild needed. Reload in-app with `Cmd+Shift+,`. |
| `home/.config/nvim/` | Neovim config (lazy.nvim plugin specs under `lua/plugins/`). Edit-in-place, no rebuild needed. |
| `home/.config/herdr/config.toml` | herdr (terminal agent multiplexer) keybindings. Edit-in-place, no rebuild needed. |
| `home/.config/linearmouse/linearmouse.json` | Mouse settings (side buttons, scroll direction, acceleration). Edit via the LinearMouse GUI; changes write back to the file automatically. |
| `home/AGENTS.md` | Shared agent instructions, symlinked into Claude Code, Codex, opencode, Pi, and Cursor. |

After any changes, commit them to your dotfiles repo. Other machines pick up changes with `git pull && ./rebuild.sh` (or `./bootstrap.sh` on a machine that hasn't been bootstrapped yet).

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Updating Your Setup

### Update everything

```bash
git pull
./rebuild.sh
```

`darwin-rebuild switch` (what `./rebuild.sh` runs) re-applies `configuration.nix` and `home.nix` in one atomic step: any new Homebrew packages, any new `home.packages` entries, any dotfile symlink changes. There's no separate "install new Brewfile entries" step anymore — `Brewfile` is a retired stub; `configuration.nix`'s `homebrew` block is what `darwin-rebuild switch` reads, and it applies unconditionally on every switch (`onActivation.autoUpdate = true`).

For runtime version changes:

```bash
./bootstrap.sh    # re-registers asdf plugins and runs `asdf install` for anything new in .tool-versions
```

To bump the Nix flake's own pins (nixpkgs, nix-darwin, home-manager, nix-homebrew — this is how Nix-packaged CLI tool *versions* move forward, since `home.packages` doesn't pin exact versions itself) and update Homebrew/asdf all in one pass:

```bash
./update.sh    # nix flake update, then a reminder to ./rebuild.sh; also upgrades Homebrew packages and asdf plugins
```

### Update just Homebrew packages

Homebrew's own package *versions* (not the declared list, which comes from `configuration.nix`) update via:

```bash
brew update && brew upgrade && brew upgrade --cask
brew cleanup
```

This is independent of `./rebuild.sh` — it updates the installed version of whatever `configuration.nix` already declares, it doesn't change what's declared.

### Roll back a bad switch

One of the reasons for the Nix migration — a bad `./rebuild.sh` is a one-command undo:

```bash
sudo /run/current-system/sw/bin/darwin-rebuild --rollback
```

See [`docs/cheatsheets/nix-cheatsheet.md`](docs/cheatsheets/nix-cheatsheet.md) for generation management and garbage collection.

### Update asdf plugins

```bash
asdf plugin update --all
```

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Troubleshooting

### `./bootstrap.sh` returns "permission denied"

The executable bit wasn't preserved. One-time fix:

```bash
chmod +x bootstrap.sh
./bootstrap.sh
```

To make the fix permanent so other machines cloning the repo don't hit this, commit the mode change:

```bash
chmod +x bootstrap.sh
git add bootstrap.sh          # `git status` should show "mode change 100644 → 100755"
git commit -m "chore: make bootstrap.sh executable"
git push
```

### `sudo: darwin-rebuild: command not found`

`sudo` resets `PATH` and doesn't include where nix-darwin installs `darwin-rebuild`. Use the full path, or just use `./rebuild.sh` (already handles this):

```bash
sudo /run/current-system/sw/bin/darwin-rebuild switch --flake .#mac
```

### "command not found" on a tool that should exist

1. Did you run `./bootstrap.sh` (or `./rebuild.sh` if already bootstrapped)? It's what wires up `~/.zshrc`, PATH, and every dotfile symlink.
2. Did you restart your shell after install? Run `exec zsh` or open a new tab.
3. Check the tool is actually declared: `grep <tool> configuration.nix home.nix`.
4. For language tools (node, python, go): run `asdf current` to verify the active version is installed.

### Icons show as squares in Starship / eza

Your terminal isn't using a Nerd Font. Check `home/.config/ghostty/config`:

```
font-family = Hack Nerd Font
```

The spaces matter. See [`docs/cheatsheets/ghostty-cheatsheet.md`](docs/cheatsheets/ghostty-cheatsheet.md#themes--fonts) for details.

### Ghostty Quick Terminal doesn't respond

Accessibility permission not granted. Go to System Settings > Privacy & Security > Accessibility, add Ghostty, restart Ghostty.

### SSH session looks broken (vim / less render incorrectly)

The remote host doesn't have Ghostty's terminfo. Your `home/.config/ghostty/config` already sets `term = xterm-256color` to avoid this, but if you removed that line, re-add it.

### asdf says "No version is set for command X"

The `.tool-versions` file references a version that isn't installed yet:

```bash
asdf install
```

See [`docs/cheatsheets/asdf-cheatsheet.md`](docs/cheatsheets/asdf-cheatsheet.md#troubleshooting) for deeper issues.

### `darwin-rebuild switch` fails on a Homebrew step

Usually means Homebrew itself needs repair:

```bash
sudo chown -R $(whoami) /opt/homebrew
brew doctor
```

See [`docs/cheatsheets/homebrew-cheatsheet.md`](docs/cheatsheets/homebrew-cheatsheet.md#common-pitfalls). Note: `brew doctor` will report this Homebrew install as "managed by Nix" (Tier 3) — that's expected since nix-homebrew owns it; ignore warnings that only apply to a plain native Homebrew install.

### Atuin doesn't import my old history

See [Shell History (atuin)](docs/cheatsheets/modern-cli-cheatsheet.md#shell-history-atuin) in the modern CLI cheat sheet.

### Starting over on a single tool

```bash
# Reinstall a Homebrew cask
brew reinstall --cask <app-name>

# Reset an asdf tool (version from .tool-versions)
asdf uninstall <language> <version>
asdf install

# Reload shell config without restarting
reload
```

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Cheat Sheets & References

Full command references for the tools that get the most daily use. These live in `docs/cheatsheets/` so you can open them in-repo rather than fishing through web docs (this folder doubles as an Obsidian vault — see `home.nix`'s `Documents/workspace/my-matrix/a-utils/cheatsheets` symlink):

- **[Software inventory](docs/inventory.md)**: full list of GUI apps, CLI tools, and language runtimes — update this whenever `configuration.nix`, `home.nix`, or `.tool-versions` changes
- **[Nix cheat sheet](docs/cheatsheets/nix-cheatsheet.md)**: `darwin-rebuild` workflow, rollback, generations, garbage collection, the `homebrew.onActivation.cleanup` gotcha
- **[Homebrew cheat sheet](docs/cheatsheets/homebrew-cheatsheet.md)**: install, daily commands, nix-homebrew notes, FAQ, common pitfalls
- **[asdf cheat sheet](docs/cheatsheets/asdf-cheatsheet.md)**: plugin management, version commands, `.tool-versions` format, CI integration, troubleshooting
- **[Ghostty cheat sheet](docs/cheatsheets/ghostty-cheatsheet.md)**: default keybindings, config syntax, action reference, SSH terminfo fixes, themes and fonts
- **[Git cheat sheet](docs/cheatsheets/git-cheatsheet.md)**: daily workflow commands, branching, rebasing, undoing mistakes, stash, tags, `.gitignore` essentials, troubleshooting
- **[Lazygit cheat sheet](docs/cheatsheets/lazygit-cheatsheet.md)**: panel navigation, default keybindings, line-staging, interactive rebase workflows, custom commands
- **[Modern CLI tools cheat sheet](docs/cheatsheets/modern-cli-cheatsheet.md)**: ripgrep, fd, bat, eza, zoxide, fzf, atuin, delta, dust, btop, tldr. Usage per tool plus composition examples
- **[Docker cheat sheet](docs/cheatsheets/docker-cheatsheet.md)**: images, containers, volumes, networks, Docker Compose, Dockerfile basics, disk cleanup, troubleshooting
- **[Claude Code cheat sheet](docs/cheatsheets/claude-code-cheatsheet.md)**: CLI flags, slash commands, keyboard shortcuts, permission modes, CLAUDE.md, hooks, MCP, subagents, models and cost
- **[Cursor CLI cheat sheet](docs/cheatsheets/cursor-cli-cheatsheet.md)**: agent modes (Agent/Plan/Ask), slash commands, cloud handoff, MCP integration, rules and skills, subagents
- **[Pi cheat sheet](docs/cheatsheets/pi-cheatsheet.md)**: minimal coding agent harness — CLI flags, slash commands, AGENTS.md/skills, packages and extensions
- **[Herdr cheat sheet](docs/cheatsheets/herdr-cheatsheet.md)**: session/workspace/tab/pane model, tmux-style keybindings, worktrees, agent integrations, socket API for scripting agents

Each is written as a skimmable reference, not a tutorial. Use them when you need to look something up.

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Repository Layout

```
dotfiles/
├── README.md                  # this file (orientation + daily reference)
├── CLAUDE.md                  # governance rules for Claude Code working in this repo
├── bootstrap.sh                # single entry point: fresh-machine bootstrap (idempotent)
├── rebuild.sh                  # daily use: re-apply configuration.nix/home.nix after editing
├── update.sh                  # update all package managers and tools
├── verify.sh                  # end-to-end smoke test (run after bootstrap.sh)
├── flake.nix                  # Nix flake entry point (inputs, darwinConfigurations)
├── flake.lock                 # pinned input versions
├── configuration.nix           # system defaults + Homebrew (casks, asdf, tapped tools)
├── home.nix                    # home-manager: CLI packages, zsh/starship, dotfile symlinks
├── Brewfile                    # RETIRED — pointer stub, superseded by configuration.nix
├── home/                       # edit-in-place source for home-manager's mkOutOfStoreSymlink files
│   ├── AGENTS.md                # shared agent instructions (Claude, Codex, opencode, Pi, Cursor)
│   ├── .tool-versions            # asdf runtime versions (Node, Python, Go, Java)
│   ├── .claude/
│   │   └── settings.json        # Claude Code settings (theme, statusline)
│   └── .config/
│       ├── wezterm/wezterm.lua
│       ├── ghostty/config
│       ├── nvim/                # lazy.nvim config: init.lua, vim_config.lua, keys.lua, plugin.lua, plugins/
│       ├── herdr/config.toml
│       └── linearmouse/linearmouse.json
└── docs/
    ├── inventory.md               # full list of installed apps, tools, and runtimes
    └── cheatsheets/
        ├── README.md               # cheatsheet index (also an Obsidian vault folder)
        ├── nix-cheatsheet.md
        ├── homebrew-cheatsheet.md
        ├── asdf-cheatsheet.md
        ├── ghostty-cheatsheet.md
        ├── git-cheatsheet.md
        ├── lazygit-cheatsheet.md
        ├── modern-cli-cheatsheet.md
        ├── docker-cheatsheet.md
        ├── claude-code-cheatsheet.md
        └── cursor-cli-cheatsheet.md
```

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>

---

## Design Decisions (Short Version)

A few choices that drive the rest of the setup. Full context is in the cheat sheets, but the gist:

- **nix-darwin + home-manager over plain Homebrew + shell scripts**: declarative, atomically-applied config with one-command rollback (`darwin-rebuild --rollback`) beats an imperative install script with no undo. See [`docs/cheatsheets/nix-cheatsheet.md`](docs/cheatsheets/nix-cheatsheet.md).
- **Homebrew kept, not replaced**: GUI `.app` bundles and a few tools not worth repackaging (asdf, terraform, stripe) stay Homebrew-managed via nix-homebrew, declared in `configuration.nix`. CLI tools available in nixpkgs moved to `home.nix`'s `home.packages`.
- **Ghostty and WezTerm, both kept**: rather than picking one, both stay maintained in parallel (`rose-pine-moon` theme, Hack Nerd Font, matching split keybindings) since both had real, independent customization worth preserving.
- **Native home-manager zsh plugins over Antidote**: `programs.zsh.autosuggestion`/`syntaxHighlighting` replace the Antidote plugin manager entirely — fewer moving parts, same behavior.
- **Starship over Powerlevel10k**: P10k is on life support; Starship is actively maintained and cross-shell
- **asdf over pyenv/nvm/rbenv, and over Nix for runtimes**: one tool replaces all of them; single `.tool-versions` file per project. Kept outside Nix's management deliberately — asdf's per-project override (walking up the directory tree) is a workflow Nix doesn't replicate without a heavier devshell/direnv setup.
- **Zsh kept as login shell**: POSIX-compatible (unlike Fish) and already the macOS default
- **Claude Code via Homebrew cask, not the native installer**: `configuration.nix`'s `homebrew.onActivation.autoUpdate` keeps it current on every switch, consistent with how every other package in this repo updates.
- **Docker for all local databases**: `configuration.nix` intentionally omits `postgresql` / `redis` so they don't conflict with container-based local environments

<p align="right"><a href="#table-of-contents">↑ Back to top</a></p>
