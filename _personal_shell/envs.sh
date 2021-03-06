#!/bin/sh

# This should be set on /etc/profile.d folder for global settings
export NVIM_LISTEN_ADDRESS=/tmp/nvimsocket
export PRETTIERD_DEFAULT_CONFIG=$HOME/.config/nvim/linter-config/.prettierrc.toml
export CHROME_EXECUTABLE=/usr/bin/chromium
export CARGO_TARGET_DIR="$HOME/.cargo/artifacts"
