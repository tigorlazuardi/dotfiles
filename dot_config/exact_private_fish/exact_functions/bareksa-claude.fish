function bareksa-claude --description 'Run claude with bypass permissions (--permission-mode=bypassPermissions)'
    set -fx CLAUDE_CONFIG_DIR $HOME/.bareksa/claude
    mkdir -p $CLAUDE_CONFIG_DIR
    claude --permission-mode=bypassPermissions $argv
end
