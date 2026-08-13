#!/usr/bin/env bash
# verify.sh: Smoke test of the macOS developer setup.
#
# Package/dotfile declarations themselves are validated structurally by
# `nix flake check --no-build` (run as part of this script) — that's the
# primary contract now, not this file. What's left here is what Nix can't
# express: is everything actually wired up on THIS machine right now, GUI
# app presence/signed-in state, and the handful of things bootstrap.sh still
# manages directly (git identity, asdf runtimes).
#
# Exit code 0 if all critical checks pass; 1 if any fail (with summary).
#
# Usage:
#   ./verify.sh

# shellcheck disable=SC2317  # helpers called indirectly via loops
# shellcheck disable=SC2088  # tildes in display labels are intentional

set -uo pipefail
# Deliberately NOT set -e — continue past individual failures for a full report.

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PASS=0; FAIL=0; WARN=0
FAILURES=()

# ── Output helpers ────────────────────────────────────────────────────────────
pass()   { printf "\033[0;32m  ✓\033[0m  %s\n"  "$*"; PASS=$((PASS+1)); }
fail()   { printf "\033[0;31m  ✗\033[0m  %s\n"  "$*"; FAIL=$((FAIL+1)); FAILURES+=("$*"); }
warn_m() { printf "\033[0;33m  !\033[0m  %s\n"  "$*"; WARN=$((WARN+1)); }
info()   { printf "\n\033[1;36m━━  %s\033[0m\n" "$*"; }

# ── Check helpers ─────────────────────────────────────────────────────────────

check_command() {
  local cmd="$1" label="${2:-$1}"
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$label on PATH"
  else
    fail "$label not found on PATH"
  fi
}

# Verify a path resolves (through any number of symlink hops, e.g. the
# mkOutOfStoreSymlink -> nix-store -> repo chain home-manager creates) back
# into this repo. Used for "edit-in-place" files whose real content lives here.
check_resolves_to_repo() {
  local path="$1" label="${2:-$path}"
  if [[ -e "$path" ]]; then
    local resolved; resolved=$(realpath "$path" 2>/dev/null || echo "")
    if [[ "$resolved" == "$DOTFILES_DIR"* ]]; then
      pass "$label → $resolved"
    else
      warn_m "$label exists but resolves outside dotfiles repo: $resolved"
    fi
  else
    fail "$label missing"
  fi
}

# Same as check_resolves_to_repo, but for symlink targets that depend on
# machine-specific state outside this repo (e.g. an external workspace
# checkout that isn't guaranteed to exist on every machine this repo is
# cloned onto). A missing target here is a warn, not a hard fail.
check_resolves_to_repo_optional() {
  local path="$1" label="${2:-$path}"
  if [[ -e "$path" ]]; then
    local resolved; resolved=$(realpath "$path" 2>/dev/null || echo "")
    if [[ "$resolved" == "$DOTFILES_DIR"* ]]; then
      pass "$label → $resolved"
    else
      warn_m "$label exists but resolves outside dotfiles repo: $resolved"
    fi
  else
    warn_m "$label missing (optional: depends on external workspace)"
  fi
}

# Verify a home-manager-*generated* file exists (its real content is a
# Nix-store-managed file, not something in this repo, so we just check it's
# there rather than expecting it to resolve back into the repo).
check_nonempty() {
  local path="$1" label="${2:-$path}"
  if [[ -s "$path" ]]; then
    pass "$label exists and is non-empty"
  else
    fail "$label missing or empty"
  fi
}

# Verify a config file contains an expected pattern.
check_contains() {
  local file="$1" pattern="$2" label="$3"
  if [[ ! -f "$file" ]]; then
    fail "$label: file not found ($file)"
  elif grep -q "$pattern" "$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label  (expected pattern not found: $pattern)"
  fi
}

# Verify a file is valid JSON.
check_json() {
  local file="$1" label="${2:-$file}"
  if [[ ! -f "$file" ]]; then
    fail "$label: file not found"
  elif python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$file" 2>/dev/null; then
    pass "$label is valid JSON"
  else
    fail "$label is not valid JSON"
  fi
}

echo
printf "\033[1;36m══  macOS Developer Setup: Verification  ══\033[0m\n"

