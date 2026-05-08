# AionUi WebUI Configuration Guide

This guide covers how to start, configure, and secure AionUi's WebUI — the
browser-based interface that can run alongside the desktop app or stand on its
own on a headless server / container.

> Draft replacement for the GitHub wiki page
> [`WebUI-Configuration-Guide`](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide).
> Kept in-tree until ready to publish.

## Which mode am I in?

There are two distinct WebUI flavors, and they intentionally **do not share
state by default**:

| Mode | Entry point | Data directory | When to use |
|---|---|---|---|
| **Desktop-bundled WebUI** | The installed `AionUi` app (`AionUi --webui`, the settings toggle, or the settings page WebUI switch) | The same `userData` the desktop app uses, via a CLI-safe symlink in `$HOME` (`~/.aionui` / `~/.aionui-dev`) | You want one unified AionUi installation that you can use from the app window AND from a browser (phone on the same LAN, second monitor, etc.). All three desktop paths — pure IPC, GUI with WebUI toggled on, and `--webui` headless — share the same SQLite database, cron jobs, conversations, and admin password. |
| **Standalone WebUI (`aionui-web`)** | `bun run webui` in the repo, or the packaged `aionui-web` CLI tarball (future) | `~/.aionui-web[-dev[-2]]` by default — **never** the desktop userData | You're on a headless Linux/macOS/Windows host that will not run the Electron app (server, container, Termux). No desktop install needed. |

