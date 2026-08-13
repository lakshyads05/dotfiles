{ config, pkgs, user, lib, ... }:

let
  dotfiles = "${config.home.homeDirectory}/.dotfiles";
in

{
  home.username = user;
  home.homeDirectory = "/Users/${user}";
  home.stateVersion = "26.05";

  home.packages = with pkgs; [
    # Modern CLI replacements & utilities not covered by a programs.* module
    ripgrep     # fast search
    fd          # fast find
    bat         # 
    lazygit
    eza         #
    btop
    delta
    dust
    tldr
    neovim
    tree-sitter  # CLI nvim-treesitter shells out to for compiling parsers
    jq
    tree
    wget
    git
    gh
    opencode
    pi-coding-agent  # binary: pi — minimal coding agent harness (https://pi.dev)
    zsh-completions
    # Fonts — Hack is the primary system font (Ghostty/WezTerm); JetBrains
    # Mono and Fira Code stay installed as alternatives. See README.md
    # "Customization" for how to switch.
    nerd-fonts.hack
    nerd-fonts.jetbrains-mono
    nerd-fonts.fira-code
  ];
  fonts.fontconfig.enable = true;

  home.sessionVariables.EDITOR = "nvim";

  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;      # ghost text from history (replaces zsh-autosuggestions)
    syntaxHighlighting.enable = true;  # commands turn green when valid (replaces zsh-syntax-highlighting)
    enableCompletion = true;           # replaces zsh-completions plugin + manual compinit

    shellAliases = {
      ".." = "cd ..";
      "..." = "cd ../..";
      "...." = "cd ../../..";

      # Modern CLI replacements
      ls = "eza --icons --group-directories-first";
      ll = "eza -lah --git --icons";
      # lt = full-depth tree listing; lt2 = capped at 2 levels (former lt default).
      lt = "eza --tree --icons";
      lt2 = "lt --level=2";
      lt3 = "lt --level=3";
      lt4 = "lt --level=4";
      lt5 = "lt --level=5";
      lt6 = "lt --level=6";
      lsa = "ls -a";
      lla = "ll -a";
      cat = "bat --paging=never";
      top = "btop";
      du = "dust";
      vi = "nvim";
      vim = "vi";

      # Git shortcuts
      g = "git";
      gs = "git status";
      gd = "git diff";
      gds = "git diff --staged";
      gl = "git log --oneline --graph --decorate -20";
      gla = "git log";
      lg = "lazygit";
      add = "git add .";
      push = "git push";
      pull = "git pull";
      m = "git switch main";

      reload = "exec zsh";

      # High-agency agent shortcuts — opt-in, bypass permission prompts.
      cc = "claude";
      ccc = "claude --dangerously-skip-permissions";
      co = "codex";
      coo = "codex -a never -s workspace-write";
      aa = "agent"; 
      aaa = "agent -f"; 
    };

    initContent = lib.mkMerge [
      (lib.mkBefore ''
        # Homebrew PATH (Apple Silicon) — must come first; most tools live under /opt/homebrew.
        eval "$(/opt/homebrew/bin/brew shellenv)"

        # asdf shims — must come before any tool that might invoke node/python/go.
        export PATH="''${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"

        # ~/.local/bin: user-installed tools not managed by Nix/Homebrew (e.g.
        # Cursor's `agent`/`cursor-agent` CLI, pip --user scripts). Appended
        # AFTER Homebrew's path on purpose — a stale ~/.local/bin/claude
        # symlink from Claude's old native installer lives here too, and it
        # must never shadow the current claude-code cask binary.
        export PATH="$PATH:$HOME/.local/bin"

        # zsh-completions extra definitions (git, docker, kubectl, etc.) — must load before compinit.
        fpath+=(${pkgs.zsh-completions}/share/zsh/site-functions)
      '')
      ''
        # wtnew <branch> [base-branch] [target-path]: create a git worktree
        # inside a bare-repo-pattern project (one with a .bare/ dir), as a
        # sibling of .bare, and attach a herdr session to it if herdr is
        # installed. Discovers the project root by walking up from $PWD, so
        # it works from any project using this convention, not just one repo.
        # base-branch defaults to the bare repo's origin/HEAD (per-project,
        # e.g. set via `git --git-dir=.bare symbolic-ref refs/remotes/origin/HEAD
        # refs/remotes/origin/develop`); target-path defaults to
        # <project-root>/<branch>. If the target path is already a registered
        # worktree of this repo, wtnew skips creation and just (re)attaches a
        # herdr session to it - so the same command works for both making a
        # new worktree and opening an existing one.
        wtnew() {
          local branch="$1" base="$2" target="$3"
          if [[ -z "$branch" ]]; then
            echo "usage: wtnew <branch> [base-branch] [target-path]" >&2
            return 1
          fi

          local dir="$PWD" bare=""
          while [[ "$dir" != "/" ]]; do
            if [[ -d "$dir/.bare" ]]; then
              bare="$dir/.bare"
              break
            fi
            dir="$(dirname "$dir")"
          done

          if [[ -z "$bare" ]]; then
            echo "wtnew: no .bare directory found above $PWD" >&2
            return 1
          fi

          target="''${target:-$dir/$branch}"
          if [[ -e "$target" ]]; then
            if git --git-dir="$bare" worktree list --porcelain | grep -qx "worktree $target"; then
              if command -v herdr >/dev/null 2>&1; then
                herdr worktree open --cwd "$dir" --path "$target" >/dev/null 2>&1
              fi
              return 0
            fi
            echo "wtnew: $target already exists" >&2
            return 1
          fi

          if [[ -z "$base" ]]; then
            base="$(git --git-dir="$bare" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
            base="''${base:-main}"
          fi

          # A bare clone mirrors origin's refs/heads/* directly with no
          # remote-tracking refs populated (remote.origin.fetch unset), so
          # refs/remotes/origin/$branch can be missing or stale even when the
          # branch genuinely exists on origin. Deciding "does this branch
          # exist on origin" from that local mirror is unreliable - ask origin
          # directly with a targeted fetch of just that one ref first, and use
          # that as the source of truth for both the checkout path and the
          # tracking backfill below. $branch MUST stay braced (''${branch})
          # here: zsh parses an unbraced "$branch:refs/..." as the :r history
          # modifier (strip suffix) rather than literal text, silently
          # mangling the refspec and making every fetch below fail.
          git --git-dir="$bare" config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
          local on_origin=1
          git --git-dir="$bare" fetch -q origin "refs/heads/''${branch}:refs/remotes/origin/''${branch}" 2>/dev/null || on_origin=0

          if git --git-dir="$bare" show-ref --verify --quiet "refs/heads/$branch"; then
            git --git-dir="$bare" worktree add "$target" "$branch" || return 1
            if [[ "$on_origin" == 1 ]] && ! git --git-dir="$bare" rev-parse --abbrev-ref --symbolic-full-name "$branch@{upstream}" >/dev/null 2>&1; then
              git --git-dir="$bare" branch --set-upstream-to="origin/$branch" "$branch"
            fi
          elif [[ "$on_origin" == 1 ]]; then
            # Local branch doesn't exist yet but origin does - create it
            # directly from the remote-tracking ref so git's default
            # branch.autoSetupMerge wires up tracking automatically.
            git --git-dir="$bare" worktree add "$target" -b "$branch" "origin/$branch" || return 1
          else
            git --git-dir="$bare" worktree add -b "$branch" "$target" "$base" || return 1
          fi

          if command -v herdr >/dev/null 2>&1; then
            # --cwd "$dir" scopes this to the repo's parent workspace explicitly;
            # without it, herdr infers scope from the calling pane and refuses
            # ("linked_worktree_source") when wtnew is run from inside another
            # worktree instead of the bare-repo root.
            herdr worktree open --cwd "$dir" --path "$target" >/dev/null 2>&1
          fi
        }

        # Ctrl+F accepts the current autosuggestion (ghost text from history).
       bindkey '^f' autosuggest-accept

        # fzf preview integration. Uses bat for file contents, eza for directory trees.
        export FZF_CTRL_T_OPTS="--preview 'bat -n --color=always --line-range :500 {}'"
        export FZF_ALT_C_OPTS="--preview 'eza --tree --color=always {} | head -200'"

        # Docker CLI completions (added by Docker Desktop on first launch).
        if [[ -d "$HOME/.docker/completions" ]]; then
          fpath=($HOME/.docker/completions $fpath)
        fi
      ''
    ];
  };

  programs.starship = {
    enable = true;
    enableZshIntegration = true;
    settings = {
      format = "$directory$git_branch$git_status$nodejs$python$golang$cmd_duration$line_break$character";
      # Character colors match reference; segments (nodejs/python/golang)
      # kept from the pre-migration config since they're actively useful here.
      character = {
        success_symbol = "[❯](purple)";
        error_symbol = "[❯](red)";
      };
      directory = {
        truncation_length = 3;
        truncate_to_repo = true;
        style = "bold cyan";
      };
      git_branch = {
        symbol = " ";
        style = "bold purple";
      };
      git_status.style = "bold red";
      cmd_duration = {
        min_time = 2000;
        format = "[$duration]($style) ";
        style = "yellow";
      };
      python = {
        symbol = " ";
        format = "[$symbol$pyenv_prefix($version )(\\($virtualenv\\) )]($style)";
        style = "yellow";
      };
      nodejs = {
        symbol = " ";
        format = "[$symbol($version )]($style)";
        style = "green";
      };
      golang = {
        symbol = " ";
        format = "[$symbol($version )]($style)";
        style = "cyan";
      };
    };
  };

  programs.zoxide = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.atuin = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
  };

  # programs.git writes its generated config to the XDG path
  # ~/.config/git/config (confirmed for the home-manager rev pinned in
  # flake.lock, release-26.05) — it never touches ~/.gitconfig. That means
  # bootstrap.sh's interactive identity prompt (git config --global
  # user.name/user.email, written directly to ~/.gitconfig) keeps working
  # untouched, while delta/merge/pager config lives here declaratively
  # instead of in a separate configs/gitconfig file.
  programs.git = {
    enable = true;
    settings = {
      core.pager = "delta";
      interactive.diffFilter = "delta --color-only";
      delta = {
        navigate = true;
        light = false;
        "line-numbers" = true;
        "side-by-side" = true;
      };
      merge.conflictStyle = "zdiff3";
    };
  };

  #############
  # SYM-LINKS #
  #############

  # Edit-in-place: the real files stay in this repo, ~/.config just points at them.
  home.file.".config/wezterm".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.config/wezterm";
  home.file.".config/ghostty".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.config/ghostty"; home.file.".config/nvim".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.config/nvim";
  home.file.".config/herdr".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.config/herdr";

  home.file.".claude/CLAUDE.md".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/AGENTS.md";
  home.file.".codex/AGENTS.md".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/AGENTS.md";
  home.file.".config/opencode/AGENTS.md".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/AGENTS.md";
  home.file.".pi/agent/AGENTS.md".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/AGENTS.md";

  home.file.".claude/settings.json".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.claude/settings.json";
  home.file.".claude/statusline-command.sh".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.claude/statusline-command.sh";

  # Skills shared across agent CLIs, all reading the same open SKILL.md
  # format (frontmatter: name + description). ~/.agents/skills is the canonical
  # registry; Codex, Cursor, opencode, and pi scan it natively.
  # Claude Code is the one exception: it only reads its own ~/.claude/skills
  # folder, so anything meant for Claude Code needs an explicit symlink
  # there too. See docs/inventory.md#shared-agent-skills for the full model.
  home.file.".agents/skills/smell".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/smell";
  home.file.".claude/skills/smell".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/smell";
  home.file.".agents/skills/commit-message".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/commit-message";
  home.file.".claude/skills/commit-message".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/commit-message";
  home.file.".agents/skills/pr-description".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/pr-description";
  home.file.".claude/skills/pr-description".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/pr-description";
  home.file.".agents/skills/architecture-plan".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/architecture-plan";
  home.file.".claude/skills/architecture-plan".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/skills/architecture-plan";

  home.file.".tool-versions".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.tool-versions";

  # CheatSheets symlink setup: this repo's docs/cheatsheets/ is the source of
  # truth; a-utils/cheatsheets just points at it.
  home.file."Documents/workspace/my-matrix/a-utils/cheatsheets".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/docs/cheatsheets";

  # LinearMouse writes back to its config file through the GUI's own
  # preferences UI (no export step) — mkOutOfStoreSymlink keeps the real
  # file in this repo instead of the read-only Nix store, and the
  # activation script below preserves any pre-existing real file the same
  # way bootstrap.sh's backup-before-symlink logic did.
  home.file.".config/linearmouse/linearmouse.json".source =
    config.lib.file.mkOutOfStoreSymlink "${dotfiles}/home/.config/linearmouse/linearmouse.json";

  home.activation.backupLinearMouseConfig = lib.hm.dag.entryBefore [ "checkLinkTargets" ] ''
    TARGET="$HOME/.config/linearmouse/linearmouse.json"
    if [[ -f "$TARGET" && ! -L "$TARGET" ]]; then
      BACKUP="$TARGET.backup.$(date +%Y%m%d-%H%M%S)"
      $DRY_RUN_CMD mv "$TARGET" "$BACKUP"
    fi
  '';
}
