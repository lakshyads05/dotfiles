{ user, ... }:

{
  # Determinate already manages the Nix daemon, so nix-darwin shouldn't.
  nix.enable = false;

  nixpkgs.config.allowUnfree = true;
  nixpkgs.hostPlatform = "aarch64-darwin"; # use x86_64-darwin for Intel CPU

  system.primaryUser = user;
  users.users.${user} = {
    home = "/Users/${user}";
  };
  system.stateVersion = 6;

  system.defaults = {
    NSGlobalDomain = {
      AppleInterfaceStyle = "Dark";
      KeyRepeat = 2;          # fast key repeat
      InitialKeyRepeat = 15;  # short delay before repeat
      _HIHideMenuBar = true;  # auto-hide the menu bar
      AppleShowAllExtensions = true;
    };
    dock.autohide = true;
    finder.FXPreferredViewStyle = "Nlsv";  # list view by default
    finder.CreateDesktop = false;          # clean desktop
    trackpad.Clicking = true;              # tap to click
  };


  nix-homebrew = {
    enable = true;
    inherit user;
    # This Mac already has a native Homebrew install. autoMigrate lets
    # nix-homebrew adopt it: it deletes and recreates Homebrew's own
    # management directory (the `brew` tool + git metadata), but leaves
    # already-installed formulae/casks (Cellar/Caskroom) untouched.
    autoMigrate = true;
  };

  homebrew = {
    enable = true;
    onActivation.autoUpdate = true;
    # Start at "none", not "zap": undeclared casks/formulae are left alone
    # rather than force-uninstalled. Only consider "zap" once `brew list`
    # has been verified to match this list exactly after a few switches.
    onActivation.cleanup = "none";

    taps = [
      "hashicorp/tap"
      "stripe/stripe-cli"
      "kunchenguid/tap"
    ];

    # CLI tools that exist in nixpkgs (ripgrep, fd, bat, eza, zoxide, fzf,
    # delta, lazygit, btop, dust, tldr, atuin, neovim, starship, jq,
    # tree, wget, git, gh, opencode) are now installed via home.nix's
    # home.packages / programs.* instead of here — see home.nix. antidote is
    # dropped entirely (native home-manager zsh plugins replace it). Only
    # things genuinely still Homebrew's job stay in this list: asdf itself
    # (runtimes stay asdf-managed by design) and its build-support libs, plus
    # the two tapped tools not worth moving.
    brews = [
      "asdf"
      "coreutils"
      "openssl@3"
      "readline"
      "xz"
      "hashicorp/tap/terraform"
      "stripe/stripe-cli/stripe"
      "herdr" # agent multiplexer for the terminal (tmux-style, config in home/.config/herdr)
    ];

    casks = [
      # Containers
      "docker-desktop"
      # Cloud tooling
      "gcloud-cli"
      # Terminal emulators & editors
      "ghostty"
      "wezterm"
      "visual-studio-code"
      "cursor"
      # AI coding tools
      "claude"
      "claude-code"
      "codex"
      "codex-app"
      # Browsers
      "google-chrome"
      "firefox"
      "chatgpt-atlas"
      # Productivity & utilities
      "rectangle"
      "appcleaner"
      "maccy"
      "linearmouse"
      "opensuperwhisper"
      "obsidian"
      "kunchenguid/tap/baby-menu"  # agent-editable menu bar (https://github.com/kunchenguid/baby-menu)
      # API testing
      "granola"
      "postman"
      "whimsical"
    ];
  };
}