# ── 1. Nix / nix-darwin / Homebrew ────────────────────────────────────────────
info "1. Nix / nix-darwin / Homebrew"
check_command nix "Nix"
if command -v darwin-rebuild >/dev/null 2>&1 || [[ -x /run/current-system/sw/bin/darwin-rebuild ]]; then
  pass "darwin-rebuild available"
else
  fail "darwin-rebuild not found — run ./bootstrap.sh"
fi
if command -v nix >/dev/null 2>&1; then
  info "Validating flake (nix flake check --no-build) …"
  if (cd "$DOTFILES_DIR" && nix flake check --no-build >/dev/null 2>&1); then
    pass "flake.nix / configuration.nix / home.nix evaluate cleanly"
  else
    fail "flake evaluation failed — run: nix flake check --no-build"
  fi
fi
check_command brew "Homebrew"
if command -v brew >/dev/null 2>&1; then
  prefix="$(brew --prefix)"
  if [[ "$prefix" == "/opt/homebrew" ]]; then
    pass "Homebrew prefix: /opt/homebrew (Apple Silicon)"
  else
    warn_m "Homebrew prefix: $prefix (expected /opt/homebrew on Apple Silicon)"
  fi
fi

# ── 2. Language Runtimes (asdf) ───────────────────────────────────────────────
info "2. Language Runtimes (asdf)"
check_command asdf "asdf"
if command -v asdf >/dev/null 2>&1; then
  for lang in nodejs python golang java; do
    if asdf current "$lang" >/dev/null 2>&1; then
      ver=$(asdf current "$lang" 2>/dev/null | awk -v l="$lang" '$1 == l {print $2}')
      tv_ver=$(grep "^${lang}" "$DOTFILES_DIR/home/.tool-versions" 2>/dev/null | awk '{print $2}')
      if [[ -n "$tv_ver" && "$ver" == "$tv_ver" ]]; then
        pass "asdf $lang: $ver (matches .tool-versions)"
      elif [[ -n "$tv_ver" ]]; then
        warn_m "asdf $lang: active=$ver, .tool-versions=$tv_ver (mismatch)"
      else
        pass "asdf $lang: $ver"
      fi
    else
      fail "asdf $lang not configured (run: ./bootstrap.sh)"
    fi
  done
  for bin in node python go java; do
    check_command "$bin" "$bin shim"
  done
fi

# ── 3. Shell Stack ────────────────────────────────────────────────────────────
info "3. Shell Stack"
if [[ "$SHELL" == *zsh* ]]; then
  pass "Login shell: zsh ($SHELL)"
else
  warn_m "Login shell is $SHELL (expected zsh) — run: chsh -s $(which zsh 2>/dev/null || echo zsh)"
fi
check_command starship "Starship"

# Native home-manager zsh plugins — antidote was retired in favor of these.
check_contains "$HOME/.zshrc" "zsh-autosuggestions"     ".zshrc: autosuggestion enabled"
check_contains "$HOME/.zshrc" "zsh-syntax-highlighting" ".zshrc: syntax-highlighting enabled"
check_contains "$HOME/.zshrc" "starship init"           ".zshrc: initializes Starship"
check_contains "$HOME/.zshrc" "asdf"                    ".zshrc: initializes asdf shims"
check_contains "$HOME/.zshrc" "zoxide"                  ".zshrc: initializes zoxide"
check_contains "$HOME/.zshrc" "atuin"                   ".zshrc: initializes atuin"

# ── 4. Modern CLI Tools ───────────────────────────────────────────────────────
info "4. Modern CLI Tools"
for tool in rg fd bat eza zoxide fzf delta lazygit btop dust tldr atuin nvim tree-sitter; do
  check_command "$tool" "$tool"
done

# ── 4b. AI Coding CLIs ────────────────────────────────────────────────────────
info "4b. AI Coding CLIs"
check_command claude  "claude (Claude Code CLI)"
check_command codex   "codex (OpenAI Codex CLI)"
check_command opencode "opencode (AI coding agent)"
check_command pi      "pi (Pi coding agent)"
check_command agent   "agent (Cursor CLI)"