If you want the two modes to share data, point the standalone one at the
desktop's directory with `--data-dir` — see
[Sharing data between modes](#sharing-data-between-modes).

---

## Usage scenarios (click to jump)

Pick your scenario:

- **[Cross-network access](#cross-network-access)** (recommended): Start → open in browser → connect via Tailscale
- **[LAN access](#lan-access)**: Start → `--remote` → open IP from phone
- **[Local-only use](#local-only-quick-start)**: Start → open `http://localhost:25808`
- **[Server deployment](#server-deployment)**: Start as background service → LAN/WAN access
- **[Standalone (no Electron)](#standalone-webui-no-electron)**: `bun run webui` / `aionui-web start`

---

## Quick command reference

Desktop-bundled WebUI (the installed AionUi app):

| Platform | Local access | **LAN access (`--remote`)** |
|:---|:---|:---|
| **Windows** | `AionUi.exe --webui` | `AionUi.exe --webui --remote` |
| **macOS** | `/Applications/AionUi.app/Contents/MacOS/AionUi --webui` | `/Applications/AionUi.app/Contents/MacOS/AionUi --webui --remote` |
| **Linux (desktop user)** | `AionUi --webui` | `AionUi --webui --remote` |
| **Linux (root)** | `sudo AionUi --webui --no-sandbox` | `sudo AionUi --webui --remote --no-sandbox` |
| **Android (Termux)** | `AionUi --no-sandbox --webui` | `AionUi --no-sandbox --webui --remote` |

Standalone WebUI:

```bash
bun run webui                       # dev, default port
bun run webui --remote              # dev, LAN-accessible
bun run webui --port 8080           # custom port
bun run webui --data-dir /path      # custom work directory

bun run resetpass                   # reset admin password (standalone)
AionUi --resetpass                  # reset admin password (desktop-bundled)
```

> **`--no-sandbox` is required when the Electron process runs as root or inside
> a Proot/Termux container** (Android). Without it Chromium refuses to start
> and the process exits immediately. Desktop users and sudo-less Linux users
> should **not** add this flag.

---

## Desktop-bundled WebUI

### Local-only quick start

The simplest path — the desktop app hosts the WebUI on `localhost` only.

1. **Open AionUi** (installed from DMG / installer / AppImage).
2. **Open the settings page**, click **WebUI**.
3. Turn on **Enable WebUI**.
4. Click the displayed URL (e.g. `http://localhost:25808`) or open it in any
   browser on the same machine.

On first launch the app shows an initial random admin password — **copy it
immediately**, you'll need it to log in. Once copied, the UI masks it.

![WebUI settings](../../../packages/desktop/src/renderer/assets/logos/brand/app.png)

### LAN access

1. In the same WebUI settings page, also turn on **Allow LAN Access**.
2. The panel now shows two URLs:
   - `Local: http://localhost:25808`
   - `Network: http://192.168.x.x:25808`
3. Open the `Network:` URL from another device on the same Wi-Fi (phone,
   tablet, another laptop).

Command-line equivalent of the "Allow LAN Access" toggle is the `--remote`
flag listed in the quick command reference.

> **Only enable LAN access on networks you trust.** The login screen is
> bcrypt-hashed and rate-limited, but any device on your LAN can reach it.

### Cross-network access

For accessing from a totally different network (home → office, mobile data,
etc.) we recommend **Tailscale**:

1. Install [Tailscale](https://tailscale.com) on the host machine and on the
   device you'll connect from.
2. Log in with the same account on both.
3. Turn on **Allow LAN Access** in WebUI settings.
4. From the client, open `http://100.x.y.z:25808` where `100.x.y.z` is the
   host's Tailscale IP.

See the wiki's [Remote Internet Access
Tutorial](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide)
for the full walkthrough (HTTPS, Cloudflare Tunnel, reverse proxies).

### Starting WebUI from the command line

Sometimes the settings toggle isn't available (headless servers, scripted
launchers, etc.). The `--webui` flag starts AionUi in headless WebUI mode —
no window, just the HTTP server.

**Windows:**

```cmd
AionUi.exe --webui
AionUi.exe --webui --remote

:: Full path when `AionUi.exe` is not on PATH
"C:\Program Files\AionUi\AionUi.exe" --webui
```

**macOS:**

```bash
/Applications/AionUi.app/Contents/MacOS/AionUi --webui
/Applications/AionUi.app/Contents/MacOS/AionUi --webui --remote
```

**Linux (regular user):**

```bash
AionUi --webui
AionUi --webui --remote
```

**Linux (root user):**

```bash
sudo AionUi --webui --no-sandbox
sudo AionUi --webui --remote --no-sandbox
```

> `--no-sandbox` is needed because Chromium refuses to launch its sandbox as
> root. This flag is also required inside Termux/Proot Ubuntu on Android (see
> below).

Alternative paths on Linux:

- Full install path: `/usr/bin/AionUi --webui`
- AppImage bundle: `./AionUi-*.AppImage --webui`

### Android via Termux

Android uses the Electron binary inside a Proot Ubuntu container. Only
**WebUI mode works** — the desktop window needs an X server that Android
doesn't provide.

> Original community tutorial by
> [@Manamama](https://github.com/Manamama):
> [Running AionUi WebUI on Android](https://gist.github.com/Manamama/b4f903c279b5e73bdad4c2c0a58d5ddd)
> · Discussion: [#217](https://github.com/iOfficeAI/AionUi/issues/217)

Requirements: Android 7.0+, ~5 GB free storage, Termux from
[F-Droid](https://f-droid.org/en/packages/com.termux/) (the Play Store build
is outdated).

```bash
# Step 1: install Proot Ubuntu
pkg update -y
pkg install proot-distro -y
proot-distro install ubuntu
proot-distro login ubuntu

# Step 2: system dependencies
apt update
apt install -y wget libgtk-3-0 libnss3 libasound2 libgbm1 libxshmfence1 ca-certificates

# Step 3: install AionUi
wget https://github.com/iOfficeAI/AionUi/releases/download/v1.5.2/AionUi_1.5.2_arm64.deb
apt install -y ./AionUi_*.deb
which AionUi

# Step 4: launch
AionUi --no-sandbox --webui            # local only
AionUi --no-sandbox --webui --remote   # LAN

# Step 5: open http://localhost:25808 in the device browser
```

One-liner from Termux's main shell (skips the explicit `proot-distro login`):

```bash
proot-distro login ubuntu -- bash -c "AionUi --no-sandbox --webui --remote"
```

**Expected D-Bus / X-server warnings** (safe to ignore — WebUI doesn't need
them):

```
[WARNING] Could not connect to session bus...
[ERROR] Failed to connect to the bus...
[WARNING] Multiple instances of the app detected...
```

**Tips:**

- Use a lightweight browser (Chrome / Firefox Focus).
- Close background apps to free RAM.
- Keep the device plugged in during long sessions.
- Port already in use? Add `--port 8080` (or any free port).
- Permission denied? `chmod +x /opt/AionUi/aionui`.

### Default port

The default WebUI port is **`25808`** in production builds, **`25809`** in
`bun start` dev builds, and **`25810`** for `AIONUI_MULTI_INSTANCE=1` dev
instances. You can override with `--port` or `$AIONUI_PORT`.

---

## Standalone WebUI (no Electron)

For users who need to serve AionUi from a machine that shouldn't (or can't)
install the Electron desktop app: Linux servers, Docker, Termux, or just a
development setup next to the source tree.

The standalone host is the `@aionui/web-host` package wrapped by the
`scripts/webui.ts` launcher (`bun run webui`) or the packaged `aionui-web`
CLI tarball.

### `bun run webui` from the repo

```bash
bun install             # first time only
bun run package         # builds out/renderer/ (required once)
bun run webui
```

Output:

```
[webui] work dir   : /Users/you/.aionui-web-dev
[webui] static dir : /.../AionUi/out/renderer
[webui] backend bin: /Users/you/.cargo/bin/aionui-backend
[webui] launching  : port=25809 allowRemote=false
...
AionUi WebUI is ready
  Local  : http://127.0.0.1:25809

Initial admin password: <12-char random>
(change it after first login)
```

### CLI flags

| Flag | Env | Default | Description |
|---|---|---|---|
| `--port <n>` | `AIONUI_PORT` / `PORT` | `25808` prod / `25809` dev / `25810` multi-instance dev | Listen port. |
| `--remote` | `AIONUI_ALLOW_REMOTE` / `AIONUI_REMOTE` = `1`, or `AIONUI_HOST` = `0.0.0.0` | off (localhost only) | Bind to `0.0.0.0` so LAN clients can connect. |
| `--data-dir <path>` | `AIONUI_DATA_DIR` | `~/.aionui-web[-dev[-2]]` | Work directory — SQLite DB, `webui.config.json`, `logs/`, chat history. |
| — | `AIONUI_LOG_DIR` | `<data-dir>/logs` | Override backend log directory. |
| — | `AIONUI_STATIC_DIR` | `<repo>/out/renderer` | Override the directory served as static assets. Useful for running a prebuilt renderer from a different location. |
| — | `AIONUI_BACKEND_BIN` | `resources/bundled-aionui-backend/<plat>-<arch>/aionui-backend` → `$PATH` lookup | Absolute path to the `aionui-backend` binary. |
| — | `NODE_ENV=production` | — | Switches the default data dir to `~/.aionui-web` (no `-dev` suffix) and the default port to `25808`. |
| — | `AIONUI_MULTI_INSTANCE=1` | — | Dev-only second instance. Work dir `~/.aionui-web-dev-2`, port `25810`. |

### Resetting the password standalone

```bash
bun run resetpass                        # default ~/.aionui-web-dev
bun run resetpass --data-dir /path       # explicit work dir
AIONUI_DATA_DIR=/path bun run resetpass  # env equivalent
```

Prints a new random 12-char password and rotates the stored bcrypt hash and
session secret so any active browser sessions are invalidated.

### Sharing data between modes

By default, standalone and desktop-bundled WebUI **don't share data**:

| | Desktop-bundled | Standalone |
|---|---|---|
| Default work dir (macOS) | `~/.aionui[-dev]` → `~/Library/Application Support/AionUi[-Dev]/aionui` | `~/.aionui-web[-dev]` |
| Default work dir (Linux) | `~/.aionui[-dev]` → `~/.config/AionUi[-Dev]/aionui` | `~/.aionui-web[-dev]` |
| Default work dir (Windows) | `%APPDATA%\AionUi[-Dev]\aionui` | `%USERPROFILE%\.aionui-web[-dev]` |

To share — opt-in, one side points at the other's directory:

```bash
# Standalone reads the desktop's DB (after you've opened the desktop app once
# so the symlink is created):
bun run webui --data-dir ~/.aionui-dev

# Or the other way: make the desktop use a custom path you already have.
# (Not recommended — the desktop app's resolver expects the CLI-safe symlink
# structure on macOS to keep CLI tools off paths with spaces.)
```

> On macOS the desktop-bundled mode creates `~/.aionui[-dev]` as a symlink to
> avoid CLI tools choking on spaces in `Application Support`. If you run
> standalone WebUI **before** ever installing the desktop app, the standalone
> launcher deliberately uses `~/.aionui-web*` (not `~/.aionui*`) so it can't
> accidentally occupy the symlink location with a real directory and break a
> future desktop install. See the comment block in `scripts/webui.ts` for the
> full rationale.

---

## Authentication

### Initial credentials

On first launch each WebUI instance creates an admin user with:

- **Username:** `admin`
- **Password:** random 12-character alphanumeric, printed to the console

The password is also shown in the desktop settings page until you copy it the
first time; after that it's masked.

### Security features

- **Password hashing:** `bcrypt` (10 salt rounds, matches the legacy
  webserver).
- **Session cookie:** `aionui-session`, HMAC-SHA256 signed opaque token,
  `HttpOnly`, `SameSite=Strict` for local bind, `SameSite=Lax` for `--remote`.
- **Session TTL:** 24 hours.
- **Rate limit on login:** 5 attempts per 15 minutes per IP.
- **CSRF:** session cookie is `HttpOnly` + `SameSite`; login endpoint also
  carries a CSRF cookie pair set by the renderer.
- **Password reset rotates the session secret**, invalidating all existing
  tokens.

### Single-user only (for now)

WebUI ships with one user, `admin`. Multi-user support is planned but not in
the current release. The `username` argument to `--resetpass` is reserved for
forward compatibility — today it is always `admin`.

### Changing the password in the browser

After logging in, open the Settings → WebUI page in the browser UI. You can:

- See and copy the current password (once; then masked).
- Click **Reset** to generate a new random password.
- Click **Change** to set a password of your choice (minimum 8 characters).

Any of these actions invalidates existing session tokens. You'll have to log
back in.

### Changing the password via CLI

Desktop-bundled:

```cmd
:: Windows
AionUi.exe --resetpass
"C:\Program Files\AionUi\AionUi.exe" --resetpass
```

```bash
# macOS
/Applications/AionUi.app/Contents/MacOS/AionUi --resetpass

# Linux
AionUi --resetpass
```

Standalone:

```bash
bun run resetpass
bun run resetpass --data-dir /custom/work/dir
```

Either form prints the new password on stdout. **Copy it immediately** — it
is never stored in plaintext.

---

## Channels (Telegram / Lark / WeCom / ...)

The WebUI settings page has a **Channels** section that lets you connect
AionUi to external chat platforms (Telegram, Lark, WeCom, DingTalk, etc.).
This is independent of WebUI mode — channels work whether you're using the
desktop window, the browser UI, or both.

1. Settings → WebUI → scroll to **Channels**.
2. **Add Channel** → pick the platform.
3. Provide the platform-specific credentials (bot token, webhook URL, app ID,
   etc.).
4. Once connected, you can chat with your AionUi agents from that platform.

Channels are optional. Skip if you only need the browser UI.

---

## Server deployment

Run AionUi as a background service that auto-restarts and survives reboots.

### Linux — systemd (recommended)

```bash
sudo nano /etc/systemd/system/aionui-webui.service
```

```ini
[Unit]
Description=AionUi WebUI Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME
ExecStart=/usr/bin/AionUi --webui --remote
Restart=on-failure
RestartSec=10
# Uncomment if running as root:
# ExecStart=/usr/bin/AionUi --webui --remote --no-sandbox
# User=root
# Environment="AIONUI_PORT=8080"   # custom port

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable aionui-webui.service
sudo systemctl start aionui-webui.service
sudo systemctl status aionui-webui.service
```

Management:

```bash
sudo journalctl -u aionui-webui.service -f      # follow logs
sudo systemctl restart aionui-webui.service      # restart
sudo systemctl stop aionui-webui.service         # stop
```

Get the access URL:

```bash
sudo journalctl -u aionui-webui.service | grep "WebUI"
```

### Linux — systemd for standalone `bun run webui`

If you prefer to run the standalone host from a Git checkout on a server
(e.g. inside a container):

```ini
[Service]
Type=simple
User=aionui
WorkingDirectory=/srv/AionUi
ExecStart=/usr/local/bin/bun run webui --remote --port 8080
Environment="AIONUI_DATA_DIR=/srv/aionui-data"
Environment="AIONUI_BACKEND_BIN=/usr/local/bin/aionui-backend"
Restart=on-failure
RestartSec=10
```

### macOS — LaunchAgent

`~/Library/LaunchAgents/com.aionui.webui.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aionui.webui</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/AionUi.app/Contents/MacOS/AionUi</string>
    <string>--webui</string>
    <string>--remote</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.aionui.webui.plist
launchctl start com.aionui.webui
```

---

## Troubleshooting

### Port already in use

The launcher does not automatically pick a free port. Use `--port` or
`$AIONUI_PORT`:

```bash
AionUi --webui --port 8080
# or
bun run webui --port 8080
```

### Can't reach the UI from the browser

1. Is the process actually listening?
   ```bash
   lsof -i :25808 -iTCP -sTCP:LISTEN
   netstat -an | grep 25808
   ```
2. Try another browser; clear cache (`Ctrl/Cmd + Shift + Delete`).
3. If you're on LAN, make sure you started with `--remote` or the "Allow
   LAN Access" toggle.
4. Check that your firewall isn't blocking the port (see below).

### Firewall

**Windows (PowerShell as admin):**

```powershell
New-NetFirewallRule -DisplayName "AionUi WebUI" -Direction Inbound `
  -Protocol TCP -LocalPort 25808 -Action Allow
```

**Linux (UFW):**

```bash
sudo ufw allow 25808/tcp
```

**macOS:** System Settings → Network → Firewall → Options → add the AionUi
binary to the allow list.

### Locating AionUi

```cmd
:: Windows
where AionUi.exe
```

```bash
# macOS
mdfind -name AionUi.app

# Linux
which AionUi
find / -name AionUi 2>/dev/null
```

### Viewing logs

Desktop-bundled WebUI:

- macOS: `~/Library/Logs/AionUi/`
- Linux: `~/.config/AionUi/logs/` (or systemd journal if managed by systemd)
- Windows: `%APPDATA%\AionUi\logs\`

Standalone:

```bash
bun run webui 2>&1 | tee /tmp/aionui-webui.log
```

Log directory is `$AIONUI_DATA_DIR/logs` (or `$AIONUI_LOG_DIR` if set).

### `/api/system/info` reports a weird path

`/api/system/info` returns the backend's view of `work_dir` / `cache_dir` /
`log_dir`. Expected values:

| Mode | `work_dir` | `cache_dir` | `log_dir` |
|---|---|---|---|
| Desktop-bundled (any path) | `~/.aionui[-dev]` (symlink on macOS) | `~/.aionui-config[-dev]` | Platform logs dir |
| Standalone | `<--data-dir>` (default `~/.aionui-web[-dev]`) | same | `<work-dir>/logs` |

If a desktop-bundled WebUI instead reports the literal
`~/Library/Application Support/AionUi-Dev` with spaces, CLI tools (claude,
gemini, qwen) inside the backend may fail to start. This is a symlink
corruption; see [Corrupted CLI-safe symlink](#corrupted-cli-safe-symlink).

### Corrupted CLI-safe symlink

On macOS, the desktop app creates `~/.aionui[-dev]` as a symlink to
`~/Library/Application Support/AionUi[-Dev]/aionui` so agents don't choke on
spaces in the path.

If that symlink gets replaced with a real directory (for instance, an older
build of the standalone launcher that defaulted to the same location), the
desktop app falls back to the space-containing path and agent spawn starts
to fail. Fix:

```bash
# 1. Quit the desktop app completely.
# 2. Move aside any local data.
mv ~/.aionui-dev ~/.aionui-dev.bak-$(date +%Y%m%d)
# 3. Relaunch the desktop app — it will recreate the symlink on startup.
```

If you have unique data under the moved-aside directory, merge it into
`~/Library/Application Support/AionUi-Dev/aionui/` before removing the
backup.

### ACP `initialize` handshake times out after 30 s

The backend spawns per-conversation CLI processes (claude / gemini / codex /
qwen / ...) through the ACP protocol. If they can't start, the first prompt
times out with a 502.

Most common cause: the CLI isn't on the process's `PATH`. Standalone mode
now prepends every `~/.nvm/versions/node/*/bin` directory to `PATH` before
spawning the backend; if you've installed a CLI under a different Node
version, make sure that version's `bin/` is on `PATH` (the desktop app
already does this).

If you see this in the backend log:

```
Superset: gemini not found in PATH. Install it and ensure it is on PATH, then retry.
```

that's the `~/.superset/bin` wrapper bailing. Point `PATH` at the real CLI
before `~/.superset/bin`, or reinstall the CLI.

---

## Command line options summary

Desktop-bundled (`AionUi` binary):

| Option | Description |
|---|---|
| `--webui` | Start in WebUI mode (no window) |
| `--remote` | Bind to `0.0.0.0` so LAN clients can connect |
| `--port <n>` / `--webui-port <n>` | Override the listen port |
| `--resetpass [username]` | Reset the admin password |
| `--no-sandbox` | Disable Chromium sandbox (required for root Linux and Termux) |

Standalone (`bun run webui` / `aionui-web`):

| Option / Env | Description |
|---|---|
| `--port <n>` / `$AIONUI_PORT` | Override the listen port |
| `--remote` / `$AIONUI_ALLOW_REMOTE=1` | Bind to `0.0.0.0` |
| `$AIONUI_HOST=0.0.0.0` | Alternate way to enable LAN bind |
| `--data-dir <path>` / `$AIONUI_DATA_DIR` | Override the work directory |
| `$AIONUI_LOG_DIR` | Override the log directory |
| `$AIONUI_STATIC_DIR` | Override the directory served as static assets |
| `$AIONUI_BACKEND_BIN` | Absolute path to the backend binary |
| `$NODE_ENV=production` | Switch to production defaults |
| `$AIONUI_MULTI_INSTANCE=1` | Use a second isolated dev instance |

Resetpass CLI (standalone):

| Option / Env | Description |
|---|---|
| `[username]` | Positional, reserved (always `admin`) |
| `--data-dir <path>` / `$AIONUI_DATA_DIR` | Which work directory to reset the password in |

---

## Best practices

### Development

- Use `bun start` + the settings toggle for the normal dev loop; data stays
  in `~/.aionui-dev`.
- Use `bun run webui` for a second, isolated instance you can point at
  disposable data (`--data-dir /tmp/aionui-scratch`).

### Production

- Always run behind a firewall rule or VPN unless the LAN is fully trusted.
- Put the service under systemd / LaunchAgent so it restarts automatically.
- Rotate the admin password periodically (`--resetpass`).
- Keep AionUi updated — security fixes do land in regular releases.

### LAN

- `--remote` only after you've verified the network is trusted.
- Phones on iOS: pin the page URL to the home screen for a PWA-style icon.

---

## Related resources

- [Getting Started](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started)
- [LLM Configuration](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration)
- [Multi-Agent (ACP) Setup](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup)
- [MCP Configuration](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide)
- [Remote Internet Access Tutorial](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide)
- [FAQ](https://github.com/iOfficeAI/AionUi/wiki/FAQ)
