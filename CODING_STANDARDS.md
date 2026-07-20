# Coding Standards

## Scope

This repository is a chezmoi source tree for personal Arch Linux/Wayland configuration. Keep changes narrow to managed source files; its names encode destination paths and behavior.

## Chezmoi source workflow

- Edit tracked chezmoi source, never `$HOME` targets as repository changes. `README.md` defines source as `~/.local/share/chezmoi/` and targets as `$HOME`.
- Preserve chezmoi naming modifiers: `dot_` maps dotfiles, `private_` preserves restrictive permissions, `exact_` replaces target directories, `executable_` preserves executability, and `.tmpl` files use chezmoi templates.
- For a target-side edit, use `chezmoi edit … --apply` or re-add it with `chezmoi re-add`; review `chezmoi diff` and `chezmoi status` before applying. Do not apply source changes unless task asks.
- Keep machine/user values in templates (`{{ .chezmoi.homeDir }}`, `{{ .email }}`), not hard-coded home paths or identities.

## TypeScript Pi extensions

- Place live Pi extensions in `dot_pi/private_agent/extensions/`; use `.ts`, ESM `import` syntax, and default-export extension registration fn receiving `ExtensionAPI`.
- Prefer Node built-ins and Pi types (`ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`) over added dependencies or untyped extension boundaries.
- Keep event/command handlers defensive: isolate optional host APIs or filesystem/process calls with `try`/`catch`; extension failures must fail open rather than terminate Pi.
- Use explicit types for persisted state and command parsing. Validate external/free-form inputs before scheduling, filesystem writes, or state mutation.
- Comments explain compatibility, safety, or edge-case reasoning; do not narrate obvious code. Match nearby two-space TypeScript indentation in extensions.

## Validation

- No repository-wide TypeScript test runner or formatter config is tracked. For an extension change, run targeted syntax/type checks supplied by its owning Pi environment when available, then manually exercise changed event/command paths.
- For chezmoi changes, use `chezmoi diff` and `chezmoi status`; run relevant executable/config validation when the changed tool provides one. Report skipped checks and reason.

## Safety and secrets

- Never add plaintext credentials, tokens, private keys, or `.env` values. `private_dot_npmrc.tmpl` reads its npm token from encrypted `.npm-token.age` only during chezmoi apply.
- Preserve `private_` names and restrictive permissions for sensitive targets. Treat template output and command/header data as sensitive; persist/log only needed, allow-listed fields.
- Do not bypass destructive or outward-facing confirmation: source overwrites, force pushes, filesystem deletion, applying chezmoi, publishing, and credential writes require explicit approval.

## Git hygiene

- Keep commits focused and use established Conventional Commit prefixes (`feat`, `fix`, `refactor`, `chore`, `docs`, `update`) as shown by recent history.
- Check staged diff before commit. Global template hook runs `gitleaks protect --staged --redact`; do not use `--no-verify` to bypass a secret finding without resolving or explicitly approving its false positive.

The Fowler smell baseline from the `code-review` skill still applies below these standards. Where this document and the baseline disagree, this document wins.

First ticket in an area establishes its living local pattern; later reviews check both this document and that code. A disagreement signals this standard needs updating, not that new code is wrong by default.
