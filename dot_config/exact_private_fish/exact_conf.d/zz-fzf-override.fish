# ============================================================
# fzf.fish bindings — override + extra
# Loaded SETELAH conf.d/fzf.fish (lexical sort: 'zz-' > 'fzf') sehingga bisa override.
# ============================================================
status is-interactive || exit

# --- Remap clash dengan ghostty ---
# Ghostty bind ctrl+alt+l ke resize_split:right. Default fzf git_log clash.
# Remap ke ctrl-alt-g (g = git mnemonic, ghostty free).
fzf_configure_bindings --git_log=\e\cg

# --- ctrl+t: fuzzy file insert ---
# fzf.fish gak punya file widget (cuma directory search via ctrl-alt-f).
# Custom: fd → fzf multi-select → insert path(s) di cursor.
function _fzf_file_insert --description "Insert fzf-selected file path(s) at cursor"
    set -l selected (
        fd --type f --hidden --strip-cwd-prefix --exclude .git --exclude node_modules 2>/dev/null \
        | fzf --multi \
              --height=60% \
              --preview 'bat --color=always --style=plain --line-range :200 {}' \
              --preview-window 'right:60%:wrap'
    )
    if test -n "$selected"
        commandline -i -- (string join ' ' -- (string escape -- $selected))
    end
    commandline -f repaint
end

bind ctrl-t _fzf_file_insert
bind -M insert ctrl-t _fzf_file_insert
