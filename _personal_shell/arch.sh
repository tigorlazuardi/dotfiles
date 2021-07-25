#!/bin/bash
YAY_SUDO_PASSWORD=""

if ! command -v yay &>/dev/null; then
	if [[ $EUID -ne 0 ]]; then
		echo "To install Yay, root password is required"
		read -sp "password: " YAY_SUDO_PASSWORD
	fi
	git clone https://aur.archlinux.org/yay.git ~/yay
	cd ~/yay || exit
	echo "$YAY_SUDO_PASSWORD" | sudo -S makepkg -si
	[[ ! $? -ne 0 ]] && echo 'failed to install yay'
	cd || exit
fi

alias vim="nvim"
alias giveme="yay --noconfirm --needed"
alias givemes="yay -S --noconfirm --needed"
alias del="yay -Rs"
alias cleaninst="yay -R $(yay -Qdtq | tr '\r\n' ' ')"
export EDITOR=/usr/bin/nvim
