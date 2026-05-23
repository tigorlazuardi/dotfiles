# ============================================================
# Jump-to-char (vim f/F/;/,) — pakai native fish jump funcs.
# Trigger → type 1 char → cursor lompat. No preview overlay.
#
# Bindings:
#   ctrl+f  → forward-jump          (vim f)
#   alt+f   → backward-jump         (vim F)
#   ctrl+;  → repeat-jump           (vim ;)
#   ctrl+,  → repeat-jump-reverse   (vim ,)
#
# ctrl+;/ctrl+, butuh kitty kbd protocol (ghostty default OK).
# Verify via `fish_key_reader`.
# ============================================================
status is-interactive || exit

bind ctrl-f forward-jump
bind alt-f backward-jump
bind \e\[59\;5u repeat-jump
bind \e\[44\;5u repeat-jump-reverse

bind -M insert ctrl-f forward-jump
bind -M insert alt-f backward-jump
bind -M insert \e\[59\;5u repeat-jump
bind -M insert \e\[44\;5u repeat-jump-reverse
