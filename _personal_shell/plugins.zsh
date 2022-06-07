#!/bin/zsh
if ! command -v cargo &>/dev/null; then
	curl https://sh.rustup.rs -sSf | sh -s -- -y
fi

if ! command -v zr &>/dev/null; then
	cargo install zr
fi

if [[ ! -f ~/.config/zr.zsh ]] || [[ ~/.config/_personal_shell/plugins.zsh -nt ~/.config/zr.zsh ]]; then
	zr \
		greymd/docker-zsh-completion \
		zfben/zsh-npm \
		Aloxaf/fzf-tab.git/fzf-tab.plugin.zsh \
		ohmyzsh/ohmyzsh.git/plugins/git/git.plugin.zsh \
		ohmyzsh/ohmyzsh.git/plugins/golang/golang.plugin.zsh \
		MenkeTechnologies/zsh-cargo-completion \
		zsh-users/zsh-autosuggestions \
		jeffreytse/zsh-vi-mode \
		romkatv/zsh-defer \
		junegunn/fzf.git/shell/key-bindings.zsh \
		marlonrichert/zsh-autocomplete \
		zdharma-continuum/fast-syntax-highlighting \
		>~/.config/zr.zsh
fi

source ~/.config/zr.zsh

# autoloaded after zsh-vi-mode
function zvm_after_init() {
	if [ -f "/usr/share/fzf/key-bindings.zsh" ]; then
		source /usr/share/fzf/key-bindings.zsh
	fi

	if [ -f "/usr/share/fzf/completion.zsh" ]; then
		source /usr/share/fzf/completion.zsh
	fi

	if [ -f "$HOME/.cache/zr/marlonrichert/zsh-autocomplete/zsh-autocomplete.plugin.zsh" ]; then
		source $HOME/.cache/zr/marlonrichert/zsh-autocomplete/zsh-autocomplete.plugin.zsh
	fi
}

alias zrc="rm $HOME/.config/zr.zsh; rm -rf $HOME/.cache/zr"
