# Bundled Python (durable runtime fix) — S1: fetch + stage

The app ships a self-contained CPython 3.12 so the runtime never depends on the
user's system Python (the Alois bug: macOS system `python3` was 3.9.6, outside
Hermes 0.16's `>=3.11,<3.14`). Full design:
`docs/specs/command-eve-bundled-python-design.md` (in the Company.OS repo).

This note covers **S1** — the build-time fetch — and what S2/S3 depend on.

## What S1 does

`scripts/fetch-bundled-python.mjs` (Node, build-time only):

1. For the target arch (default `arm64` macOS = `aarch64-apple-darwin`; `--arch
   x86_64` or `BUNDLED_PYTHON_ARCH` for later), builds the download URL for the
   **pinned** `astral-sh/python-build-standalone` `install_only` tarball.
2. Downloads it and **SHA256-verifies fail-closed** against the release's
   published checksum (`SHA256SUMS`). An unverified or unpinned (TODO) binary is
   **never extracted** — the script exits non-zero.
3. Extracts into `build/bundled-python/`, producing:

   ```
   build/bundled-python/
     cpython-3.12.13+20260610-aarch64-apple-darwin-install_only.tar.gz  (cached, gitignored)
     python/
       bin/python3.12        <- the interpreter
       lib/python3.12/...
   ```

Idempotent: a staged tarball that re-verifies skips the download; an existing
`python/bin/python3.12` skips extraction.

The tarball **and** the extracted tree are gitignored (`build/bundled-python/`,
~25 MB compressed / ~80 MB unpacked). Fetch at build/CI time; never commit.

### Pin (current)

| field | value |
| --- | --- |
| release tag | `20260610` |
| CPython | `3.12.13` |
| arch | `arm64` (`aarch64-apple-darwin`) — VERIFIED |
| SHA256 (arm64) | `e18ddd4c1e8f4a1d6c4590b37f423d76aec734447edc20ed08e93983d95f2132` |
| checksum source | `https://github.com/astral-sh/python-build-standalone/releases/download/20260610/SHA256SUMS` |

`x86_64` is **not yet pinned** (arm64-only ship for now; Alois + most pilots are
Apple Silicon). The script fails-closed for x64 until its real SHA256 is filled
in `SHA256_BY_ARCH`. To bump the pin: pick a new release tag, read its
`SHA256SUMS`, update `RELEASE_TAG` / `PY_VERSION` / `SHA256_BY_ARCH` constants.

Run it standalone:

```bash
node scripts/fetch-bundled-python.mjs            # default arm64
node scripts/fetch-bundled-python.mjs --arch x86_64   # (once x64 is pinned)
```

Unit tests for the pure logic (URL/arch construction + the fail-closed verify
decision): `node --test scripts/fetch-bundled-python.test.mjs`.

## Packaging — electron-builder (S1)

`packages/desktop/electron-builder.yml` `extraResources` maps the staged tree:

```yaml
- from: build/bundled-python/python
  to: python
```

So the packaged app gets `Contents/Resources/python/` with
`bin/python3.12` inside. (The fetch script must run **before** `electron-builder`
in the build pipeline so the staging dir exists.)

## What S2 / S3 depend on (NOT in this slice)

- **S2 (bootstrap):** `resolvePythonCommand` (in `runtimeBootstrapCore.ts`) gains
  a FIRST candidate — the bundled interpreter at
  `path.join(process.resourcesPath, 'python', 'bin', 'python3.12')` when
  `app.isPackaged`. It must support `-m venv` (the standalone builds do — verified)
  so the Hermes venv is created from it.
## S3 — notarization deep-sign (IMPLEMENTED, file-only)

A bundled CPython is dozens of Mach-O files (`bin/python3.12`, the
`libpython3.12.dylib`, `lib/python3.12/lib-dynload/*.so`,
`libssl`/`libcrypto`/`libffi`, …). Apple notarization REJECTS any embedded
binary that is not Developer-ID-signed + hardened-runtime. electron-builder
signs the `.app` (incl. its own `.node` native modules) but does **not**
hardened-runtime-sign the bundled python tree, so notarization fails on it.

S3 adds a guarded, darwin-only deep-sign step. Pure logic lives in
`scripts/deepSignPython_core.js` (enumerate Mach-O + inside-out ordering +
`codesign` arg construction + entitlements selection), unit-tested by
`scripts/deepSignPython_core.test.mjs` (`node --test`). The hook glue is
`deepSignBundledPython()` in `scripts/afterSign.js`.

**Where in the hook sequence (and why `afterSign`, not `afterAllArtifactBuild`):**
electron-builder runs `afterPack` → (signs the `.app` internally) → **`afterSign`**
→ builds DMG/zip → `afterAllArtifactBuild`. Our `afterSign` already notarizes the
`.app` itself via `@electron/notarize` (it ships as a `zip` target too), and
`afterAllArtifactBuild` rebuilds the DMG **from that same signed `.app`** via
`hdiutil` (COMPA-591). So the deep-sign MUST happen in `afterSign`, **after**
electron-builder's app-sign is verified and **before** `notarize()` — otherwise
the `.app`/`.zip` would be notarized with an un-deep-signed python. Doing it here
also covers the DMG transitively (it is built from the re-sealed `.app`), so the
CAO-passed COMPA-591 notarize/hdiutil flow in `afterAllArtifactBuild` is left
untouched.

**The deep-sign algorithm (inside-out):**
1. Resolve `<App>.app/Contents/Resources/python`. If absent → skip gracefully
   (non-bundle builds keep working). If no signing identity in env → skip with a
   log line.
2. Enumerate every Mach-O: `.so`/`.dylib` by extension, executables under `bin/`,
   plus a `codesign -d` probe fallback for extensionless framework binaries.
   Symlinks are skipped (sign the real target only).
3. Sign **inside-out**: deepest leaves first (`lib-dynload/*.so`, nested
   `.dylib`), then the `bin/python3.12` interpreter **last**, then re-seal the
   outer `.app`. Each leaf:
   `codesign --force --options runtime --timestamp --sign <identity>`. The
   interpreter additionally gets `--entitlements python-entitlements.plist`.
4. Re-seal the `.app` (`--force --options runtime --timestamp --entitlements
   entitlements.plist`, **no `--deep`** so the python entitlements survive), then
   `codesign --verify` it before notarize.

The identity is read from env by NAME (`APPLE_DEVELOPER_IDENTITY` / `CSC_NAME` /
`APPLE_DMG_SIGN_IDENTITY` — "Developer ID Application: FYN Labs LLC
(NHNQ7Q5H28)"); it is never embedded.

**`python-entitlements.plist`** (repo root, next to the app `entitlements.plist`)
grants the interpreter `com.apple.security.cs.allow-jit`,
`com.apple.security.cs.allow-unsigned-executable-memory`, and
`com.apple.security.cs.disable-library-validation` so the signed interpreter may
JIT and `dlopen` the signed `.so` extension modules under the hardened runtime.

- **S4 (Founder/HG):** the credentialed notarize **proof-run** of the
  bundled-Python DMG is the gating validation — only the Founder's Apple creds
  can confirm Apple accepts the deep-signed bundle. S3 is file-only; no real
  signing/notarization happens without those creds.
