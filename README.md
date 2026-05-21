# dotfiles

Personal dotfiles dikelola dengan [chezmoi](https://chezmoi.io). Setup untuk Arch Linux + Wayland.

## Stack

- **Shell**: fish
- **Terminal**: Ghostty (Catppuccin Mocha, JetBrains Mono Nerd Font)
- **Git TUI**: lazygit (with delta pager, gh integration, gitleaks scanning)
- **Package manager**: npm/pnpm via corepack (anti supply-chain config)
- **Smart cd**: zoxide (replaces builtin `cd`)
- **Per-project env**: direnv

## File yang di-track

```
~/.config/ghostty/config           # Ghostty terminal config + keybinds (ctrl+a prefix)
~/.config/fish/config.fish         # Fish startup (zoxide, direnv hooks)
~/.config/fish/functions/          # Fish functions (clauded, dll)
~/.config/fish/conf.d/aliases.fish # Modern CLI aliases (ls -> eza, cat -> bat, dll)
~/.config/lazygit/config.yml       # Lazygit theme + custom commands
~/.npmrc                           # npm/pnpm security defaults
~/.git-template/hooks/pre-commit   # Auto-installed pre-commit hook (gitleaks + pre-commit framework)
```

## Setup di mesin baru

```fish
# 1. Install dependency dulu (lihat section di bawah)

# 2. Init + apply dotfiles
chezmoi init --apply git@github.com:USERNAME/dotfiles.git

# 3. Set fish sebagai default shell
chsh -s /usr/bin/fish

# 4. Verifikasi
chezmoi managed
chezmoi diff
```

## Dependencies

### Required (semua dipakai oleh config)

```fish
# Core: shell, terminal, dotfile manager, version manager
sudo pacman -S fish ghostty chezmoi nodejs npm

# Git tooling: TUI + pager + GitHub CLI + scanning
sudo pacman -S lazygit git-delta gh gh-dash gitleaks pre-commit

# Modern CLI replacements
sudo pacman -S eza bat fd ripgrep fzf jq onefetch

# Smart cd + per-project env
sudo pacman -S zoxide direnv

# Wayland clipboard (untuk lazygit copy SHA)
sudo pacman -S wl-clipboard

# Font (Nerd Font dengan icon untuk lazygit, eza, dll)
sudo pacman -S ttf-jetbrains-mono-nerd
```

### AUR (butuh `yay` atau AUR helper lain)

```fish
yay -S glint                        # Conventional Commits wizard (dipakai lazygit `Z`)
```

### Setup tambahan setelah install

```fish
# Enable corepack (mengatur pnpm/yarn version per project, dari package.json)
sudo corepack enable
sudo corepack prepare pnpm@latest --activate

# Konfigurasi git delta sebagai pager
git config --global core.pager delta
git config --global interactive.diffFilter 'delta --color-only'
git config --global delta.navigate true
git config --global delta.side-by-side true
git config --global delta.line-numbers true
git config --global delta.syntax-theme 'Catppuccin Mocha'
git config --global merge.conflictstyle zdiff3

# Set git template dir (auto-install pre-commit hook ke repo baru)
git config --global init.templateDir ~/.git-template

# Re-apply hook ke repo existing (jalankan di dalam repo)
# cp ~/.git-template/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

### Optional tools

Belum ke-config tapi sering pakai:

```fish
# Disk/system monitoring
yay -S btop dust duf procs

# Productivity
yay -S tealdeer broot hyperfine sd

# Network
yay -S xh doggo gping

# Git extras
yay -S git-extras git-trim mergiraf lazydocker
```

## Highlight Config

### Ghostty
- Copy on select otomatis ke clipboard
- SSH integration (auto terminfo install di remote)
- **Prefix `ctrl+a`** (tmux-style) untuk semua aksi pane/tab
- Resize pane via `ctrl+alt+hjkl` (direct, no prefix — biar bisa di-spam)
- Shift+Enter & Alt+Enter → newline literal (untuk agent harness seperti Claude Code)

### Lazygit
Custom commands (tekan `?` di lazygit untuk lihat semua):
- `Z` — Commit via glint (Conventional Commits)
- `S` — Scan secrets dengan gitleaks
- `O` — Open gh-dash (PR/issue dashboard)
- `A` — Onefetch repo summary
- `H` — Run pre-commit hooks manually
- `P` / `V` — Create / view PR via gh
- `F` — Fuzzy branch checkout (fzf)
- `n` — New branch from main
- `R` — Interactive rebase onto main
- `C` — Copy commit SHA to clipboard
- `,` — Rename stash

### Fish
- `cd` di-override jadi **zoxide** (frecency-based smart cd)
- `direnv` auto-hook
- `clauded` — alias claude dengan `--permission-mode=bypassPermissions`
- Alias: `ls` → eza, `cat` → bat, plus pnpm shortcuts (`pn`, `pni`, `pnx`)

### Git
- Pre-commit hook global: **gitleaks** scan + **pre-commit** framework
- `init.templateDir` auto-install hook di repo baru
- Bypass dengan `git commit --no-verify` atau prefix message `WIP:`

### npm/pnpm
- `ignore-scripts=true` — disable auto-execute install scripts (anti Shai-Hulud)
- `minimum-release-age=10080` (7 hari) — delay install package baru
- `save-exact=true` — pin exact version
- `engine-strict=true` — enforce node version per project

## Workflow Harian

```fish
# Edit config (auto-update di chezmoi source juga)
chezmoi edit ~/.config/lazygit/config.yml --apply

# Atau edit langsung, lalu re-add
nvim ~/.config/lazygit/config.yml
chezmoi re-add

# Preview perubahan
chezmoi diff
chezmoi status

# Commit & push
chezmoi cd
git add . && git commit -m "Update lazygit keybinds" && git push
exit
```

## Catatan

- Source dir: `~/.local/share/chezmoi/`
- Target: `$HOME`
- File dengan permission 0700/0600 di-encode sebagai `private_*` (untuk preserve perm saat apply di mesin lain)
- Untuk full chezmoi reference: <https://chezmoi.io/user-guide/command-overview/>
