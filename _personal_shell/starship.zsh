if ! command -v starship &> /dev/null
then
    curl -fsSL https://starship.rs/install.sh | bash
fi

eval "$(starship init zsh)"
