# ============================================================
# Aliases — modern CLI alternatives
# Auto-sourced by fish from conf.d/
# ============================================================

# --- ls -> eza ---
alias ls 'eza -la --icons --git'
alias ll 'eza -la --icons --git --group-directories-first'
alias la 'eza -a --icons'
alias lt 'eza --tree --icons --git-ignore --level=2'
alias lT 'eza --tree --icons --git-ignore --level=4'

# --- cat -> bat ---
# --paging=never bikin behavior mirip cat (tidak buka pager untuk file pendek)
alias cat 'bat --paging=never --style=plain'
# `batp` untuk versi full dengan paging + line numbers + syntax box
alias batp 'bat --style=full'

# --- grep / find: pakai rg / fd langsung (jangan override karena beda syntax) ---
# Tapi kalau mau:
# alias grep 'rg'
# alias find 'fd'

# --- pnpm shortcuts ---
alias pn 'pnpm'
alias pna 'pnpm add'
alias pnad 'pnpm add -D'
alias pni 'pnpm install --frozen-lockfile'    # selalu strict, no surprise
alias pnr 'pnpm run'
alias pnx 'pnpm dlx'                          # ephemeral exec, no global install
alias pnu 'pnpm update --interactive'         # review tiap update manual
