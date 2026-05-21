function chezpush --description 'Re-add, commit, push chezmoi changes'
    set -l msg $argv
    test -z "$msg"; and set msg "update configs"

    echo "→ chezmoi re-add"
    chezmoi re-add
    or return 1

    echo "→ git add ."
    chezmoi git -- add .
    or return 1

    # Cek ada yang berubah gak (kalau gak ada, skip commit & push)
    if chezmoi git -- diff --cached --quiet
        echo "✓ Nothing to commit. Source sudah sync dengan remote."
        return 0
    end

    echo "→ git commit -m \"$msg\""
    chezmoi git -- commit -m "$msg"
    or return 1

    echo "→ git push"
    chezmoi git -- push
end
