#!/bin/zsh
[ -f ~/.config/_personal_shell/zsh-completions.zsh ] && source ~/.config/_personal_shell/zsh-completions.zsh
setopt share_history

autoload -Uz compinit
compinit
_comp_options+=(globdots)

# case insensitive tab matching
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'


HISTFILE=~/.zsh_history
HISTSIZE=10000000
SAVEHIST=10000000

setopt hist_ignore_all_dups

export FZF_DEFAULT_COMMAND='fd --type f'

for f in ~/.config/_personal_shell/*; do
	source $f
done

[ -f /usr/share/doc/find-the-command/ftc.zsh ] && source /usr/share/doc/find-the-command/ftc.zsh