# ── 5. Git & GitHub ───────────────────────────────────────────────────────────
info "5. Git & GitHub"
check_command git  "git"
check_command gh   "GitHub CLI"
if command -v git >/dev/null 2>&1; then
  name=$(git config --get user.name  2>/dev/null || echo "")
  email=$(git config --get user.email 2>/dev/null || echo "")
  branch=$(git config --get init.defaultBranch 2>/dev/null || echo "")
  [[ -n "$name"   ]] && pass "git user.name: $name"   || fail "git user.name not set (run: ./bootstrap.sh)"
  [[ -n "$email"  ]] && pass "git user.email: $email"  || fail "git user.email not set (run: ./bootstrap.sh)"
  [[ -n "$branch" ]] && pass "git init.defaultBranch: $branch" \
                     || warn_m "git init.defaultBranch not set (will default to 'master')"
fi

# ── 6. Cloud Tools ────────────────────────────────────────────────────────────
info "6. Cloud Tools"
check_command gcloud "gcloud (Google Cloud CLI)"
check_command terraform "terraform"
check_command stripe "stripe"

# ── 7. Dotfile Wiring ─────────────────────────────────────────────────────────
info "7. Dotfile Wiring"

# Edit-in-place: real content lives in this repo, home-manager just symlinks
# (via mkOutOfStoreSymlink) so editing here takes effect without a rebuild.
check_resolves_to_repo "$HOME/.config/wezterm/wezterm.lua"          "~/.config/wezterm/wezterm.lua"
check_resolves_to_repo "$HOME/.config/ghostty/config"               "~/.config/ghostty/config"
check_resolves_to_repo "$HOME/.config/nvim/init.lua"                "~/.config/nvim/init.lua"
check_resolves_to_repo "$HOME/.config/linearmouse/linearmouse.json" "~/.config/linearmouse/linearmouse.json"
check_resolves_to_repo "$HOME/.config/herdr/config.toml"            "~/.config/herdr/config.toml"
check_resolves_to_repo "$HOME/.baby-menu/extensions"                "~/.baby-menu/extensions"
check_resolves_to_repo "$HOME/.baby-menu/preferences.json"          "~/.baby-menu/preferences.json"
check_resolves_to_repo "$HOME/.baby-menu/agents.json"               "~/.baby-menu/agents.json"
check_resolves_to_repo_optional "$HOME/Documents/workspace/my-matrix/a-utils/cheatsheets" "~/Documents/workspace/my-matrix/a-utils/cheatsheets (optional: external workspace)"
check_resolves_to_repo "$HOME/.tool-versions"                       "~/.tool-versions (-> home/.tool-versions)"
check_resolves_to_repo "$HOME/.claude/CLAUDE.md"                    "~/.claude/CLAUDE.md (-> home/AGENTS.md)"
check_resolves_to_repo "$HOME/.codex/AGENTS.md"                     "~/.codex/AGENTS.md"
check_resolves_to_repo "$HOME/.config/opencode/AGENTS.md"           "~/.config/opencode/AGENTS.md"
check_resolves_to_repo "$HOME/.pi/agent/AGENTS.md"                  "~/.pi/agent/AGENTS.md"
check_resolves_to_repo "$HOME/.cursor/rules/master-rules.md"        "~/.cursor/rules/master-rules.md (-> home/AGENTS.md)"
check_resolves_to_repo "$HOME/.claude/settings.json"                "~/.claude/settings.json"
check_resolves_to_repo "$HOME/.claude/statusline-command.sh"        "~/.claude/statusline-command.sh"
check_resolves_to_repo "$HOME/.agents/skills/smell"                 "~/.agents/skills/smell (-> home/skills/smell)"
check_resolves_to_repo "$HOME/.claude/skills/smell"                 "~/.claude/skills/smell (-> home/skills/smell)"
check_resolves_to_repo "$HOME/.agents/skills/commit-message"        "~/.agents/skills/commit-message (-> home/skills/commit-message)"
check_resolves_to_repo "$HOME/.claude/skills/commit-message"        "~/.claude/skills/commit-message (-> home/skills/commit-message)"
check_resolves_to_repo "$HOME/.agents/skills/pr-description"        "~/.agents/skills/pr-description (-> home/skills/pr-description)"
check_resolves_to_repo "$HOME/.claude/skills/pr-description"        "~/.claude/skills/pr-description (-> home/skills/pr-description)"
check_resolves_to_repo "$HOME/.agents/skills/architecture-plan"      "~/.agents/skills/architecture-plan (-> home/skills/architecture-plan)"
check_resolves_to_repo "$HOME/.claude/skills/architecture-plan"      "~/.claude/skills/architecture-plan (-> home/skills/architecture-plan)"

