---
tag:
  - type/cheatsheet
  - topic/git
related:
  - "[[lazygit-cheatsheet]]"
  - "[[asdf-cheatsheet]]"
---

# Git Cheat Sheet & Best Practices

A reference for git workflows that come up daily. Focused on what you actually use, organized by task, with the gotchas that cause real problems.

Official docs: <https://git-scm.com/doc>

---

## Table of Contents

- [First-Time Setup](#first-time-setup)
- [Starting a Repository](#starting-a-repository)
- [The Daily Loop](#the-daily-loop)
- [Branching](#branching)
- [Worktrees (Bare-Repo Pattern)](#worktrees-bare-repo-pattern)
- [Merging & Rebasing](#merging--rebasing)
- [Remote Work (Pushing, Pulling, Fetching)](#remote-work-pushing-pulling-fetching)
- [Inspecting History](#inspecting-history)
- [Code Smell Review](#code-smell-review)
- [Commit Message Conventions](#commit-message-conventions)
- [Pull Request Description Conventions](#pull-request-description-conventions)
- [Undoing Things](#undoing-things)
- [Stashing](#stashing)
- [Tags & Releases](#tags--releases)
- [Useful Configurations](#useful-configurations)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## First-Time Setup

```bash
# Identity (required for commits to attribute correctly)
git config --global user.name "Your Name"
git config --global user.email "you@example.com"

# Default branch name for new repos
git config --global init.defaultBranch main

# Use main as the default editor
git config --global core.editor "code --wait"   # VS Code
# or "vim", "nano", "cursor --wait", etc.

# Better diff output
git config --global core.pager "delta"          # requires git-delta installed

# Pull strategy: rebase instead of merge (cleaner linear history)
git config --global pull.rebase true
git config --global rebase.autoStash true       # stash local changes during rebase

# Push default: only the current branch
git config --global push.default simple

# Use SSH agent-forwarded keys automatically
git config --global core.sshCommand "ssh -o AddKeysToAgent=yes"

# Colors (on by default, but explicit is fine)
git config --global color.ui auto

# Remember credentials for HTTPS remotes (macOS)
git config --global credential.helper osxkeychain
```

Check what's set:

```bash
git config --list
git config --global --list
git config user.email                          # single key lookup
```

---

## Starting a Repository

```bash
# Start a new repo in the current dir
git init

# Clone an existing repo
git clone git@github.com:owner/repo.git
git clone git@github.com:owner/repo.git my-dir  # into a custom dir

# Shallow clone (faster; only recent history)
git clone --depth=1 git@github.com:owner/repo.git

# Clone with a specific branch
git clone -b develop git@github.com:owner/repo.git
```

---

## The Daily Loop

```bash
# What's changed?
git status                          # short: git status -s

# Stage specific files
git add path/to/file
git add src/                        # whole directory
git add -p                          # interactively pick hunks (invaluable)
git add .                           # everything in current dir

# Unstage
git restore --staged path/to/file   # modern syntax
git reset HEAD path/to/file         # older syntax, same effect

# Commit
git commit -m "feat: add login flow"
git commit                          # opens editor for full multi-line message
git commit --amend                  # edit the last commit (message or content)
git commit --amend --no-edit        # add staged changes without changing message

# Discard uncommitted changes (destructive)
git restore path/to/file            # unmodified -> working copy
git checkout -- path/to/file        # older syntax, same effect
```

### `git add -p` is a superpower

Instead of `git add file.js` (all changes) or `git add .` (everything), `git add -p` walks you through each hunk. Lets you split a messy working directory into focused commits without manually editing files.

Keys during interactive mode:
- `y`: stage this hunk
- `n`: skip this hunk
- `s`: split into smaller hunks
- `e`: manually edit the hunk
- `q`: quit

---

## Branching

```bash
# List branches
git branch                          # local
git branch -r                       # remote-tracking
git branch -a                       # all

# Create and switch
git switch -c feature/login         # modern, preferred
git checkout -b feature/login       # older syntax

# Just switch
git switch main
git checkout main

# Switch to previous branch (like `cd -`)
git switch -
git checkout -

# Rename the current branch
git branch -m new-name

# Delete a local branch
git branch -d feature/login         # safe: refuses if unmerged
git branch -D feature/login         # force delete

# Delete a remote branch
git push origin --delete feature/login
```

### Clean up merged branches

```bash
# List merged branches (skip main)
git branch --merged | grep -v "main\|master\|\*"

# Delete them all (one-liner)
git branch --merged | grep -v "main\|master\|\*" | xargs -n 1 git branch -d
```

---

## Worktrees (Bare-Repo Pattern)

For projects with many parallel branches in flight (e.g. running multiple coding agents across features), use a bare repo as the project's git store, with every branch — including the default one — checked out as an equal-status sibling worktree. No single "primary" clone; no asymmetry.

```
tatbiq/
├── .bare/          # bare repo — the actual git store
├── .git            # file: "gitdir: ./.bare"
├── main/            # one worktree per branch, named after the branch
├── feature/
│   └── x/           # slash in branch name nests the worktree dir to match
└── td-130/
```

### Setting one up from scratch

```bash
mkdir myproject && cd myproject
git clone --bare git@github.com:org/myproject.git .bare
git --git-dir=.bare config core.bare true
git --git-dir=.bare config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
git --git-dir=.bare fetch origin
# `clone --bare` mirrors origin's branches straight into refs/heads with no
# tracking info attached. Wipe them now (refs/remotes/origin/* above already
# has everything) so the first `worktree add` of each branch goes through
# git's normal DWIM tracking setup instead of silently skipping it.
git --git-dir=.bare for-each-ref --format='delete %(refname)' refs/heads | git --git-dir=.bare update-ref --stdin
printf 'gitdir: ./.bare\n' > .git
git worktree add main main
```

### Day to day

```bash
git worktree list                       # see every worktree (run from anywhere in the tree)
git worktree add <path> <branch>        # add one for an existing branch
git worktree add -b <branch> <path> <base>  # create a new branch off <base> as a worktree
git worktree remove <path>              # deregister + delete; NEVER just `rm -rf` a worktree dir —
                                         # that leaves a stale/prunable entry behind
git worktree prune                      # clean up stale entries after a manual rm -rf
git worktree lock <path>                # protect a worktree (e.g. on a network/removable drive) from pruning
```

Gotchas:
- Git refuses to check out the same branch in two worktrees at once — relevant when parallelizing agents, since each needs its own branch.
- Hooks and local git config are shared across all worktrees (one `.bare`); a `git fetch` in any worktree makes new branches visible to all of them immediately.
- A repo's default branch for new worktrees (`origin/HEAD`) can be repointed per local clone without touching the actual GitHub default:
  ```bash
  git --git-dir=.bare symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/develop
  ```

### `wtnew` — this repo's shortcut

`home.nix` defines a `wtnew` shell function (see `programs.zsh.initContent`) that wraps the setup above:

```bash
wtnew <branch> [base-branch] [target-path]
```

- Discovers the project root by walking up from `$PWD` looking for a `.bare/` dir — works in any project using this pattern, not just one repo.
- `<branch>`: creates it (branching off `[base-branch]`, or the bare repo's `origin/HEAD` if omitted) if it doesn't exist yet locally or on `origin`; otherwise just checks it out.
- `[target-path]`: defaults to `<project-root>/<branch>`; pass an explicit path to override.
- If `<branch>` has no upstream set (common right after the initial `git clone --bare`, which mirrors `origin`'s branches straight into `refs/heads` with no tracking info, and doesn't configure `remote.origin.fetch` either), `wtnew` configures `remote.origin.fetch`, fetches that one branch from `origin` into `refs/remotes/origin/<branch>`, and backfills the upstream with `git branch --set-upstream-to`. Silently skips if `origin` doesn't have the branch (e.g. a local-only branch).
- Attaches a herdr session via `herdr worktree open` afterward, if herdr is installed — see [herdr-cheatsheet.md](herdr-cheatsheet.md#worktrees).
- If `[target-path]` (or the default `<project-root>/<branch>`) already exists and is a worktree registered against the bare repo (checked via `git worktree list`), `wtnew` skips creation entirely and just (re)attaches a herdr session to it — so the same command doubles as "open an existing worktree." A path that exists but isn't a registered worktree of this repo still errors out, to avoid clobbering an unrelated directory.

---

## Merging & Rebasing

```bash
# Merge another branch into the current one
git merge feature/login
git merge --no-ff feature/login     # always create a merge commit (preserves branch shape)
git merge --squash feature/login    # flatten into one commit

# Rebase the current branch onto another
git rebase main                     # replay current branch's commits on top of main
git rebase -i HEAD~5                # interactive: edit the last 5 commits
git rebase --continue               # after resolving conflicts
git rebase --abort                  # back out entirely
git rebase --skip                   # skip the current patch
```

### Interactive rebase (`git rebase -i`)

Opens an editor listing the commits you're modifying. Change the action prefix on any line:

```
pick   abc1234   first commit
reword def5678   second commit   # change the message
edit   ghi9abc   third commit    # stop to amend content
squash jkl2def   fourth commit   # combine with previous
fixup  mno3ghi   fifth commit    # squash but discard this message
drop   pqr4jkl   sixth commit    # delete the commit
```

Save, close, and git walks you through each step.

### Merge vs rebase: when to use which

- **Merge** when integrating a shared branch (keeps history honest, shows where work came from)
- **Rebase** when cleaning up your local branch before pushing (linear history, one cohesive story)

**The Golden Rule:** never rebase commits that other people have already pulled. Rebase rewrites history, which breaks everyone else's clones. Safe to rebase: your local branches that haven't been pushed, or branches only you work on.

---

## Remote Work (Pushing, Pulling, Fetching)

```bash
# Push
git push                             # push current branch (if tracking set)
git push -u origin feature/login     # first push; sets upstream tracking
git push --force-with-lease          # force push but fail if remote has new commits (safer than --force)

# Pull
git pull                             # fetch + merge (or rebase, per config)
git pull --rebase                    # explicit rebase pull

# Fetch (download refs without touching local branches)
git fetch                            # from origin
git fetch --all                      # from all remotes
git fetch --prune                    # also delete locally-cached refs to deleted remote branches

# Remotes
git remote -v                        # list
git remote add upstream git@github.com:original/repo.git
git remote remove old-remote
git remote set-url origin git@github.com:new-owner/repo.git

# See what would happen before pushing
git diff origin/main..HEAD           # commits you have that origin/main doesn't
git log origin/main..HEAD --oneline  # same, one-line format
```

### `--force-with-lease` over `--force`

`git push --force` overwrites the remote branch unconditionally. If a teammate pushed a commit you don't have, it gets destroyed.

`git push --force-with-lease` only force-pushes if the remote is where you last saw it. If someone else pushed in the meantime, it refuses. Use this. Almost always.

---

## Inspecting History

```bash
# Log basics
git log                                  # everything
git log --oneline                        # one line per commit
git log --oneline --graph --decorate     # visual branch/tag structure
git log --oneline --graph --all          # include all branches
git log -20                              # last 20 commits
git log --since="2 weeks ago"
git log --author="Lakshya"
git log --grep="fix:"                    # search commit messages

# Diff
git diff                                 # unstaged changes
git diff --staged                        # staged changes (vs last commit)
git diff HEAD                            # all uncommitted changes
git diff main..feature/login            # changes between branches
git diff abc1234..def5678                # between commits
git diff HEAD~3 HEAD                     # last 3 commits vs now

# Show a specific commit
git show abc1234
git show HEAD                            # most recent commit
git show HEAD~2                          # 2 commits ago

# Who changed a line, and when?
git blame path/to/file
git blame -L 10,20 path/to/file          # only lines 10-20

# Find which commit introduced a bug (binary search)
git bisect start
git bisect bad                           # current commit is broken
git bisect good abc1234                  # this old commit worked
# git checks out a midpoint; test, then:
git bisect good    # or   git bisect bad
# repeat until it finds the bad commit
git bisect reset                         # done; return to HEAD
```

### The aliases in this repo's `.zshrc`

```bash
g       # git
gs      # git status
gd      # git diff
gl      # git log --oneline --graph --decorate -20
lg      # lazygit (full TUI)
```

---

## Code Smell Review

A shared `smell` skill (Clean Code + Gang of Four + Python-specific catalog) is symlinked into Claude Code, Codex CLI, and Cursor from a single canonical source — see [inventory.md — Shared agent skills](../inventory.md#shared-agent-skills) for how the symlinks are wired.

Ask any of the three agents to run a smell review (it triggers on phrases like "check for code smells" or "review this before I merge"), optionally naming a base branch:

```
review this diff for code smells against develop
```

It diffs committed + working-tree changes against the resolved base branch (explicit branch, else `origin/HEAD`, else `main`), classifies the change, picks a Clean Code / Gang of Four / Mixed lens, then reports findings as `BLOCKER`/`HIGH`/`MEDIUM`/`LOW`/`NIT`, each citing one catalog ID (e.g. `CC.G5` Duplication, `PY.BARE-EXCEPT`), a one-line why, and a one-line fix.

Canonical source: `home/skills/smell/SKILL.md` in this repo. Edit it there — the per-tool copies are symlinks, so changes apply everywhere without a rebuild.

---

## Commit Message Conventions

A shared `commit-message` skill is symlinked into Claude Code, Codex CLI, and Cursor from a single canonical source — see [inventory.md — Shared agent skills](../inventory.md#shared-agent-skills) for how the symlinks are wired.

It formats commit subjects as Conventional Commits with a lowercase scope (`type(scope): summary`), prefixing the Jira ticket ID when the current branch name contains one (e.g. `ABC-123 feat(billing): ...`).

Canonical source: `home/skills/commit-message/SKILL.md` in this repo. Edit it there — the per-tool copies are symlinks, so changes apply everywhere without a rebuild.

---

## Pull Request Description Conventions

A shared `pr-description` skill is symlinked into Claude Code, Codex CLI, and Cursor from a single canonical source — see [inventory.md — Shared agent skills](../inventory.md#shared-agent-skills) for how the symlinks are wired.

It formats PR titles the same way as commit subjects, and bodies as `# Summary` / `# Changes` / `# Why` / `# Test plan` sections wrapped in a fenced markdown code block.

Canonical source: `home/skills/pr-description/SKILL.md` in this repo. Edit it there — the per-tool copies are symlinks, so changes apply everywhere without a rebuild.

---

## Undoing Things

This is the section people need most. Git's philosophy: almost everything is recoverable if you haven't deleted the `.git` directory.

### Unstage a file

```bash
git restore --staged path/to/file
```

### Discard uncommitted changes to a file

```bash
git restore path/to/file          # changes are GONE if unstaged
```

Staged changes are safer; they stay in the index until you commit.

### Revert a published commit (safe for shared branches)

```bash
# Creates a new commit that undoes the target
git revert abc1234                 # revert a specific commit
git revert HEAD                    # revert the most recent commit
```

### Reset to an earlier commit (destructive; local use only)

```bash
git reset --soft HEAD~1            # undo commit; keep changes staged
git reset --mixed HEAD~1           # undo commit; keep changes unstaged (default)
git reset --hard HEAD~1            # undo commit AND DELETE the changes
```

**Warning:** `--hard` is unrecoverable except via `git reflog` (see below). Never `--hard` without being sure.

### Recover a "lost" commit

```bash
git reflog                          # shows every HEAD movement (commits, resets, checkouts)
git reset --hard abc1234            # back to where you were
```

Git keeps reflog entries for ~90 days by default, so that `--hard reset` you regretted 20 minutes ago? Recoverable.

### Amend the last commit

```bash
git commit --amend                  # re-opens the message editor
git commit --amend --no-edit        # keep the message, just add staged changes
git commit --amend -m "new message"
```

**Warning:** amending rewrites the commit SHA. If you already pushed, you'll need `git push --force-with-lease`. Same Golden Rule as rebase: don't amend on shared branches.

### Fix: committed to the wrong branch

```bash
# You committed on main but meant feature-branch
git branch feature-branch          # create the branch at current commit
git reset --hard origin/main       # reset main back to remote state
git switch feature-branch          # continue working
```

---

## Stashing

Save uncommitted changes without committing, so you can switch contexts.

```bash
# Stash tracked changes
git stash
git stash push -m "wip: login form"    # with a message
git stash -u                            # include untracked files

# See stashes
git stash list

# Apply the most recent stash
git stash pop                           # apply AND delete
git stash apply                         # apply but keep the stash

# Apply a specific stash
git stash pop stash@{2}

# See what a stash contains
git stash show -p stash@{0}             # full diff

# Delete a stash
git stash drop stash@{0}
git stash clear                         # delete ALL stashes
```

### When stash is useful

- You're mid-change and need to switch branches to review a PR
- You pulled and got a conflict with local uncommitted work: `git stash`, pull, `git stash pop`
- You realize you were editing the wrong branch

### When stash bites you

Stashes are easy to forget. Run `git stash list` regularly. Better: commit a WIP commit (`git commit -m "wip"`) and squash it later. Less chance of losing work.

---

## Tags & Releases

```bash
# Lightweight tag (just a pointer)
git tag v1.0.0

# Annotated tag (includes message, author, date; use these for releases)
git tag -a v1.0.0 -m "Release 1.0.0"

# List tags
git tag
git tag -l "v1.*"                   # filter

# Push tags
git push origin v1.0.0               # single tag
git push --tags                      # all tags

# Delete a tag
git tag -d v1.0.0                    # local
git push origin --delete v1.0.0      # remote

# Check out a tag (detached HEAD)
git checkout v1.0.0
```

---

## Useful Configurations

### `.gitignore` essentials

```gitignore
# Dependencies
node_modules/
__pycache__/
venv/
.venv/
vendor/

# Environment
.env
.env.local
.env.*.local

# Editor / OS
.vscode/
.idea/
.DS_Store
*.swp

# Build artifacts
dist/
build/
*.pyc
*.class

# Secrets (never commit these)
*.pem
*.key
secrets.yml
```

### Global `.gitignore`

For things that should NEVER be committed from your machine to any repo:

```bash
git config --global core.excludesfile ~/.gitignore_global
```

Then in `~/.gitignore_global`:

```
.DS_Store
*.swp
.env
.vscode/
.idea/
```

### Useful aliases

```bash
# Shorter commands
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.st status

# Nicer log
git config --global alias.lg "log --oneline --graph --decorate --all"

# Undo last commit (keep changes)
git config --global alias.undo "reset --soft HEAD~1"

# Show files in last commit
git config --global alias.last "log -1 HEAD --stat"
```

---

## Best Practices

### Commit message convention (Conventional Commits)

```
<type>(<scope>): <subject>

<optional body>

<optional footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`.

Examples:

```
feat: add OAuth login flow
fix(api): handle null user in /profile endpoint
docs: update README quick-start section
refactor: extract auth logic into middleware
chore: bump dependencies
```

Why: it makes changelog generation automatic, searching history is easier, and the discipline of picking a type forces clarity.

### Branch naming

Pick one convention and stick to it:

```
feature/add-login           # new feature
fix/null-user-crash         # bug fix
chore/update-deps           # housekeeping
refactor/extract-auth       # code refactor
docs/readme-overhaul        # docs changes
hotfix/critical-xss         # urgent prod fix
```

### Commit often, push thoughtfully

- Commit whenever a logical unit is complete (a function works, a test passes). Rebase/squash before pushing if you want a cleaner history.
- Pull frequently to avoid massive merge conflicts later.
- Never commit secrets (tokens, keys, passwords). Use `.env`, `.gitignore`, and tools like `git-secrets` to catch mistakes before they're permanent.

### One logical change per commit

A commit should do one thing. If your commit message has "and" in it, you probably have two commits masquerading as one. Use `git add -p` to separate.

### Don't rebase shared branches

Already said it twice. Third time's the charm. **Never rebase or force-push commits that other people have pulled.** It breaks their clones and requires coordination to recover.

### Use `--force-with-lease`, never `--force`

`--force` is a nuke. `--force-with-lease` is a nuke with a safety check. There's almost no reason to use plain `--force`.

### Write meaningful commit messages

```bash
# Bad
git commit -m "fix"
git commit -m "updates"
git commit -m "wip"

# Good
git commit -m "fix: handle null user in /profile endpoint"
git commit -m "refactor: extract auth middleware into separate module"
```

Future you (or your teammate doing `git blame` six months from now) will thank present you.

---

## Troubleshooting

### "Your branch is ahead of origin/main by N commits"

Just means you have local commits that haven't been pushed. Push them:

```bash
git push
```

### "Your branch and origin/main have diverged"

Both you and the remote have new commits. Two options:

```bash
# Rebase (preferred for personal branches)
git pull --rebase

# Merge (default; creates a merge commit)
git pull
```

### Merge conflict

```bash
# Git marks conflicted files
git status

# Edit each file, look for <<<<<<<, =======, >>>>>>> markers
# Keep what you want, delete the markers, save

# Mark as resolved
git add path/to/resolved-file

# Continue the operation
git commit              # if merging
git rebase --continue   # if rebasing
git cherry-pick --continue

# Or bail out
git merge --abort
git rebase --abort
```

**Tip:** install `git-delta` (already in this setup's Brewfile) for better diff rendering during conflict resolution. Or use `lazygit` for a visual conflict editor.

### "Permission denied (publickey)" when pushing to GitHub

Your SSH key isn't registered with GitHub:

```bash
# Check what keys you have
ls -la ~/.ssh/

# Generate one if needed
ssh-keygen -t ed25519 -C "you@example.com"

# Add to agent (macOS)
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519

# Copy public key to clipboard
pbcopy < ~/.ssh/id_ed25519.pub

# Add it at https://github.com/settings/keys

# Verify
ssh -T git@github.com
```

Or use `gh auth login`; it handles all of this in one step.

### "Please tell me who you are"

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### "fatal: refusing to merge unrelated histories"

You're pulling from a remote that has commits but your local repo was initialized separately. Usually happens when cloning vs `git init` + `git remote add`. Fix:

```bash
git pull origin main --allow-unrelated-histories
```

### "Large files detected" / push rejected

GitHub has a 100 MB file size limit. If you accidentally committed a large file:

```bash
# Remove from the latest commit
git rm --cached path/to/large-file
git commit --amend --no-edit

# Remove from history entirely (destructive)
git filter-repo --path path/to/large-file --invert-paths
```

Better approach: use Git LFS for files that legitimately need to be versioned (assets, binaries):

```bash
brew install git-lfs
git lfs install
git lfs track "*.psd"
git add .gitattributes
```

### Accidentally committed a secret

Bad news: once pushed, consider it compromised. Rotate the secret immediately.

Remove from history (if unpushed):

```bash
git reset --soft HEAD~1             # undo commit
# Edit file to remove secret
git add .
git commit -m "original message"
```

If pushed: rotate the secret, add to `.gitignore`, and optionally use `git filter-repo` to rewrite history. But the leaked value must be treated as burned.

### "detached HEAD state"

You've checked out a specific commit or tag, not a branch. Safe to look around, but any new commits won't be on a branch.

```bash
# To keep any changes you made
git switch -c new-branch-name

# To discard and return to normal
git switch main
```

### `.gitignore` isn't ignoring a file

`.gitignore` only applies to untracked files. If the file was committed before being added to `.gitignore`:

```bash
git rm --cached path/to/file        # untrack but keep on disk
git commit -m "untrack <file>"
```

Future changes to that file will now be ignored.
