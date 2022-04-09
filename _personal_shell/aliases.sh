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
alias watch="watchexec -r -s SIGINT"
alias grep="rg -i"
alias -g G="| rg -i"
alias -g CLIP="| xclip -selection clipboard -rmlastnl"
alias -g copy="xclip -selection clipboard -rmlastnl"
alias ps="procs"
alias psp="sudo lsof -i"
alias yt-mp3="youtube-dl --extract-audio --audio-format mp3"
alias lg="lazygit"
alias nv="neovide --multigrid"
alias RSYNCPI="rsync -azvh -e 'ssh -p 5522' tigor@192.168.100.10:/home/tigor/Pictures/ridit/main \$HOME/Pictures/ridit/main"
alias RSYNCPI-WIN="rsync -azvh -e 'ssh -p 5522' tigor@192.168.100.10:/home/tigor/Pictures/ridit/main /mnt/c/Users/tigor/Pictures/ridit"
alias PI="ssh -t -p 5522 tigor@192.168.100.10"
alias dlo="ytmdl --format=opus"
alias dlm="ytmdl --format=mp3"
alias pgh="psql -h localhost -U tigor"

function qc {
	git add .
	git commit "$@"
	git push
}
