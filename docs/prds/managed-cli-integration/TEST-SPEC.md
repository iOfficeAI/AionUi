# Managed CLI Integration — TEST-SPEC

## Dev runtime smoke

1. Fresh `bun run dev` with `dev` branch
2. Confirm log chain:
   - `[POUNDING] reconcileManagedRuntimeState called`
   - `[POUNDING] findManagedProvider` → `found: true, providerModels: 9`
   - `[POUNDING] about to sync` → prefs for all 4 targets
   - `[POUNDING] Managed sync OK: claude, hermes, opencode, openclaw`
3. Confirm config files exist:
   - `~/Library/Application Support/POUNDING-Dev/pounding/managed-opencode/opencode.json`
   - `~/.openclaw/openclaw.json`
4. Confirm Claude ACP agent receives:
   - `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY`
   - No `ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_*_MODEL`

## Packaged runtime smoke

1. `bun run build && cd packages/desktop && bun run build:mac`
2. `node scripts/packaged-launch.mjs`
3. Confirm `app.isPackaged=true` path + `~/.pounding`
4. Confirm packaged fixture resolves the actual `POUNDING.app` executable

## Failure conditions (frontend scope)

| Condition                                           | Status                         |
| --------------------------------------------------- | ------------------------------ |
| Sync never logs                                     | ✅ Fixed                       |
| Runtime throws before sync                          | ✅ Fixed                       |
| Any CLI config file missing after fresh start       | ✅ Fixed                       |
| OpenCode config falls back to `~/.config/opencode/` | ✅ Fixed (managed-only)        |
| Claude agent gets model env var override            | ✅ Fixed (removed)             |
| Hermes venv reinstall fails on existing dir         | ✅ Fixed (`--clear`)           |
| Brand asset 404                                     | ✅ Fixed (rebuild backend)     |
| Packaged runtime fails to launch                    | ✅ Fixed (Info.plist resolver) |
