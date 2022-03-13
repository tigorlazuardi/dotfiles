<a name="unreleased"></a>
### [Unreleased]

> Configuration
- **lefthook:** added lefthook and triggers

> Features
- **rsync:** added alias for rsyncpi wsl


<a name="v1.1.2"></a>
### [v1.1.2] - 2022-03-11

> Bug Fixes
- **alacritty:** fix config file
- **desktop-files:** icon now points to svg
- **plugins.zsh:** plugins now aimed to correct git repo
- **rofi:** fix columns not found error
- **tmux:** removed deprecated configurations

> Code Refactoring
- **personal-shell:** changed `~`s to `$HOME` for compability reasons

> Config
- **lazygit:** now quits confirm first

> Configuration
- **ridit.toml:** updated ridit config

> Documentation
- update readme.md

> Feature
- **fzf:** added fzf keybindings and completion
- **kitty:** increase font size
- **riddit:** added ridit config

> Features
- added more scripts
- up
- **alacritty:** added alacritty config
- **alias:** move mirror alias to arch.sh
- **alias:** added RSYNCPI alias
- **aliases:** added PI alias
- **arch:** added alias to update packages globaly
- **arch.sh:** if not archlinux don't run
- **desktop-files:** added neovide desktop file
- **envs:** added more stuffs
- **fzf.zsh:** only source if those file exists
- **gitconfig:** added gitconfig
- **imwheel:** added microsoft edge
- **kitty:** font changed to JetBrainsMono
- **lazygit:** added env to disabled lefthook on generating changelog
- **personal_shell:** added prettierd default config location file
- **pulseaudio:** added pulse audio scripts
- **ridit:** add more subreddits
- **ridit:** update configuration
- **tmux:** added tmux config
- **tmux:** added tmux submodule
- **tmux:** now config to local
- **tmux:** added vi like config
- **tmux:** alacritty now by default starts a new tmux session
- **tmux:** added tmux yank, resurrect, and continuum
- **tmux:** set clipboard settings
- **tmux:** added mouse mode and disabled update plugins on start
- **tmux:** now added continuum
- **zsh:** now share history is enabled

> Various Actions
- update submodules


<a name="v1.0.9"></a>
### [v1.0.9] - 2021-09-22

> Bug Fixes
- **read-clock:** revert script


<a name="v1.0.8"></a>
### [v1.0.8] - 2021-09-22

> Reverts
- config(chglog): added jira integration


<a name="v1.0.7"></a>
### [v1.0.7] - 2021-09-22


<a name="v1.0.6"></a>
### [v1.0.6] - 2021-09-22

> Config
- **chglog:** added jira integration
- **systemd:** read-clock now uses 24 hour format


<a name="v1.0.5"></a>
### [v1.0.5] - 2021-09-20

> Config
- **chglog-template:** blocked scope now also propagates to tags, not just unreleased
- **chglog-template:** now scope is blocked instead of bold


<a name="v1.0.4"></a>
### [v1.0.4] - 2021-09-20

> Clean
- **imwheel:** removed newline at end of file

> Config
- **lazygit:** adding tags now also generate changelog
- **lazygit:** mergin now --no-ff

> Feature
- **imwheel:** added service systemd file
- **kitty:** disabled audio bell and modified layout to fat and tall by default
- **lazygit:** removed gitflow from creating new branch


<a name="v1.0.3"></a>
### [v1.0.3] - 2021-09-12

> Doc
- **readme:** update readme

> Feature
- **systemd:** added read-clock timer service
- **systemd:** added appimagelauncherd.service


<a name="v1.0.2"></a>
### [v1.0.2] - 2021-09-12

> Feature
- **kitty:** added kitty config
- **ranger:** added plugins for ranger
- **rofi:** update theme
- **zshenv:** added cargo env


<a name="v1.0.1"></a>
### [v1.0.1] - 2021-08-20

> Update
- **zsh:** added zshenv

> WIP
- **systemd:** added read-clock script


<a name="v1.0.0"></a>
### v1.0.0 - 2021-08-19

> Bug Fixes
- **lazygit:** removed lazygit state from git watched files

> New
- **lazygit:** lazygit configuration

> Update
- **lazygit:** added git chglog and git tag integration
- **lazygit:** update lazygit configuration


[Unreleased]: https://github.com/tigorlazuardi/dotfiles/compare/v1.1.2...HEAD
[v1.1.2]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.9...v1.1.2
[v1.0.9]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.8...v1.0.9
[v1.0.8]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.7...v1.0.8
[v1.0.7]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.6...v1.0.7
[v1.0.6]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.5...v1.0.6
[v1.0.5]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.4...v1.0.5
[v1.0.4]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.3...v1.0.4
[v1.0.3]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.2...v1.0.3
[v1.0.2]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.0...v1.0.1
