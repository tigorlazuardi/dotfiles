# ============================================================
# Vim-like cursor keymaps di ctrl+ prefix (single-line edit)
# ctrl+a diambil ghostty, jadi line-start dialokasikan ke ctrl+0 / ctrl+6
# Untuk multi-line: tulis ke file dulu, edit, paste, run.
# ============================================================
status is-interactive || exit

# --- Word motion (vim b/w) ---
# Replace fish default: ctrl-b=backward-char, ctrl-w=backward-kill-word
# Recovery: pakai ← untuk char back, alt+⌫ untuk kill-word back.
bind ctrl-b backward-word
bind ctrl-w forward-word
bind -M insert ctrl-b backward-word
bind -M insert ctrl-w forward-word

# ctrl+e juga forward-word (override default end-of-line).
# End-of-line dipindah ke ctrl+4 (mnemonic shift+4 = $).
bind ctrl-e forward-word
bind -M insert ctrl-e forward-word

# --- Line motion ---
# ctrl+4 = end-of-line   (vim $, mnemonic shift+4)
# ctrl+0 = beginning-of-line (vim 0)
# ctrl+6 = beginning-of-line (vim ^, mnemonic shift+6)
# Butuh terminal yang support kitty kbd / CSI-u protocol (ghostty default OK).
bind ctrl-4 end-of-line
bind ctrl-0 beginning-of-line
bind ctrl-6 beginning-of-line
bind -M insert ctrl-4 end-of-line
bind -M insert ctrl-0 beginning-of-line
bind -M insert ctrl-6 beginning-of-line
