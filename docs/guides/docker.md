# Docker deployment

AionUi runs headlessly in Docker without Electron or a virtual display. The image contains the standalone `aionui-web` launcher, the browser UI, and the architecture-matched AionCore backend. One public HTTP port serves the UI, API, and WebSockets.

Two Compose files ship with the repository:

| File                                                     | Purpose                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`docker-compose.yml`](../../docker-compose.yml)         | **Release** deployment. Pulls `ghcr.io/iofficeai/aionui` from the upstream project (not a personal fork). |
| [`docker-compose.dev.yml`](../../docker-compose.dev.yml) | **Local** development. Builds the image from this repository's `Dockerfile`.                              |

Both are comfortable for one person by default and support separate local accounts, roles, and resource sharing when an administrator enables them.

## Three-command local team stack (from this repo)

```bash
docker compose -f docker-compose.dev.yml up --build --detach
bash scripts/verify-team-docker.sh
open http://127.0.0.1:25808
```

`verify-team-docker.sh` checks health, that content APIs require login (HTTP 401), that emergency local-control routes stay blocked, and that Core runs with `--identity-mode webui`. On a fresh volume it also prints the one-time admin credential file.

## Requirements

- Docker Engine with the Compose plugin
- A Linux AMD64 or ARM64 host (macOS Docker Desktop works for local testing)
- Internet access to pull the release image, or enough memory to build from source (at least 4 GB recommended for builds)

## Start from the published image (recommended)

From the repository root:

```bash
docker compose -f docker-compose.yml up --detach
docker compose -f docker-compose.yml ps
```

`docker-compose.yml` is Compose's default filename, so from the repository root `docker compose up --detach` is equivalent. Prefer the explicit `-f` form in scripts and docs so the release file is never confused with the dev file.

Open <http://127.0.0.1:25808>. A fresh data volume gets one administrator account. Its randomly generated, one-time credential is written inside the persistent data volume rather than printed to the logs:

```bash
docker compose -f docker-compose.yml exec aionui sh -c 'cat "$AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE"'
```

Sign in with that credential and choose a new password when prompted. The credential file is removed after the successful password change. Do not paste model API keys or a fixed administrator password into Compose files; configure providers after signing in.

Pin a release tag when you need a fixed version:

```bash
AIONUI_IMAGE_TAG=v2.1.53 docker compose -f docker-compose.yml up --detach
```

## Build and run from this source tree

Use the dev Compose file when you are testing local changes:

```bash
docker compose -f docker-compose.dev.yml up --build --detach
docker compose -f docker-compose.dev.yml ps
```

Read the one-time credential the same way, replacing the Compose file flag:

```bash
docker compose -f docker-compose.dev.yml exec aionui sh -c 'cat "$AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE"'
```

## Configuration

Compose accepts these substitutions through the shell or a local `.env` file:

