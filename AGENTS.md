# AionUi - Project Guide

All contributors (human and AI) must follow [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. ([Chinese version](CONTRIBUTING.zh.md))

## Code Conventions

### File & Directory Structure

- **Directory size limit**: A single directory must not exceed **10** direct children (files + subdirectories). Split by responsibility when approaching this limit.

See [docs/contributing/file-structure.md](docs/contributing/file-structure.md) for complete rules. Agents must also follow the `architecture` skill (`.claude/skills/architecture/SKILL.md`) when creating files or modules.

### Naming

- **Components**: PascalCase (`Button.tsx`, `Modal.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Hooks**: camelCase with `use` prefix (`useTheme.ts`)
- **Constants files**: camelCase (`constants.ts`) — values inside use UPPER_SNAKE_CASE
- **Type files**: camelCase (`types.ts`)
- **Style files**: kebab-case or `ComponentName.module.css`
- **Unused params**: prefix with `_`

### UI Library & Icons

- **Components**: `@arco-design/web-react` — no raw interactive HTML (`<button>`, `<input>`, `<select>`, etc.)
- **Icons**: `@icon-park/react`

### CSS

- Prefer **UnoCSS utility classes**; complex styles use **CSS Modules** (`ComponentName.module.css`)
- Colors must use **semantic tokens** from `uno.config.ts` or CSS variables — no hardcoded values
- Arco theme overrides go in `packages/desktop/src/renderer/styles/arco-override.css`; component-scoped Arco overrides use CSS Module with `:global()`
- Global styles only in `packages/desktop/src/renderer/styles/`

Formatting rules (Oxfmt, Prettier-compatible):

- Single-element arrays that fit on one line → inline: `[{ id: 'a', value: 'b' }]`
- Trailing commas required in multi-line arrays/objects
- Single quotes for strings

### TypeScript

- Strict mode enabled — no `any`, no implicit returns
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`
- Prefer `type` over `interface` (per Oxlint config)
- English for code comments; JSDoc for public functions

### Internationalization (i18n)

All user-facing text must use i18n keys — never hardcode strings. Languages and modules are defined in `packages/desktop/src/common/config/i18n-config.json`.

See the `i18n` skill (`.claude/skills/i18n/SKILL.md`) for complete workflow, key naming, and validation steps.

## Architecture

Two process types — never mix their APIs:

| Process  | Path                             | Restriction     |
| -------- | -------------------------------- | --------------- |
| Main     | `packages/desktop/src/process/`  | No DOM APIs     |
| Renderer | `packages/desktop/src/renderer/` | No Node.js APIs |

Cross-process communication must go through the IPC bridge (`packages/desktop/src/preload/`).
See [docs/architecture/overview.md](docs/architecture/overview.md) for details.

## Testing

**Framework**: Vitest 4 (`vitest.config.ts`). Coverage target ≥ 80%.

```bash
bun run test              # run all tests
bun run test:coverage     # with coverage report
```

See the `testing` skill (`.claude/skills/testing/SKILL.md`) for complete workflow and quality rules.

## Workflow

### During Development

Auto-fix as you edit:

```bash
bun run lint:fix       # auto-fix lint issues (oxlint)
bun run format         # auto-format all files (oxfmt)
bunx tsc --noEmit      # verify no type errors
```

If your changes touch `packages/desktop/src/renderer/`, `locales/`, or `packages/desktop/src/common/config/i18n`, also run:

```bash
bun run i18n:types
node scripts/check-i18n.js
```

### Before Pushing

Always use `just push` instead of `git push`:

```bash
just push                          # lint → format-check → typecheck → test → git push
just push -u origin feat/branch    # same checks, with extra git push args
```

Any step that fails aborts the push. Fix the issue, commit, then retry.

> **Note for AI agents**: `just push` uses `--quiet` for lint — only errors cause failure. The project has many pre-existing lint _warnings_ which do NOT indicate failure. Judge success by exit code, not by output volume.

### Before PR (optional stricter check)

`prek` replicates the **exact CI pipeline** (includes end-of-file, trailing whitespace checks on all file types):

```bash
# One-time setup
npm install -g @j178/prek

# Run
prek run --from-ref origin/main --to-ref HEAD
```

> `prek` is read-only — it reports but does not fix. If it reports issues, run the auto-fix commands above, commit, then re-run.

The `oss-pr` skill runs this automatically during PR creation.

### Commit & PR Format

Commit format: `<type>(<scope>): <subject>` in English. Types: feat, fix, refactor, chore, docs, test, style, perf.

**NEVER add AI signatures** (Co-Authored-By, Generated with, etc.).

For pull request creation, see the `oss-pr` skill (`.claude/skills/oss-pr/SKILL.md`).

## Branch Strategy (POUNDING Fork)

### Three-Tier Repository Structure

```
iOfficeAI/AionUi (上游)
    ↓ sync-upstream (此仓库的 workflow)
halojerry/AionUi (开发仓库 — 此仓库，POUNDING 保护层)
    ↓ sync-downstream (pounding 发布仓库的 workflow)
halojerry/pounding (发布仓库 — 最终产物，桌面应用发布)
```

**`halojerry/pounding` 是最终发布仓库**，只接收 `halojerry/AionUi` 的稳定代码。
**永远不要**从 `iOfficeAI/AionUi` 直接同步到 `halojerry/pounding`。

### Sync Downstream (Dev → Release)

代码从开发仓库同步到发布仓库由 `halojerry/pounding` 的 `sync-downstream.yml` 负责。
该 workflow 从 `halojerry/AionUi`（此仓库）拉取代码，经过 branding 检查后创建 PR。

**触发方式**: 在 `halojerry/pounding` 仓库手动 `workflow_dispatch` → `sync-downstream.yml`。

**流程**:

1. 验证目标分支（阻止直接同步到 main/dev）
2. 运行 `check-branding.sh` 作为预检门禁
3. Fast-forward 合并到 `feature/downstream-sync` 分支
4. 再次运行 branding 检查
5. 创建 PR 供人工审核

**发布仓库永远不直接从 iOfficeAI 同步** — 所有上游变更必须先经过此开发仓库处理。

**main is the stable POUNDING release branch. NEVER merge upstream directly into main.**

```
upstream (iOfficeAI/AionUi)
    ↓ workflow_dispatch: sync-upstream
feature/upstream-sync
    ↓ manual PR (resolve conflicts, preserve POUNDING branding)
dev (integration & verification)
    ↓
release/pounding-v*.*.x (final verification)
    ↓
main (stable — triggers release builds via tag)
```

**Rules for all agents:**

- Upstream syncs go to `feature/upstream-sync` — the `sync-upstream.yml` workflow is locked to feature branches, it will refuse `main` or `dev` as targets.
- After upstream sync, manually diff and restore all POUNDING branding (see checklist below).
- POUNDING-specific features are developed on `feature/*` branches, PR'd to `dev`.
- Tag format: `v<version>-Pounding` (e.g. `v2.1.5-Pounding`).
- **NEVER run `git merge upstream/main` into main directly.**

### Upstream Sync Process (detailed)

**Trigger**: Manual `workflow_dispatch` via GitHub Actions → `sync-upstream.yml`.

**What the workflow does automatically**:

1. Validates target branch is NOT `main` or `dev` (refuses direct sync)
2. Fetches from `iOfficeAI/AionUi` upstream
3. Fast-forward merges (`--ff-only`) into `feature/upstream-sync` (or custom target branch)
4. If conflicts: job fails, manual resolution required
5. On success: creates a PR from sync branch → `dev` with upstream commit summary

**Manual steps after sync (MANDATORY)**:

1. Check the auto-created PR diff — look for POUNDING branding overwrites
2. Run `bash scripts/check-branding.sh` locally
3. Restore ALL items in the Branding Checklist below that were overwritten
4. Pay special attention to: `electron-builder.yml`, `locales/*/login.json`, `locales/*/common.json`
5. Rebuild and smoke-test: `bun run dev`
6. Merge PR to `dev` only after all checks pass

**Known pitfalls**:

- `electron-builder.yml` `productName`/`appId` often gets overwritten to `AionUi`/`com.aionui.app`
- Locale files in `pt-BR/`, `tr-TR/` etc. are the most likely to revert to `"brand": "AionUi"`
- New upstream files may reference `iOfficeAI/AionUi` — grep and replace
- The merge may introduce new dependencies or config formats — test `bun run dev` before merging

**Before merging to main (release)**:

- Version bump via `bump-version` skill
- Tag: `v<version>-Pounding`
- This triggers `build-and-release.yml` → COS upload + GitHub Release

## POUNDING Branding Checklist

When merging ANY upstream changes, verify these are not overwritten:

| Category        | Key Files                                               | What to Check                                                                    |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| App identity    | `electron-builder.yml`                                  | `productName: POUNDING`, `appId: com.pounding.app`, `detectUpdateChannel: false` |
| App icons       | `resources/app.{ico,icns,png}`                          | Red square POUNDING icon (23KB/173KB/47KB)                                       |
| Login page      | `locales/*/login.json`                                  | `"brand": "POUNDING"`                                                            |
| Tray menu       | `locales/*/common.json`                                 | `"Show POUNDING"`, `"About POUNDING"`, `backendStartup.*` without "AionUi"       |
| UI logo         | `PoundingInteractiveLogo.tsx`                           | Must exist and import POUNDING heart/eyes/nose assets                            |
| NSIS installer  | `resources/windows-installer-*.nsh`                     | `"POUNDING installer"`, `halojerry/AionUi/releases`                              |
| UI links        | `AboutModalContent.tsx`, `QuickActionButtons.tsx`, etc. | All `iOfficeAI/AionUi` → `halojerry/AionUi`                                      |
| COS auto-update | `electron-builder.yml`, `build-and-release.yml`         | `pounding/releases/latest` paths                                                 |
| install-web.sh  | `scripts/install-web.sh`                                | MIRROR URL includes `/pounding/` prefix                                          |
| Dealer kit      | `scripts/pack-usb-zip.sh`                               | `dealer-kit.zip` with PORTABLE + dealer-config.json                              |
| Portable mode   | `configureChromium.ts`                                  | PORTABLE detection + storage choice dialog                                       |
| Sentry          | `sentry.ts`                                             | `brand: 'POUNDING'`, project `pounding`                                          |
| Build scripts   | `afterPack.js`, `build-with-builder.js`                 | No `AionUi` fallback, no `AionUi.exe` hardcoding                                 |
| CLI mirrors     | `managedCliInstallerBridge.ts`                          | Chinese mirrors (npmmirror + tsinghua) as primary                                |

## POUNDING Custom Features

Features unique to the POUNDING fork that must be preserved:

| Feature              | Key Files                                                                 |
| -------------------- | ------------------------------------------------------------------------- |
| USB portable/dealer  | `configureChromium.ts`, `dealer-kit.zip`, `useDealerConfig.ts`            |
| COS auto-update      | `electron-builder.yml` publish config, `build-and-release.yml` COS mirror |
| Chinese CLI mirrors  | `managedCliInstallerBridge.ts` (npmmirror + tsinghua PyPI)                |
| CC-Switch model sync | `NewApiDesktopAccountService.ts`, `managedRuntimeCli.ts`                  |
| install-web.sh       | `/pounding/` COS prefix, `_VERSION_WAS_SET` fix                           |
| Feedback → Sentry    | `sentry.ts`, `index.ts` Sentry.init with POUNDING tags                    |

## Skills Index

| Skill             | Purpose                                                                               | Triggers                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **architecture**  | File & directory structure conventions for all process types                          | Creating files, adding modules, architectural decisions                                    |
| **i18n**          | Internationalization workflow and standards                                           | Adding user-facing text, modifying `locales/` or `packages/desktop/src/common/config/i18n` |
| **testing**       | Testing workflow and quality standards                                                | Writing tests, adding features, before claiming completion                                 |
| **oss-pr**        | Full commit + PR workflow: branch management, quality checks, issue linking, PR       | Creating pull requests, after committing, `/oss-pr`                                        |
| **bump-version**  | Version bump workflow: update package.json, checks, branch, PR, tag release           | Bumping version, `/bump-version`                                                           |
| **pr-review**     | Local PR code review with full project context, no truncation limits                  | Reviewing a PR, user says "review PR", `/pr-review`                                        |
| **pr-fix**        | Fix all issues from a pr-review report, create a follow-up PR, and verify each fix    | After pr-review, user says "fix all issues", `/pr-fix`                                     |
| **pr-verify**     | Verify and merge bot:ready-to-merge PRs with impact analysis and test supplementation | Verifying PRs, merging ready PRs, `/pr-verify`                                             |
| **pr-ship**       | End-to-end PR lifecycle: create, CI wait, review, fix, merge in one invocation        | `/pr-ship`, after development is done, resume shepherding a PR                             |
| **pr-automation** | PR automation orchestrator: poll PRs, review, fix, and merge via label state machine  | Invoked by daemon script (`pr-automation.sh`), `/pr-automation`                            |

> Skills are located in `.claude/skills/` and contain project conventions that apply to **all** agents and contributors.

## Troubleshooting & Lessons Learned

Lessons from POUNDING branding/fix sessions. When debugging similar symptoms, check these first.

### Quick Index

| Category              | Entries                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 开箱即用 (out-of-box) | [[Codex: proxy not auto-started]], [[Windows: GUI app PATH is incomplete]], [[Out-of-box runtime preflight check]] |
| Codex CLI             | [[Codex: UNKNOWN_UPSTREAM_ERROR]], [[Codex: "Model metadata not found"]], [[Codex: proxy not auto-started]]        |
| OpenClaw              | [[OpenClaw: NOT_PAIRED]]                                                                                           |
| MCP                   | [[Chrome DevTools MCP: handshake fails]]                                                                           |
| Sentry                | [[Sentry: user feedback not arriving]], [[Sentry: wrong DSN in production builds]]                                 |
| UI/UX                 | [[CLI model: switch reverts to default]], [[Dealer kit: invitation link not triggered]]                            |
| Branding              | [[pt-BR locale]], [[Branding drift]]                                                                               |

### Sentry: user feedback not arriving

**Symptom**: Users submit feedback via Settings → Report Issue, nothing appears in Sentry.

**Root cause**: The `feedback:submit` IPC handler in `feedbackBridge.ts` was fully implemented but never exposed in the preload bridge (`preload/main.ts`). The fallback path (`FeedbackReportModal.tsx` → `@sentry/electron/renderer` dynamic import → IPC transport) silently swallowed all errors.

**Fix**: Added `submitFeedback` to `preload/main.ts` contextBridge and updated `FeedbackReportModal.tsx` to call it via `electronAPI.submitFeedback()`.

**Key files**: `preload/main.ts`, `FeedbackReportModal.tsx`, `feedbackBridge.ts`, `electron.ts` (type)

### Sentry: wrong DSN in production builds

**Symptom**: Production builds always use the hardcoded fallback DSN, ignoring `SENTRY_DSN` from GitHub secrets/vars.

**Root cause**: `electron.vite.config.ts` `define:` blocks did NOT inject `process.env.SENTRY_DSN`. The DSN was only available as a build-time env var; Vite treated `process.env.SENTRY_DSN` as a runtime expression, which is always `undefined` on end-user machines.

**Fix**: Added `process.env.SENTRY_DSN`, `POUNDING_SENTRY_DSN`, `POUNDING_SENTRY_ENVIRONMENT`, `POUNDING_SENTRY_RELEASE` to both main and renderer `define:` blocks.

**Key files**: `electron.vite.config.ts`, `_build-reusable.yml`, `sentry.ts`

### Chrome DevTools MCP: handshake fails

**Symptom**: "AionUI can't complete MCP handshake" for chrome-devtools MCP server.

**Root cause**: The default MCP server config (`runBackendMigrations.ts` `buildDefaultMcpServers()`) lacked `--browser-url`. chrome-devtools-mcp defaults to port 9222, but POUNDING CDP runs on port 9230.

**Fix**: (a) Added `--browser-url=http://127.0.0.1:9230` to default args; (b) After CDP is ready, `index.ts` updates the MCP server config in the backend DB with the actual CDP port (handles port conflicts).

**Key files**: `runBackendMigrations.ts`, `index.ts`, `configureChromium.ts`

### CLI model: switch reverts to default

**Symptom**: User switches model in the conversation header model selector, but after refresh it shows the default model again.

**Root cause**: Storage key disconnect. `useAcpModelInfo.ts` reads current model from `newApi.desktop.cliModelPrefs[cliTarget]`, but `selectModel` saves to `acp.config[backend].preferredModelId`. `cliModelPrefs` was only written from `AionrsSettings.tsx` (settings page), never from the in-conversation selector.

**Fix**: In `selectModel`, after successful switch, also update `newApi.desktop.cliModelPrefs[cliTarget]` and call `reconcileModel` IPC to sync CLI config files.

**Key files**: `useAcpModelInfo.ts`, `AionrsSettings.tsx`, `agentSelectionUtils.ts`

### Dealer kit: invitation link not triggered

**Symptom**: Dealer referral code from `dealer-config.json` never reaches the registration URL.

**Root cause**: `useDealerConfig` hook was defined but had zero consumers. The registration button in `SiderFooter.tsx` used a hardcoded `https://api.mxou.cn/register` without `?aff=` parameter. Also the URL changed from `/register?ref=` to `/sign-up?aff=`.

**Fix**: Updated field name `ref`→`aff` across all files (`ipcBridge.ts`, `useDealerConfig.ts`, `applicationBridge.ts`, `pack-usb-zip.sh`); connected `useDealerConfig.openRegisterUrl()` to `SiderFooter.tsx` registration button.

**Key files**: `SiderFooter.tsx`, `useDealerConfig.ts`, `applicationBridge.ts`, `pack-usb-zip.sh`

### pt-BR locale: AionUi branding residue

**Symptom**: pt-BR users see "AionUi" instead of "POUNDING" in login page, tray menu, and backend startup errors.

**Root cause**: 5 strings in `locales/pt-BR/login.json` and `locales/pt-BR/common.json` were never updated from upstream AionUi branding.

**Fix**: Replaced all "AionUi"→"POUNDING" and "AionCore"→"poundingcore" in pt-BR locale files.

**Key files**: `locales/pt-BR/login.json`, `locales/pt-BR/common.json`

### Branding drift: no automated checks

**Symptom**: Branding regressions (pt-BR, iOfficeAI comments, Sentry config) go undetected after upstream syncs.

**Fix**: Created `scripts/check-branding.sh` (37 checks for AionUi, 11 for AionCore) and added `branding-check` job to CI (`pr-checks.yml` for AionUi, `ci.yml` for AionCore).

**Key files**: `scripts/check-branding.sh`, `.github/workflows/pr-checks.yml`

### Codex: UNKNOWN_UPSTREAM_ERROR — POUNDING API doesn't support /v1/responses for deepseek

**Symptom**: Codex conversations fail with `UNKNOWN_UPSTREAM_ERROR`. Codex stderr shows `not implemented (request id: ...) convert_request_failed` from `POST /v1/responses`.

**Root cause**: Codex CLI requires `wire_api = "responses"` (rejects `chat_completions`). The POUNDING API (`api.mxou.cn`) supports `/v1/responses` only for some models (e.g. doubao), NOT for `deepseek-v4-pro`. The Chat Completions endpoint (`/v1/chat/completions`) works for all models.

**Fix (local proxy)**: A Node.js proxy (`codexApiProxy.mjs`) translates:

- Requests: Responses API → Chat Completions API (mapping `input`→`messages`, `developer` role→`system`, `input_text`→`text`)
- Responses: Chat Completions JSON → Responses API SSE streaming events
- Metadata: Enriches `/v1/models` with `context_window`, `max_output_tokens`, `pricing`
- Ports: Auto-selects available port (increment on EADDRINUSE), writes to `~/.pounding/codex-proxy-port`

The proxy is **auto-started by `CodexProxyManager`** at backend-ready time. `writeCodexConfigForProviderSync()` reads the actual port from the well-known file.

**Key files**: `src/process/codexApiProxy.mjs` (proxy script), `src/process/services/CodexProxyManager.ts` (lifecycle), `NewApiDesktopAccountService.ts:resolveCodexBaseUrl()`

**Reference**: pumpkinai-config (npm) does NOT need a proxy — their API supports `/v1/responses` natively. CC-Switch uses a similar local proxy approach.

**See also**: [[Codex: proxy not auto-started]] (the manager that launches this proxy)

### Codex: "Model metadata not found" warning

**Symptom**: Codex shows `Model metadata for deepseek-v4-pro not found. Defaulting to fallback metadata; this can degrade performance and cause issues.` every time.

**Root cause**: POUNDING API `/v1/models` only returns `{id, object, created, owned_by, supported_endpoint_types}` — missing `context_window`, `max_output_tokens`, etc. Codex probes context length and defaults to 256K but warns. Additionally, stale `models_cache.json` (from old API calls) could override the enriched metadata.

**Fix (two layers)**:

1. **`pounding-models.json`**: Now writes model objects with `context_window` + `max_output_tokens` (was bare strings). Follows CC-Switch's `cc-switch-model-catalog.json` pattern. Also auto-deletes `models_cache.json` on every config sync to force a fresh metadata read.
2. **`codexApiProxy.mjs`**: Enriches `/v1/models` API response with metadata for all known models (METADATA constant).

**Key files**: `NewApiDesktopAccountService.ts:MODEL_META`, `src/process/codexApiProxy.mjs` (METADATA constant)

**See also**: [[Codex: UNKNOWN_UPSTREAM_ERROR]], [[Codex: proxy not auto-started]]

### OpenClaw: NOT_PAIRED scope-upgrade deadlock (AionCore fix, AionUi awareness)

**Symptom**: OpenClaw conversations permanently fail with `NOT_PAIRED: device identity changed and must be re-approved`.

**Root cause (AionCore)**: Backend and CLI shared device identity → scope upgrade → deadlock. Fixed in AionCore by using separate identity path.

**AionUi relevance**: No TypeScript changes needed for this fix, but the `NewApiDesktopAccountService.ts` `writeOpenClawConfigForProviderSync()` writes the gateway config that the backend reads. When debugging OpenClaw issues, check both `~/.openclaw/openclaw.json` (CLI config) and `~/.pounding/openclaw/identity/device.json` (backend identity).

**Diagnostic**: `openclaw devices list --json --url ws://127.0.0.1:18789 --token "<token>"` shows pending/paired devices and their scopes. A "scope-upgrade" kind with different `approvedScopes` vs `requestedScopes` indicates this issue.

**See also**: Codex issues below all share the same config-sync infrastructure (`writeXxxConfigForProviderSync` → `syncManagedProviderRuntimeConfigs`).

### Codex: proxy not auto-started (开箱即用 gap #1)

**Symptom**: User installs POUNDING, logs in, creates a Codex conversation — nothing happens. Codex config points to `http://127.0.0.1:18792/v1` but proxy is not running.

**Root cause**: `codex-api-proxy.mjs` was a standalone script in the project root. The Electron main process never started it. The developer had to manually run `node codex-api-proxy.mjs` in a terminal. Additionally, the proxy was not packaged in production builds (not in asar or extraResources).

**Fix**: Created `CodexProxyManager.ts` that:

- `fork()`s `codexApiProxy.mjs` as a child process when the backend is ready
- Auto-restarts the proxy on crash (up to 3 times within 30 seconds)
- Writes the actual port to `~/.pounding/codex-proxy-port` (handles port conflicts)
- Stops cleanly on app quit
- Restarts on login (to pick up new API key from `~/.pounding/config.json`)

The proxy script was also:

- Moved from project root → `src/process/codexApiProxy.mjs`
- Modified to auto-select available ports (`tryListen` with increment on EADDRINUSE)
- Added to `electron-builder.yml` asarUnpack list (line ~218, next to MCP scripts)
- Added to `electron.vite.config.ts` viteStaticCopy targets (environment: 'ssr')

**Key files**: `src/process/services/CodexProxyManager.ts`, `src/process/codexApiProxy.mjs`, `src/index.ts`, `electron-builder.yml`, `electron.vite.config.ts`

**See also**: [[Codex: UNKNOWN_UPSTREAM_ERROR]] (why the proxy exists), [[Codex: "Model metadata not found"]] (metadata the proxy provides), [[Windows: GUI app PATH is incomplete]] (related startup gap), [[Out-of-box runtime preflight check]] (related startup gap)

### Windows: GUI app PATH is incomplete (开箱即用 gap #3)

**Symptom**: On Windows, the POUNDING app can't find `npm`, `bun`, or `node` even though they work in Terminal. CLI installation and MCP servers fail silently.

**Root cause**: `fixPath()` in `index.ts` was gated to `platform === 'darwin' || platform === 'linux'`. On Windows, GUI apps launched from Start Menu don't inherit shell PATH modifications (nvm-windows, Volta, fnm, etc.).

**Fix**: Added Windows PATH supplementation that prepends common runtime paths:

- `%APPDATA%/npm` (npm global prefix)
- `NVM_HOME` or `NVM_SYMLINK` (nvm-windows)
- `%LOCALAPPDATA%/Volta` (Volta)
- `~/.bun/bin` (bun)
- fnm `node-versions/<default>/installation` (Fast Node Manager)

Runs immediately at import time, before any `which`/`where` checks.

**Key files**: `src/index.ts` (Windows PATH block, ~20 lines after fixPath)

**See also**: [[Out-of-box runtime preflight check]] (verifies runtimes are found), [[Codex: proxy not auto-started]] (another startup gap)

### Out-of-box runtime preflight check (开箱即用 gap #4)

**Symptom**: No clear error when no JavaScript runtime is available. CLI installation silently fails, MCP servers can't start. User sees "CLI not found" errors in the UI without understanding why.

**Fix**: Added preflight check in `handleAppReady()` that tests `node`, `npm`, `bun` availability via `which`/`where`. Logs clear warnings:

- All missing: `⚠️  No JavaScript runtime (node/npm/bun) found in PATH. Please install Node.js (https://nodejs.org) or Bun (https://bun.sh).`
- Some missing: `Runtime check: found runtimes except: npm, bun`

Does NOT block startup — user can still use the app for non-CLI features. Uses `execFile` with 3s timeout per command.

**Key files**: `src/index.ts` (preflight block in `handleAppReady`, after doctor check)

**See also**: [[Windows: GUI app PATH is incomplete]] (PATH fix that makes runtimes discoverable), [[Codex: proxy not auto-started]] (another startup gap)
