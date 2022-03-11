# dotfiles

Dotilfes that is save to be exposed publicly

This is intended for my own personal use.

# Installation Instruction

Run this commands.

```sh
git clone git@github.com:tigorlazuardi/dotfiles.git --recurse
cd ./dotfiles
```

Then make symlinks. All the folders except `.chglog` should go in to `~/.config` folder.

# Session Shells

KDE shells to load is located on `$HOME/.config/plasma-workspace/env`

Recommended shells to symlink to is:

1. `./_personal_shell/envs.sh`
2. `./_personal_shell/aliases.sh`
3. `./session_shells/*.sh`
