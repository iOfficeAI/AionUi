# Chisl OpenCode Plugin — Install Guide

> **Audience:** Chisl / AionUi operators who want a remote OpenCode server to
> report tool calls, inject dynamic system context, stream shell output, and
> route permissions through their local AionCore instance.
> **Plugin package:** [`@chisl/chisl-opencode-plugin`](https://www.npmjs.com/package/@chisl/chisl-opencode-plugin) (`AionUi/packages/opencode-plugin/`, pinned at `@opencode-ai/plugin@1.16.2`).
> **Wire protocol:** [v1 — see AionCore `PROTOCOL.md`](../../../AionCore/crates/aionui-ai-agent/src/manager/remote/PROTOCOL.md) (Chisl Plugin Channel section, last verified 2026-06-10).

## What the plugin does

The plugin is the **control plane** for a remote OpenCode server. The MCP
bridge (`local_fs_mcp`) stays the **data plane** — file reads, file writes,
and the synchronous shell tool. The plugin adds:

1. **Context injection.** AionCore pushes system-prompt strings to the
   plugin over SSE; the plugin injects them into the chat
   (`experimental.chat.system.transform`, with a defensive
   `chat.message` synthetic-part fallback that disables itself the first
   time the system hook fires).
2. **Tool audit.** Every tool call (`tool.execute.before` / `tool.execute.after`)
   and a curated subset of OpenCode lifecycle events
   (`file.watcher.updated`, `session.idle`, `message.part.updated`) are
   forwarded to AionCore and stored in a per-agent 500-entry ring buffer
   for the renderer-side status panel. Raw `args` and `output` are
   capped in transit and never persisted; only a redacted `summary`
   reaches storage.
3. **Permission routing.** OpenCode's `permission.ask` hook dials AionCore
   for a decision. The MVP policy is `"ask"` passthrough — AionCore
   returns `status: "ask"` and OpenCode's native flow continues. A
   richer policy engine is a documented follow-up.
4. **Streaming shell.** A custom `run_shell_streaming` tool streams
   command output (stdout + stderr) from the local AionCore back to the
   remote OpenCode host over SSE, gated through the same `ShellApprover`
   the local fs MCP uses. Default timeout 120 s (hard cap 1 h); output
   capped at 4 MiB.

The plugin runs **in-process** in the OpenCode server. It executes
nothing locally destructive — all shell execution happens on the AionCore
side, behind the `ShellApprover` and audit ring buffer.

## Prerequisites

- **OpenCode ≥ 1.16.x** on the remote server (the plugin is pinned to
  `@opencode-ai/plugin@1.16.2`; the SDK version pin lives in
  `<chisl-root>/opencode-sdk-version.json`).
- **A network path from the remote server back to the local machine.**
  The remote plugin dials **into** your local AionCore, not the other way
  around — same direction the local fs MCP uses. AionCore publishes its
  plugin webserver on the first reachability candidate of the host's
  local IP discovery (loopback for the `AIONUI_LOCAL_FS_MCP_PUBLIC_URL`
  override path).
- **`AIONUI_LOCAL_FS_MCP_PUBLIC_URL` override** (only when the auto-
  discovered URL is wrong): set this env var on the AionCore process to
  pin the advertised URL — typical when running AionCore behind a tunnel
  (Tailscale, Cloudflare), inside a container with a published port, or
  on a host whose primary interface isn't reachable from the remote
  server.

```bash
# Example: AionCore runs in a container with port 4111 published as
# https://aioncore.tail-net.ts.net on the LAN.
export AIONUI_LOCAL_FS_MCP_PUBLIC_URL=https://aioncore.tail-net.ts.net
```

The AionUi **"Install Plugin"** button in the remote-agent card reads
this same override when it builds the `endpoint_url` shown in the
install card.

## Install — using the in-app button (recommended)

1. In AionUi, open the **Remote Agents** panel and pick the OpenCode
   agent you want to wire up.
2. Click **Install Plugin**. AionCore mints (or returns) a per-agent
   bearer token and shows an install card with:
   - The **endpoint URL** (e.g. `http://192.168.1.10:4111/`).
   - A **config snippet** (a single `{"plugin": ["@chisl/chisl-opencode-plugin"]}`
     JSON object — copy into `~/.config/opencode/config.json` under the
     `plugin` key).
   - An **env snippet**:
     ```
     AIONCORE_URL=http://192.168.1.10:4111/
     AIONCORE_TOKEN=<token>
     ```
   - A **live status indicator** (green = connected within the last 60 s
     _or_ the SSE stream is open; amber = helloed but not currently
     streaming; grey = no contact).
3. Paste the env vars into the OpenCode process's environment (or
   wrap the command with `env $(cat chisl.env | xargs)`). The plugin
   reads `AIONCORE_URL` and `AIONCORE_TOKEN` at load time — no config-
   file edit is required if you set the env vars.
