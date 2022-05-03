#!/bin/sh
export PATH="/lib/cargo/bin:$PATH"
export PATH="$HOME/.local/npm/bin:$PATH"
export PATH="$HOME/go/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"

export ANDROID_SDK_ROOT='/opt/android-sdk'
export PATH="$PATH:$ANDROID_SDK_ROOT/platform-tools/"
export PATH="$PATH:$ANDROID_SDK_ROOT/tools/bin/"
export PATH="$PATH:$ANDROID_ROOT/emulator"
export PATH="$PATH:$ANDROID_SDK_ROOT/tools/"
export NODE_PATH="$HOME/.local/npm/node_modules"
