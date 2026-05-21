if status is-interactive
    # zoxide — ganti `cd` builtin dengan smart cd (frecency-based)
    # Pakai `cd` seperti biasa, tapi sekarang bisa: `cd proj` -> jump ke project terakhir
    # Akses cd asli kalau perlu: `builtin cd /some/path` atau `cdi` (interactive picker)
    zoxide init fish --cmd cd | source

    # direnv — auto-load .envrc per direktori
    direnv hook fish | source
end
