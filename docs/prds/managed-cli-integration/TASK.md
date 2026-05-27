# Managed CLI Integration — TASK

## Frontend scope (AionUi) — Done

- [x] Kill stale app instances before test
- [x] Add entry/exit logging to `reconcileManagedRuntimeState`
- [x] Rewrite `syncManagedProviderRuntimeConfigs` with fallback + file verification
- [x] Fix `prefs` → `nextPrefs` reference error
- [x] Add post-write config file verification per CLI
- [x] Fix Claude: remove `ANTHROPIC_*_MODEL` env var override (agent exit 1)
- [x] Fix Claude: settings.json `model` back to `'default'`
- [x] Fix Hermes: `uv venv --clear` on existing venv
- [x] Fix Hermes: cross-platform shim (`.cmd` on Windows, `Scripts/` venv path)
- [x] Fix OpenCode: managed-only config path (no `~/.config/opencode/` fallback)
- [x] Fix OpenCode: flexible binary search under `BUN_GLOBAL_NODE_MODULES_DIR`
- [x] Fix OpenCode: pre-create managed config dir + touch empty config
- [x] Fix OpenCode: remove dead `canWriteToPath()` function
- [x] Fix macOS app resolver: `Info.plist` `CFBundleExecutable` preferred
- [x] Fix Windows: `removeFromKnownPaths()` covers `%APPDATA%\npm`, scoop/choco
- [x] Fix update feed: `electron-builder.yml` repo → `halojerry/AionUi`
- [x] Fix brand asset: add `pounding-heart-solid.png` to AionCore assets
- [x] Merge `dev` → `main` → `release/pounding-v2.0.x` (all synced)

## Frontend scope — Needs your retest

- [ ] Rebuild AionCore (`cargo build`) for brand icon
- [ ] Restart `bun run dev`, confirm Claude agent initialize without exit 1
- [ ] Confirm `[POUNDING] Managed sync OK: ...` with all 4 CLIs
- [ ] Click a conversation and verify Claude replies

## Backend scope (AionCore) — Not frontend

- [ ] Claude `session/new` crash with `guide_mcp` injection
- [ ] Hermes empty response
- [ ] OpenCode zero-text response
- [ ] OpenClaw duplicate text

## QA

- [ ] Final manual smoke: login / register / Feishu / Sentry / brand visual