| Variable                        | Default (release / dev)                     | Purpose                                                                                |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AIONUI_BIND_ADDRESS`           | `127.0.0.1`                                 | Host interface that publishes the WebUI port.                                          |
| `AIONUI_HOST_PORT`              | `25808`                                     | Host port mapped to container port `25808`.                                            |
| `AIONUI_IMAGE`                  | `ghcr.io/iofficeai/aionui` / `aionui:local` | Registry image (release) or local tag (dev).                                           |
| `AIONUI_IMAGE_TAG`              | `latest`                                    | Tag appended for the release image (`docker-compose.yml` only).                        |
| `AIONUI_PULL_POLICY`            | `always` / `build`                          | Compose image policy.                                                                  |
| `AIONUI_LOG_LEVEL`              | `info`                                      | Backend log level.                                                                     |
| `AIONUI_WORKSPACE_PATH`         | named volume                                | Absolute host path mounted as the initial administrator's `/workspace`.                |
| `AIONUI_INITIAL_ADMIN_USERNAME` | `admin`                                     | Username used only when the first administrator is created.                            |
| `AIONUI_HTTPS`                  | `false`                                     | Set `true` when the browser-facing origin uses HTTPS.                                  |
| `AIONUI_TRUST_PROXY`            | `false`                                     | Trust one reverse-proxy hop for client IP and public host; use only behind that proxy. |
| `AIONUI_UID`                    | `10001`                                     | UID assigned to the unprivileged image user at **dev build** time.                     |
| `AIONUI_GID`                    | `10001`                                     | GID assigned to the unprivileged image user at **dev build** time.                     |
| `NODE_VERSION`                  | `22.23.2-bookworm-slim`                     | Node builder image tag (dev build only).                                               |
| `BUN_VERSION`                   | `1.3.14`                                    | Bun version used during the image build (dev build only).                              |
| `TZ`                            | `UTC`                                       | Container timezone, for example `Europe/Berlin`.                                       |

Required runtime values are already set in Compose: the process binds inside the container, persistent state lives under `/data`, the initial administrator workspace is `/workspace`, browser auto-opening is disabled, and the service runs as an unprivileged user with a read-only root filesystem, all capabilities dropped, `no-new-privileges`, and a `tmpfs` `/tmp`.

Release Compose uses project name `aionui`; the dev file uses `aionui-dev`, so the two stacks do not share Docker volumes when both are used on one host.

## Files and persistence

Compose creates two named volumes:

- `aionui-data` at `/data` stores SQLite databases, authentication state, encrypted provider credentials, settings, conversations, logs, runtime-managed tools, and private per-user workspace roots.
- `aionui-workspace` at `/workspace` is the initial administrator's durable project workspace.

The backend derives every member's private managed root from the authenticated user ID. A member cannot supply another server path, traverse with `..`, follow a symlink into another account, or open another user's project/upload by guessing an ID. Ordinary content APIs stay owner-scoped even for administrators, unless the owner grants an explicit share.

Administrators are nevertheless trusted instance operators, not privacy peers. Their agents may use host-level shell, filesystem, extension, and connection capabilities under the container's service account; that operating-system access can reach mounted workspaces and `/data`. Grant the administrator role only to people who may administer the whole instance. Use the member role for mutually untrusted accounts.

The `/workspace` mount is an explicit project entitlement of the original bootstrap account, not a side effect of the account's current administrator role. Demoting that account does not silently transfer or revoke its files, and promoting another administrator does not register the workspace as that administrator's project. A trusted administrator can still reach container mounts through host-level tools. Move the data or remove the mount explicitly if ownership needs to change.

A container cannot see arbitrary host files. To give the initial administrator an existing host repository, use an absolute bind path:

```bash
AIONUI_WORKSPACE_PATH=/absolute/path/to/workspace \
  docker compose -f docker-compose.dev.yml up --build --detach
