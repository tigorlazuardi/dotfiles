#!/bin/bash

if ! command -v cargo &>/dev/null; then
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
	newgrp
	cargo install exa
	cargo install bat
	cargo install ripgrep
	cargo install procs
	echo "you may want to relogin to make the installed program to work correctly"
fi

alias ls="exa -l"
alias cat="bat -pp"
alias dc="docker-compose"
alias watch="watchexec -r -s SIGTERM"
alias grep="rg -i"
alias -g G="| rg -i"
alias -g CLIP="| xclip -selection clipboard -rmlastnl"
alias ps="procs"
alias psp="sudo lsof -i"
alias yt-mp3="youtube-dl --extract-audio --audio-format mp3"
alias mirror="sudo reflector --verbose -c indonesia,singapore -a 6 --sort rate --threads 16 --save /etc/pacman.d/mirrorlist"
alias lg="lazygit"
alias nv="neovide --multigrid"

function qc {
	git add .
	git commit "$@"
	git push
}
