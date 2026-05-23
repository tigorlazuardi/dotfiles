function chezpull --description 'Pull remote chezmoi source + apply ke target'
    echo "→ git pull --rebase --autostash"
    chezmoi git -- pull --rebase --autostash
    or return 1

    echo "→ chezmoi apply -v"
    chezmoi apply -v
end