```

On Linux, match the image UID/GID to the bind-mounted directory owner so files keep useful host ownership and Git does not reject the repository as dubious:

```dotenv
AIONUI_UID=1000
AIONUI_GID=1000
AIONUI_WORKSPACE_PATH=/absolute/path/to/workspace
```

Then rebuild with `docker compose -f docker-compose.dev.yml up --build --detach`. The selected host directory must be readable and writable by those numeric IDs.

For a consistent backup, stop the service before copying `/data`; do not copy a live SQLite database:

```bash
docker compose -f docker-compose.yml stop aionui
docker compose -f docker-compose.yml cp aionui:/data ./aionui-data-backup
docker compose -f docker-compose.yml start aionui
```

## Team hosting (quick path)

Recommended path for a small team on one server:

1. Prefer the **dev** Compose file until a multi-user image is published upstream:

   ```bash
   docker compose -f docker-compose.dev.yml up --build --detach
   ```

   Or pull when `ghcr.io/iofficeai/aionui` includes multi-user:

   ```bash
   docker compose -f docker-compose.yml up --detach
   ```

2. Read the one-time admin credential from the data volume (not the container logs):

   ```bash
   docker compose -f docker-compose.dev.yml exec aionui sh -c 'cat "$AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE"'
   ```

3. Open the WebUI, sign in, and replace the temporary password immediately.

4. In the browser open **Settings → Account → Users** to create member accounts. Each new member must change their temporary password before they can use the product.

5. On a trusted LAN, publish the port beyond loopback only when you accept the risk of plain HTTP, or put HTTPS in front:

   ```bash
   AIONUI_BIND_ADDRESS=0.0.0.0 AIONUI_HOST_PORT=25808 \
     docker compose -f docker-compose.dev.yml up --build --detach
   ```

6. For Internet exposure keep bind on `127.0.0.1`, terminate TLS at a reverse proxy, and set `AIONUI_HTTPS=true` plus `AIONUI_TRUST_PROXY=true`.

Content stays private by default. Users share individual conversations, projects, or provider connections under **Settings → Account → Collaboration** (or the share action on a conversation/project). Site admins manage identities only; they do not automatically see other users’ private data.

## Multi-user and collaboration

After signing in as an administrator, open **Settings → Account → Users**. An administrator can:

- create an administrator or member;
- copy the generated temporary password once;
- rename, disable, or re-enable another account;
- reset another account's password and revoke its sessions;
- inspect the identity administration audit log.

Every newly created user must replace the temporary password before accessing application data. The server enforces roles and account status from the live database, not from values trusted from the browser. It also refuses concurrent changes that would leave the instance without an active administrator.

Resources stay **private by default**. Owners can grant explicit per-resource shares (`view` or `edit`) for conversations, projects, and provider connections. Recipients manage what was shared with them under **Settings → Account → Collaboration**. Site administrators still cannot open another user's private content without a share grant; admin privileges cover identity and instance operations only.

Member-built-in agents remain conversationally constrained for host-level tools as described in the multi-user foundation. Shared content follows the grant permission, not the site role.

Run only one AionUi container per data volume. SQLite and the runtime state are single-writer; multiple replicas must not share `/data`.

## Network access

The safe default publishes only on host loopback. To make AionUi reachable on a trusted LAN:

```bash
AIONUI_BIND_ADDRESS=0.0.0.0 docker compose -f docker-compose.yml up --detach
```

This exposes plain HTTP to every reachable host interface. The container always runs AionCore in **webui** identity mode (session login required). Content APIs such as `/api/conversations` must return **401** without a session; if they return **200** unauthenticated, the image is misbuilt and must not be bound to a LAN. Never use a build that starts Core with `--local` for team hosting.

For Internet access, keep AionUi behind an HTTPS reverse proxy, preserve WebSocket upgrades for `/ws` and `/api/stt/stream`, and preserve the public `Host` header or set `X-Forwarded-Host`. Set both flags only when the proxy is the exclusive path to the service:

```dotenv
AIONUI_BIND_ADDRESS=127.0.0.1
AIONUI_HTTPS=true
AIONUI_TRUST_PROXY=true
```

The web host removes spoofed forwarding headers and, when proxy trust is enabled, accepts exactly one trusted proxy hop. Login and API rate limits therefore remain per client instead of sharing one container-wide bucket. It rejects cross-site browser mutations and WebSocket upgrades before they reach AionCore. Local-only control endpoints under `/api/webui` and `/api/auth/internal` are never exposed through the public web host.

## Password recovery

Normal users change their own password in the browser. Administrators reset other users from **Settings → Account → Users**.

The host-side `resetpass` command is emergency recovery for the bootstrap administrator. Stop the service first so two backend processes never open the same SQLite data directory:

```bash
docker compose -f docker-compose.yml stop aionui
docker compose -f docker-compose.yml run --rm --no-deps aionui resetpass --data-dir /data
docker compose -f docker-compose.yml start aionui
```

Recovery invalidates that account's existing sessions. It does not expose a password-reset endpoint publicly.

## GHCR and forks

`docker-compose.yml` pulls from **`ghcr.io/iofficeai/aionui`** (upstream `iOfficeAI/AionUi`). It does not use a personal fork package.

The release workflow builds and pushes multi-architecture images to GitHub Container Registry on `dev` and release tags for whichever repository runs the workflow (`ghcr.io/<owner>/aionui`). GitHub makes a newly published container package private by default; the repository owner must set package visibility to public before anonymous deployments can pull it.

If you publish from a fork and want that image instead:

```bash
AIONUI_IMAGE=ghcr.io/your-user/aionui AIONUI_IMAGE_TAG=latest \
  docker compose -f docker-compose.yml up --detach
```

Local source builds never depend on registry visibility:

```bash
docker compose -f docker-compose.dev.yml up --build --detach
```

## Docker-aware platforms

Platforms that detect a root `Dockerfile` can build AionUi directly. Configure:

- container port `25808`;
- persistent storage at `/data` and, for the initial administrator workspace, `/workspace`;
- health check `GET /api/auth/status`;
- one replica per data volume;
- HTTPS/proxy variables consistent with the public URL.

The built-in agent is included. Optional external CLIs installed on the host, such as Claude Code or Codex, are not copied into the container automatically; install and configure them explicitly if they are required.