4. Restart `opencode serve` (or whatever supervises the OpenCode
   process). Watch the status indicator — it should turn green within
   10 s of restart. If it stays grey/amber for more than a minute, see
   the [Troubleshooting](#troubleshooting) section.

## Install — bare server

```bash
# 1. Install the plugin alongside opencode.
npm i -g @chisl/chisl-opencode-plugin@1.16.2

# 2. Set the env vars AionCore gave you. Persist them in your shell
#    rc or systemd Environment= so they survive a restart.
export AIONCORE_URL=http://192.168.1.10:4111/
export AIONCORE_TOKEN=00000000-0000-4000-8000-000000000001

# 3. Restart opencode. The plugin loads on next opencode start.
sudo systemctl restart opencode   # or however you supervise it
```

Verify:

```bash
# opencode serve logs should show the plugin loading with no errors.
journalctl -u opencode -n 50 | grep -i chisl
```

## Install — Docker

```bash
docker run -d --name opencode \
  -e AIONCORE_URL=http://host.docker.internal:4111/ \
  -e AIONCORE_TOKEN=00000000-0000-4000-8000-000000000001 \
  -p 4096:4096 \
  opencode/opencode:latest
```

`host.docker.internal` resolves to the Docker host's loopback on Docker
Desktop and to the gateway IP on Linux. If the OpenCode container runs
on a different host than AionCore, replace `host.docker.internal` with
the AionCore host's LAN IP, or publish the AionCore port with
`docker run -p 4111:4111 …` and point the plugin at the published host.

If AionCore runs in a container too, put both containers on the same
user-defined bridge network and use AionCore's container name as the
hostname. The `AIONUI_LOCAL_FS_MCP_PUBLIC_URL` override is the safest
way to pin the URL the plugin should dial in either case.

## Install — systemd

```ini
# /etc/systemd/system/opencode.service
[Unit]
Description=OpenCode
After=network.target

[Service]
Type=simple
User=opencode
Environment=AIONCORE_URL=http://192.168.1.10:4111/
Environment=AIONCORE_TOKEN=00000000-0000-4000-8000-000000000001
ExecStart=/usr/local/bin/opencode serve
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now opencode
sudo journalctl -u opencode -f    # watch the plugin load
```

## Token rotation

The token is per-workspace (per `remote_agent_id` row). Rotate it from
the AionUi remote-agent card or by hitting the AionCore REST endpoint
directly:

```bash
curl -X POST http://localhost:4111/api/remote-agents/<agent-id>/plugin/rotate-token
```

The response carries the new token in full **exactly once** — copy it
into the OpenCode process's environment and restart. The old token sees
`401 Unauthorized` on its next request; the plugin's SSE loop
reconnects with exponential backoff as soon as the new env vars are
loaded. The webserver's validator reads the same SQLite row, so the new
token is visible to the next inbound request without a restart.

## Troubleshooting

**401 Unauthorized on the plugin webserver.**
The token is stale (rotated, or pasted wrong). Re-open the AionUi
install card, copy the current `AIONCORE_TOKEN`, restart OpenCode.

**Status indicator stays grey forever; no `hello` lands in AionCore.**
The remote OpenCode server cannot reach `AIONCORE_URL` from its
network. Check:

1. `curl $AIONCORE_URL/global/health` from the OpenCode host returns
   `{"healthy": true, …}`. If it doesn't, AionCore is not reachable —
   fix the URL or the firewall.
2. The `AIONUI_LOCAL_FS_MCP_PUBLIC_URL` override is set on the
   **AionCore** process (not the OpenCode process). The override is
   for advertising AionCore's URL; the plugin is the dialer.
3. The OpenCode host can resolve AionCore's hostname (try the IP
   instead if DNS is suspect).
4. The port is open in both directions (the webserver binds to
   `0.0.0.0:4111` in the default path; the firewall must allow
   inbound from the OpenCode host).

**Plugin not loading — `opencode serve` logs show no `chisl` line.**
The plugin package isn't on the OpenCode host's load path. Confirm:

```bash
ls $(npm root -g)/@chisl/chisl-opencode-plugin/dist/index.js
```

Re-run `npm i -g @chisl/chisl-opencode-plugin@1.16.2` and restart
`opencode serve`.

**Status indicator is amber (`helloed but no SSE stream`).**
The plugin sent a `hello` (so URL + token are right) but the SSE
stream isn't currently open. The most common cause is the OpenCode
host's outbound HTTP/1.1 keep-alive getting closed by a stateful
firewall between the two. The plugin auto-reconnects with exponential
backoff; if the indicator stays amber for more than a minute, check
the opencode logs for SSE error events.

**Permission.ask prompts appear in OpenCode's native UI, not in
AionUi's Approvals queue.**
That is the **expected** MVP behaviour — AionCore responds with
`status: "ask"` and OpenCode's native flow takes over. AionUi shows
the same prompt via the existing `permission.asked` SSE event
handler (see AionCore `PROTOCOL.md` → Permission / question). A
AionCore-side policy engine is a follow-up plan.

## Uninstall

1. Unset `AIONCORE_URL` / `AIONCORE_TOKEN` from the OpenCode process
   environment.
2. Remove the `{"plugin": ["@chisl/chisl-opencode-plugin"]}` entry from
   `~/.config/opencode/config.json` (if you added it).
3. Restart `opencode serve`.
4. (Optional) Rotate the token in AionUi so a stale install can't
   re-attach.
