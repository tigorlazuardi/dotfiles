<a name="unreleased"></a>
## [Unreleased]

> Bug Fixes
- **npm:** fix path
- **tmux:** changed icon status bar to wezterm friendly icon on linux
- **yay:** fix makepkg -si command

> Configuration
- **lefthook:** added lefthook and triggers

> Documentation
- changelog now hidden in spoiler tag
- Unreleased section also go to two headings
- changelog template from 3 heading to 2 headings for tags

> Features
- update rsyncpi win
- **alias:** added alias for psql "pgh"
- **alias:** update alias for mirror
- **alias:** watchexec now default to SIGNINT signal
- **alias:** added dlo and dlm alias for ytmdl
- **alias:** mirror now take from indonesia and singapore
- **env:** added CARGO_TARGET_DIR
- **find-the-command:** used find the command loader
- **gitconfig:** up
- **lazygit:** update lazygit config to use delta as pager
- **lazygit:** fix escape not registered
- **path:** added NODE_PATH
- **ridit:** removed some subreddits
- **rsync:** added alias for rsyncpi wsl
- **rsyncpi:** change target ip
- **rtorrent:** update config
- **rtorrent:** added rtorrent config
- **systemd:** update wireplumber
- **tmux:** f and c-f now used for choose-tree
- **tmux:** removed <c-b> prefix
- **vi-mode:** added vi mode
- **yank:** added copy on mouse select
- **ytmdl:** added ytmdl config
- **ytmdl:** update config
- **zr:** moved plugin manager to zr
- **zsh:** completion now case insensitive
- **zsh:** added autocomplete on type
- **zsh:** update plugins

> Revert
- **zsh:** removed autocomplete


<a name="v1.1.2"></a>
## [v1.1.2] - 2022-03-11

> Bug Fixes
- **alacritty:** fix config file
- **plugins.zsh:** plugins now aimed to correct git repo
- **tmux:** removed deprecated configurations

> Documentation
- update readme.md

> Features
- up
- **alacritty:** added alacritty config
- **alias:** move mirror alias to arch.sh
- **aliases:** added PI alias
- **arch:** added alias to update packages globaly
- **arch.sh:** if not archlinux don't run
- **fzf.zsh:** only source if those file exists
- **gitconfig:** added gitconfig
- **kitty:** font changed to JetBrainsMono
- **pulseaudio:** added pulse audio scripts
- **tmux:** set clipboard settings
- **tmux:** added tmux config
- **tmux:** alacritty now by default starts a new tmux session
- **tmux:** added vi like config
- **tmux:** added mouse mode and disabled update plugins on start
- **tmux:** now config to local
- **tmux:** added tmux submodule
- **tmux:** now added continuum
- **tmux:** added tmux yank, resurrect, and continuum
- **zsh:** now share history is enabled

> Various Actions
- update submodules


<a name="v1.1.1"></a>
## [v1.1.1] - 2022-01-28

> Bug Fixes
- **desktop-files:** icon now points to svg
- **rofi:** fix columns not found error

> Code Refactoring
- **personal-shell:** changed `~`s to `$HOME` for compability reasons

> Configuration
- **ridit.toml:** updated ridit config

> Features
- added more scripts
- **alias:** added RSYNCPI alias
- **desktop-files:** added neovide desktop file
- **envs:** added more stuffs
- **imwheel:** added microsoft edge
- **lazygit:** added env to disabled lefthook on generating changelog
- **personal_shell:** added prettierd default config location file
- **ridit:** add more subreddits


<a name="v1.1.0"></a>
## [v1.1.0] - 2021-11-03

> Config
- **lazygit:** now quits confirm first

> Feature
- **fzf:** added fzf keybindings and completion
- **kitty:** increase font size
- **riddit:** added ridit config

> Features
- **ridit:** update configuration


<a name="v1.0.9"></a>
## [v1.0.9] - 2021-09-22

> Bug Fixes
- **read-clock:** revert script


<a name="v1.0.8"></a>
## [v1.0.8] - 2021-09-22

> Reverts
- config(chglog): added jira integration


<a name="v1.0.7"></a>
## [v1.0.7] - 2021-09-22


<a name="v1.0.6"></a>
## [v1.0.6] - 2021-09-22

> Config
- **chglog:** added jira integration
- **systemd:** read-clock now uses 24 hour format


<a name="v1.0.5"></a>
## [v1.0.5] - 2021-09-20

> Config
- **chglog-template:** blocked scope now also propagates to tags, not just unreleased
- **chglog-template:** now scope is blocked instead of bold


<a name="v1.0.4"></a>
## [v1.0.4] - 2021-09-20

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
## [v1.0.3] - 2021-09-12

> Doc
- **readme:** update readme

> Feature
- **systemd:** added read-clock timer service
- **systemd:** added appimagelauncherd.service


<a name="v1.0.2"></a>
## [v1.0.2] - 2021-09-12

> Feature
- **kitty:** added kitty config
- **ranger:** added plugins for ranger
- **rofi:** update theme
- **zshenv:** added cargo env


<a name="v1.0.1"></a>
## [v1.0.1] - 2021-08-20

> Update
- **zsh:** added zshenv

> WIP
- **systemd:** added read-clock script


<a name="v1.0.0"></a>
## v1.0.0 - 2021-08-19

> Bug Fixes
- **lazygit:** removed lazygit state from git watched files

> New
- **lazygit:** lazygit configuration

> Update
- **lazygit:** added git chglog and git tag integration
- **lazygit:** update lazygit configuration


[Unreleased]: https://github.com/tigorlazuardi/dotfiles/compare/v1.1.2...HEAD
[v1.1.2]: https://github.com/tigorlazuardi/dotfiles/compare/v1.1.1...v1.1.2
[v1.1.1]: https://github.com/tigorlazuardi/dotfiles/compare/v1.1.0...v1.1.1
[v1.1.0]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.9...v1.1.0
[v1.0.9]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.8...v1.0.9
[v1.0.8]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.7...v1.0.8
[v1.0.7]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.6...v1.0.7
[v1.0.6]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.5...v1.0.6
[v1.0.5]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.4...v1.0.5
[v1.0.4]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.3...v1.0.4
[v1.0.3]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.2...v1.0.3
[v1.0.2]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.1...v1.0.2
[v1.0.1]: https://github.com/tigorlazuardi/dotfiles/compare/v1.0.0...v1.0.1