# home-manager-generated: real content is a Nix-store-managed file, not
# something in this repo — just check it exists.
check_nonempty "$HOME/.zshrc"                "~/.zshrc (home-manager generated)"
check_nonempty "$HOME/.config/starship.toml" "~/.config/starship.toml (home-manager generated)"

# ── 8. Config File Integrity ──────────────────────────────────────────────────
info "8. Config File Integrity"

GHOSTTY_CFG="$HOME/.config/ghostty/config"
check_contains "$GHOSTTY_CFG" "font-family"           "ghostty-config: font-family set"
check_contains "$GHOSTTY_CFG" "term = xterm-256color" "ghostty-config: term=xterm-256color (SSH safety)"
check_contains "$GHOSTTY_CFG" "theme"                 "ghostty-config: theme set"

check_json "$HOME/.config/linearmouse/linearmouse.json" "linearmouse.json"
check_json "$HOME/.baby-menu/preferences.json" "baby-menu preferences.json"
check_json "$HOME/.baby-menu/agents.json" "baby-menu agents.json"
check_nonempty "$HOME/.baby-menu/extensions/layout.tsx" "~/.baby-menu/extensions/layout.tsx"

check_contains "$HOME/.config/git/config" 'pager = "delta"' "~/.config/git/config: delta pager configured (home-manager)"

# ── 9. GUI Applications ───────────────────────────────────────────────────────
info "9. GUI Applications"
APPS=(
  "Ghostty"
  "WezTerm"
  "Visual Studio Code"
  "Cursor"
  "Docker"
  "Google Chrome"
  "Firefox"
  "ChatGPT Atlas"
  "Rectangle"
  "AppCleaner"
  "Maccy"
  "LinearMouse"
  "OpenSuperWhisper"
  "Obsidian"
  "Granola"
  "Postman"
  "Whimsical"
  "Baby Menu"
  "Claude"
  "Codex"
)
for app in "${APPS[@]}"; do
  if [[ -d "/Applications/$app.app" ]]; then
    pass "$app"
  else
    fail "$app not found in /Applications"
  fi
done

# ── 10. Nerd Fonts ─────────────────────────────────────────────────────────────
info "10. Nerd Fonts"
for font_pattern in "JetBrainsMono" "FiraCode"; do
  label="${font_pattern} Nerd Font"
  if compgen -G "$HOME/Library/Fonts/${font_pattern}*" >/dev/null 2>&1 \
    || compgen -G "/Library/Fonts/${font_pattern}*" >/dev/null 2>&1 \
    || compgen -G "/Library/Fonts/Nix Fonts/${font_pattern}*" >/dev/null 2>&1; then
    pass "$label"
  else
    warn_m "$label not detected (icons may render as boxes)"
  fi
done

# ── 11. fzf Integration ────────────────────────────────────────────────────────
info "11. fzf Integration"
check_command fzf "fzf"
check_contains "$HOME/.zshrc" "FZF_CTRL_T_OPTS" ".zshrc: fzf preview options configured"

# ── Summary ───────────────────────────────────────────────────────────────────
printf "\n\033[1;36m━━  Summary\033[0m\n"
printf "  \033[0;32m%d passed\033[0m   \033[0;33m%d warnings\033[0m   \033[0;31m%d failed\033[0m\n\n" \
  "$PASS" "$WARN" "$FAIL"

if [[ $FAIL -gt 0 ]]; then
  printf "\033[0;31mFailed checks:\033[0m\n"
  for f in "${FAILURES[@]}"; do
    printf "  \033[0;31m✗\033[0m  %s\n" "$f"
  done
  echo
  exit 1
fi

printf "\033[0;32mAll critical checks passed.\033[0m\n"
exit 0
