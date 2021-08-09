#!/bin/zsh
[ -f ~/.config/_personal_shell/zsh-completions.zsh ] && source ~/.config/_personal_shell/zsh-completions.zsh

autoload -Uz compinit
compinit
_comp_options+=(globdots)

HISTFILE=~/.zsh_history
HISTSIZE=10000000
SAVEHIST=10000000

setopt hist_ignore_all_dups

export FZF_DEFAULT_COMMAND='fd --type f'

for f in ~/.config/_personal_shell/*; do
	source $f
done

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
