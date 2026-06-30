# --- Default editor ---
# EDITOR dipakai git commit msg, chezmoi edit, fzf preview, dll.
# VISUAL fallback ke EDITOR di kebanyakan tool, tapi beberapa (sudoedit, crontab)
# prefer VISUAL kalau ada — set sama biar konsisten.
set -gx EDITOR nvim
set -gx VISUAL nvim

# --- PATH additions ---
# bun — JS runtime + package manager. Global installs ke $BUN_INSTALL/bin.
set -gx BUN_INSTALL "$HOME/.bun"

# fish_add_path -g = global scope (current shell). Idempotent (skip kalau sudah ada).
# Pakai -g (bukan -U universal) supaya gak nyangkut di fish_variables file dan
# tetap fresh dari config.fish setiap shell start.
# Order: bun > npm global > cargo > existing PATH.
fish_add_path -g \
    $BUN_INSTALL/bin \
    $HOME/.local/npm/bin \
    $HOME/.local/bin \
    $HOME/.cargo/bin

if status is-interactive
    # zoxide — ganti `cd` builtin dengan smart cd (frecency-based)
    # Pakai `cd` seperti biasa, tapi sekarang bisa: `cd proj` -> jump ke project terakhir
    # Akses cd asli kalau perlu: `builtin cd /some/path` atau `cdi` (interactive picker)
    zoxide init fish --cmd cd | source

    # direnv — auto-load .envrc per direktori
    direnv hook fish | source
end

# mise
mise activate fish | source
