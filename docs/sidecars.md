# SideCars — embedding local services in tabs

Phase 3 WS3 adds a way to embed reverse-proxied localhost services (OpenVSCode
Server, ttyd, …) inside AionUi as native tabs. The backend (AionCore) owns the
proxy; the renderer just renders the response in a sandboxed `<webview>`.

## What is a SideCar?

A SideCar is a **local service you run on your own machine** that AionUi can
open in a tab. The service does **not** need to be exposed to the public
network — AionCore proxies every request through `127.0.0.1:<backendPort>` to
`127.0.0.1:<sidecarPort>`. From the service's point of view, every request
originates on the same machine.

The proxy is the **only** path the webview takes — it never speaks to your
local service directly. This lets AionUi enforce a single allowlist of
registered `(name, port)` pairs and a per-tab auth cookie.

## Security model

| Concern           | How it's handled                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network exposure  | The local service listens on `127.0.0.1` only; the proxy is the only thing the webview talks to.                                                                                                              |
| Allowlist         | `POST /api/sidecars` registers a `(name, port)` pair. The proxy refuses requests whose path doesn't match a registered sidecar.                                                                               |
| Auth              | The first navigation includes `?sct=<token>` (a one-shot token). The proxy exchanges it for a session cookie scoped to the sidecar's URL prefix. Subsequent in-tab navigations ride the cookie.               |
| Token lifetime    | Tokens are single-use and short-lived; they are **never** persisted to disk by the renderer. Restarting the renderer or closing the tab invalidates them — the next Open re-registers and gets a fresh token. |
| Token persistence | The persisted `sidecars.items` config stores `name` and `port` only. `id`, `url`, and `token` live in memory until the next registration.                                                                     |

> SideCars are not a remote-access tool. They do not expose your local
> services to the network. Use [WebUI mode](./webui.md) for that.

## Adding a SideCar in the UI

1. Start the local service you want to embed (see recipes below).
2. Open **Settings → SideCars** (or `Cmd/Ctrl+,` then click _SideCars_).
3. Enter a **Name** (display only, must be unique) and the **Port** the
   service listens on. The port must be in `1024–65535`.
4. Click **Add**. The entry appears in the list with a _Local only_ tag.
5. Click **Open**. AionUi registers the sidecar, receives a token, and opens
   the service in an embedded modal with a navigation bar.
6. Click **Remove** to drop a sidecar (the local service itself is not
   affected).

The `Registered` tag appears once a sidecar has been opened at least once
and AionCore has assigned it an `id`.

## Recipes

### ttyd — share a terminal

`ttyd` is a small web frontend for a shell session. The `--base-path` flag
makes the service aware that it's mounted under a sub-path, which is
required when the AionCore proxy is in front of it.

```bash
# Install: brew install ttyd / scoop install ttyd / apt install ttyd
ttyd -p 7681 --base-path / bash
```

In the AionUi SideCars tab:

- **Name**: `ttyd`
- **Port**: `7681`

Click **Open**. The ttyd UI loads under `http://127.0.0.1:<backendPort>/sidecar/<id>/`.
All of ttyd's static assets, WS upgrades, and POSTs are proxied through the
same prefix.

> ttyd's `--base-path` must match the proxy's prefix (`/` works because
> the proxy strips its own prefix before forwarding). Without
> `--base-path`, ttyd's UI loads but its WebSocket connects to the wrong
> path and the terminal freezes.

### OpenVSCode Server

[OpenVSCode Server](https://github.com/gitpod-io/openvscode-server) is a
browser build of VS Code that you can run locally. It's path-prefix
friendly out of the box and is one of the most useful SideCars to embed.

```bash
# Install: download the latest release from the GitHub releases page.
./openvscode-server --port 8000 --without-connection-token
```

In the AionUi SideCars tab:

- **Name**: `openvscode`
- **Port**: `8000`

Click **Open**. The full VS Code experience loads inside AionUi. The proxy
forwards every `/...` path the editor asks for, so extensions, the
integrated terminal, and the file watcher all work.

> Some OpenVSCode Server paths assume a same-origin window. If you see
> "Refused to connect" or a 404 in DevTools, double-check the service is
> started with `--without-connection-token` — without it, the editor
> rejects requests without a `?tkn=...` query string that the proxy
> cannot supply.

### Writing your own

The proxy is path-agnostic. As long as your service:

1. Listens on `127.0.0.1` (or `0.0.0.0`).
2. Tolerates being served under a prefix (e.g. `/sidecar/<id>/`), OR uses
   relative URLs everywhere so it can be mounted anywhere.
3. Doesn't require its own auth challenge for same-origin requests.

…you can register it as a SideCar by pointing at the port it's listening
on. Plain HTTP and HTTPS are both supported; HTTPS services need a
trusted certificate or the request will fail at the TLS handshake.

## How the embed URL is built

1. The user clicks **Open**.
2. The renderer calls `POST /api/sidecars` with `{name, port}`. The
   backend responds with `{id, name, port, url, token}`.
3. The renderer composes:

   ```text
   http://127.0.0.1:<backendPort><url>?sct=<token>
   ```

   `<backendPort>` is the same port the renderer's HTTP bridge uses
   (`window.__backendPort`, injected by the preload script).
   `<url>` is the proxy path (e.g. `/sidecar/<id>/`).

4. The webview navigates to the composed URL.
5. The proxy validates the token, sets a session cookie, and proxies the
   request to `127.0.0.1:<port>`.
6. From this point on, the cookie is enough — the URL bar inside the
   webview shows the proxy path, and the service sees requests whose
   `Host` is `127.0.0.1:<port>` and whose `X-Forwarded-*` headers carry
   the proxy chain.

## Troubleshooting

| Symptom                                                | Cause / fix                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Webview shows blank page with `ERR_CONNECTION_REFUSED` | The local service isn't running, or it's bound to a different port. Run the service and click **Open** again.                            |
| Webview shows a 404 with a `sct=...` query string      | The token was rejected. The token is single-use; if the first navigation was interrupted, click **Open** again to re-register.           |
| `403 Forbidden` from the proxy                         | The cookie is missing or expired. Re-open the sidecar from the settings page; this issues a fresh token.                                 |
| `ttyd` shows a UI but the terminal never types         | You forgot `--base-path /`. Restart ttyd with that flag.                                                                                 |
| OpenVSCode loads but extensions/marketplace 404        | Make sure the service is started with `--without-connection-token`. The proxy cannot supply the `?tkn=` query string the editor expects. |
| "A sidecar with that name already exists"              | Names are unique within the workspace. Either remove the existing entry or pick a different name.                                        |
| Service starts on a low port (`<1024`)                 | Not supported — ports must be in `1024–65535`. Configure the service to use a higher port.                                               |

## Reference: backend contract

| Endpoint                    | Notes                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sidecars`         | `{sidecars: [{id, name, port, url}]}`. `token` is **not** returned on list (it would be single-use).                            |
| `POST /api/sidecars`        | `{name, port}` → `{id, name, port, url, token}`. Idempotent for the same `(name, port)`.                                        |
| `DELETE /api/sidecars/{id}` | Removes the registration. The local service is unaffected.                                                                      |
| Proxy path                  | `GET/POST/... http://127.0.0.1:<backendPort>/sidecar/<id>/...` → `127.0.0.1:<port>/...`. First nav must include `?sct=<token>`. |

## See also

- [WebUI mode](./webui.md) — full remote access for the AionUi app itself.
- [Local HTTPS guide](./local-https.md) — when you need to embed a
  service that requires HTTPS.
