function clipshot --description 'Screenshot region to clipboard (paste-ready for Claude Code)'
    if not command -q grim; or not command -q slurp; or not command -q wl-copy
        echo "Butuh: grim, slurp, wl-clipboard"
        echo "Install: sudo pacman -S grim slurp wl-clipboard"
        return 1
    end

    grim -g "$(slurp)" - | wl-copy --type image/png
    and echo "✓ Region tersimpan di clipboard. Tekan Ctrl+V di Claude Code."
    or echo "✗ Batal."
end
