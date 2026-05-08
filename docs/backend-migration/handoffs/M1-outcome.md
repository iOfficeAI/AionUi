# M1 Outcome

## Scope

Completed executor-M1 monorepo skeleton cleanup only.

- Kept desktop runtime under `packages/desktop/`
- Fixed remaining M1 path/config regressions found in scripts, tests, and build config
- Did not introduce M2+ web-host / backend-launcher design

## What Was Finished

- Fixed residual hardcoded root paths in tests and docs that still referenced:
  - `src/renderer/...`
  - root `electron-builder.yml`
- Updated `packages/desktop/electron.vite.config.ts` renderer config so moved HTML entrypoints build correctly from `packages/desktop/src/renderer/`
- Updated `scripts/build-with-builder.js` to call `electron-vite` with the moved config path
- Updated `packages/desktop/electron-builder.yml` path bases so builder resolves app/resources/scripts from repo root when invoked by root scripts
- Added missing direct dependencies required by the moved desktop workspace build/typecheck path

## Validation

Passed:

- `bunx tsc --noEmit`
- `bun run package`
- `bun run dev`
  - reached renderer dev server startup
  - launched Electron app
- `bun run webui`
  - reached WebUI startup
  - served WebUI with Vite proxy fallback in dev mode
- `bunx vitest run tests/unit/webui-favicon.test.ts tests/unit/mcpAsarUnpack.test.ts tests/unit/renderer/components/AionModal.dom.test.tsx`
- `bunx vitest run tests/integration/webui-favicon-build.test.ts tests/integration/webui-pwa-build.test.ts tests/integration/pet-renderer-build.test.ts`

Failed:

- `bun run build`

Failure detail:

- Builder now reaches the real macOS packaging/signing stage.
- Final failure is local signing only:
  - `codesign ... ambiguous (matches "Apple Development: 凯 周 (FF2YR75839)" ...)`

## Blocker Assessment

`bun run build` is **not blocked by the M1 monorepo migration anymore**.

Current remaining failure is a **local environment / signing identity blocker**, not a path-migration blocker:

- duplicate matching Apple Development certificate in login keychain

Non-fatal warnings observed during build:

- missing `resources/bundled-aionui-backend` extra resource

That warning did not stop builder before signing. It should be reviewed separately, but it is not the current terminal blocker.

## Files Changed By Executor-M1

- `package.json`
- `bun.lock`
- `packages/desktop/electron.vite.config.ts`
- `packages/desktop/electron-builder.yml`
- `scripts/build-with-builder.js`
- `scripts/README.md`
- `.claude/skills/architecture/references/project-layout.md`
- `tests/unit/webui-favicon.test.ts`
- `tests/unit/mcpAsarUnpack.test.ts`
- `tests/unit/renderer/components/AionModal.dom.test.tsx`

## Notes For Main Session

- If you need `bun run build` to pass on this machine, resolve the duplicate signing identity in Keychain first.
- If signing is intentionally out of scope for local M1 verification, the migration can be considered complete from the path/config perspective.
