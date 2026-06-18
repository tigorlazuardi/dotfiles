# pi VPS deploy

Persistent pi-web backend via **systemd user services**, interactive workload via **zellij** over SSH, remote access via **corporate VPN (web)** + **Telegram (phone, no VPN)**.

## 0. Prereqs (admin)

- **Enable linger** for your account so user services run without an active login and survive reboot:
  ```
  sudo loginctl enable-linger <user>
  ```
  Verify: `loginctl show-user <user> | grep Linger` → `Linger=yes`.

## 1. Install pi + pi-web globally

The `pi-web-*` bins need the `@earendil-works/pi-coding-agent` peer resolvable, so install both globally:
```
npm i -g @earendil-works/pi-coding-agent @jmfederico/pi-web
pi-web --help        # confirm bins on PATH; verify the sessiond wiring env var names
```
(Your `~/.pi/agent` config — settings, agents, skills, prompts, workflows — arrives via `chezmoi apply`.)

## 2. systemd user units

```
mkdir -p ~/.config/systemd/user
cp ~/.pi/deploy/systemd/pi-web-sessiond.service ~/.config/systemd/user/
cp ~/.pi/deploy/systemd/pi-web.service          ~/.config/systemd/user/
cp ~/.pi/deploy/systemd/pi-web.env              ~/.config/pi-web.env
chmod 600 ~/.config/pi-web.env
# edit ~/.config/pi-web.env: set PI_WEB_ALLOWED_HOSTS to your real hostname

systemctl --user daemon-reload
systemctl --user enable --now pi-web-sessiond.service pi-web.service
systemctl --user status pi-web.service
journalctl --user -u pi-web.service -f
```

Web server now listens on **127.0.0.1:8504** only.

## 3. TLS + auth (REQUIRED — pi-web has no auth)

pi-web assumes trusted users and runs anything the session can run. Never expose its
port. Put a reverse proxy on the VPN-facing interface that adds TLS + auth, e.g. Caddy:

```
# /etc/caddy/Caddyfile  (system Caddy, or a user caddy)
pi.internal {                      # your VPN-facing hostname
    tls internal                   # or your corp/internal CA cert
    basicauth { youruser <bcrypt-hash> }   # caddy hash-password
    reverse_proxy 127.0.0.1:8504
}
```
TLS also makes the UI installable as a **PWA** on your phone (when on the VPN).

## 4. Access paths

- **Laptop / phone on corporate VPN** → `https://pi.internal/` (Caddy auth+TLS) → pi-web UI / PWA.
- **Phone anywhere, no VPN** → Telegram bot (VPS egress to api.telegram.org). See §6.

## 5. Interactive workload over SSH (zellij)

pi-web-managed sessions persist in the daemon (monitor via web). For hands-on terminal
work that survives disconnect, use zellij — its server keeps sessions alive after detach:

```
ssh vps
zellij attach -c pi-work      # -c = create if missing; run pi / fleet / ralph inside
# detach: Ctrl-q (or Ctrl-o d). Reattach later: zellij attach pi-work
zellij list-sessions
```
Run the heavy autonomous jobs here:
```
pi --continue                                  # or start fresh
/grill-me                                      # interview -> spec.md
/fleet { "planPath": "spec.md" }               # control-plane fan-out
# or: /ralph  for a single XL slice
```
zellij sessions are not reboot-persistent on their own; for always-on jobs prefer
running them as pi-web sessions (daemon-managed) or add a dedicated user service.

## 6. Telegram (phone monitor/steer, no VPN)

1. @BotFather → new bot → copy token.
2. In a pi session: run the pi-telegram setup; paste token (stored at `~/.pi/agent/telegram.json`).
3. Allowlist your own chat id so only you can drive the bot.
4. Persist the token encrypted (NOT plaintext) into dotfiles:
   ```
   chezmoi add --encrypt ~/.pi/agent/telegram.json
   ```
   Telegram works as long as the VPS has outbound internet — no VPN needed on the phone.

## Security checklist
- [ ] linger enabled (admin)
- [ ] pi-web bound to 127.0.0.1 (never the VPN IP)
- [ ] Caddy TLS + basicauth in front; `PI_WEB_ALLOWED_HOSTS` set
- [ ] Telegram chat-id allowlist; token encrypted via chezmoi
- [ ] VPS firewall: pi-web port not reachable except via the proxy
