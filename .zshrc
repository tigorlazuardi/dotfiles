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

[ -f ~/.config/_personal_shell/secrets.sh ] && source ~/.config/_personal_shell/secrets.sh

[ -f ~/.config/_personal_shell/arch.sh ] && source ~/.config/_personal_shell/arch.sh

[ -f ~/.config/_personal_shell/paths.sh ] && source ~/.config/_personal_shell/paths.sh

[ -f ~/.config/_personal_shell/plugins.zsh ] && source ~/.config/_personal_shell/plugins.zsh

[ -f ~/.config/_personal_shell/zoxide.zsh ] && source ~/.config/_personal_shell/zoxide.zsh

[ -f ~/.config/_personal_shell/starship.zsh ] && source ~/.config/_personal_shell/starship.zsh

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

[ -f ~/.config/_personal_shell/aliases.sh ] && source ~/.config/_personal_shell/aliases.sh
