#!/bin/zsh
if ! command -v cargo &> /dev/null; then
	curl https://sh.rustup.rs -sSf | sh -s -- -y
fi

if ! command -v zr &> /dev/null; then
    cargo install zr
fi

if [[ ! -f ~/.config/zr.zsh ]] || [[ ~/.config/_personal_shell/plugins.zsh -nt ~/.config/zr.zsh ]]; then
  zr \
    junegunn/fzf.git/shell/key-bindings.zsh \
	greymd/docker-zsh-completion \
	zfben/zsh-npm \
	Aloxaf/fzf-tab.git/fzf-tab.plugin.zsh \
	ohmyzsh/ohmyzsh.git/plugins/git/git.plugin.zsh \
	ohmyzsh/ohmyzsh.git/plugins/golang/golang.plugin.zsh \
	MenkeTechnologies/zsh-cargo-completion \
	zsh-users/zsh-autosuggestions \
	jeffreytse/zsh-vi-mode \
	zdharma-continuum/fast-syntax-highlighting \
    > ~/.config/zr.zsh
fi

source ~/.config/zr.zsh
