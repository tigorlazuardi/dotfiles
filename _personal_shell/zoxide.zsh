if ! command -v zoxide &> /dev/null
then
    curl --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/ajeetdsouza/zoxide/master/install.sh | sh
fi

eval "$(zoxide init zsh)"
