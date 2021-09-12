#!/bin/zsh
[ -f /usr/share/doc/pkgfile/command-not-found.zsh ] && source /usr/share/doc/pkgfile/command-not-found.zsh

if [[ ! -f ~/.zgen/zgen.zsh ]]; then
	git clone https://github.com/tarjoilija/zgen.git "${HOME}/.zgen"
fi
source "${HOME}/.zgen/zgen.zsh"

if ! zgen saved; then
	zgen oh-my-zsh plugins/docker
	zgen oh-my-zsh plugins/docker-compose
	zgen oh-my-zsh plugins/npm
	zgen oh-my-zsh plugins/git
	zgen oh-my-zsh plugins/golang
	# zgen oh-my-zsh plugins/cargo

	zgen load Aloxaf/fzf-tab
	zgen load zsh-users/zsh-autosuggestions
	zgen load zdharma/fast-syntax-highlighting

	zgen save
fi

autoload -Uz compinit && compinit
