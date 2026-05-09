# AIONUI_BACKEND_ALLOW_MISSING Removal — Outcome

- **Date:** 2026-05-10
- **Branch:** `feat/backend-migration` → cleanup PR against `main`
- **Trigger:** `iOfficeAI/aionui-backend` Release CI is now stable — `v0.1.0-preview-test` (and future tags) publishes all 5 platform tarballs under `releases/latest`. The transition switch introduced in M7 is no longer needed.

## What changed

The `AIONUI_BACKEND_ALLOW_MISSING=1` transition switch (introduced in M7 to keep feature branches unblocked while the backend Release CI was still in development) has been removed end-to-end.

### Code

| File                                                    | Change                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/shared-scripts/src/prepare-aionui-backend.js` | Dropped `allowMissing` option. Both "latest tag unresolvable" and "download failed" branches now hard-fail.  |
| `packages/shared-scripts/src/prepare-aionui-backend.js` | Removed `skipped: true/false` fields from `manifest.json` — success manifests no longer carry the skip flag. |
| `scripts/prepareAionuiBackend.js`                       | CLI wrapper no longer reads `AIONUI_BACKEND_ALLOW_MISSING` env. Header comment updated.                      |
| `scripts/pack-web-cli.js`                               | `prepareAionuiBackend()` call no longer forwards `allowMissing`. Missing `backendSrc` is now an error.       |

### Workflows

| File                                    | Change                                                       |
| --------------------------------------- | ------------------------------------------------------------ |
| `.github/workflows/_build-reusable.yml` | Removed 4 × `AIONUI_BACKEND_ALLOW_MISSING: '1'` env entries. |
| `.github/workflows/pack-web-cli.yml`    | Removed 1 × `AIONUI_BACKEND_ALLOW_MISSING: '1'` env entry.   |

### Docs

Historical plan documents under `docs/backend-migration/plans/` still reference `ALLOW_MISSING` as a record of prior decisions. Only two documents were updated with a status banner pointing here:

- `2026-05-07-webui-decouple-electron-design.md`
- `2026-05-08-ci-web-cli-release-integration.md`

The M7/M8/ci-web-cli handoffs are left as-is — they are time-stamped snapshots of what was true when written.

## Runtime behaviour

- **Packaging (`prepareAionuiBackend`)**: hard fails when the GitHub API cannot resolve `latest` or when download/extraction fails. There is no skip manifest.
- **Packaged-app runtime**: the graceful "frontend-only" mode in `packages/web-cli/src/index.ts` is **retained**. That path handles end-user scenarios (wrong `--backend-bin` override, user manually deleting the binary) and is unrelated to the CI switch.

## Verification

1. CI: the new PR kicks off `_build-reusable.yml` and `pack-web-cli.yml` against the real release (`v0.1.0-preview-test`). A green run proves the download path works for all 5 targets.
2. Local: `node scripts/prepareAionuiBackend.js` on macOS arm64 downloads and extracts the binary without any env vars.
3. Grep: `rg 'AIONUI_BACKEND_ALLOW_MISSING|allowMissing' -g '!docs/**' -g '!*.md'` returns zero hits.

## Follow-ups

None. The switch is gone and the real release is the only source of truth.
