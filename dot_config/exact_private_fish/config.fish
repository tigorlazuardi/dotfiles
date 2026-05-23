# --- Default editor ---
# EDITOR dipakai git commit msg, chezmoi edit, fzf preview, dll.
# VISUAL fallback ke EDITOR di kebanyakan tool, tapi beberapa (sudoedit, crontab)
# prefer VISUAL kalau ada — set sama biar konsisten.
set -gx EDITOR nvim
set -gx VISUAL nvim

if status is-interactive
    # zoxide — ganti `cd` builtin dengan smart cd (frecency-based)
    # Pakai `cd` seperti biasa, tapi sekarang bisa: `cd proj` -> jump ke project terakhir
    # Akses cd asli kalau perlu: `builtin cd /some/path` atau `cdi` (interactive picker)
    zoxide init fish --cmd cd | source

    # direnv — auto-load .envrc per direktori
    direnv hook fish | source
end
