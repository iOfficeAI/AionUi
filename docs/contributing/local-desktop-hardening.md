# Local Desktop Hardening

This fork tracks upstream AionUi conservatively while keeping a small containment layer for local desktop use.

## Branch Model

- `upstream/main` mirrors `iOfficeAI/AionUi`.
- `origin/main` belongs to the downstream fork.
- `codex/local-desktop-hardening` carries the first hardening slice.
- Promote reviewed hardening work into a long-lived branch such as `company/hardened-main`.

## Runtime Profile

- Use the desktop app locally.
- Keep WebUI bound to `127.0.0.1` unless a separate review approves LAN or public exposure.
- Treat AI-generated HTML, cloned project previews, extension assets, and MCP/plugin output as untrusted input.

## Preserved HTML Preview

HTML preview remains enabled, including JavaScript for interactive previews. The preview webview is hardened by disabling Node integration, keeping context isolation, enabling sandbox mode, and removing insecure-content allowance.

## Upstream Update Workflow

```bash
git fetch upstream
git checkout company/hardened-main
git merge upstream/main
bun install --frozen-lockfile
bunx vitest run tests/unit/extensions/assetProtocolSafety.test.ts tests/unit/webserver/corsOriginPolicy.test.ts tests/unit/renderer/previewWebviewSecurity.test.ts
bun audit
```

Review dependency and Electron changes before promoting the merge. If `bun audit` reports inherited upstream advisories, triage them separately from local hardening regressions.

## Promotion Checklist

- Targeted hardening tests pass.
- Remote WebUI remains disabled by default.
- `aion-asset://` paths stay restricted to approved local roots.
- HTML preview does not reintroduce `allowRunningInsecureContent`.
- Dependabot security PRs are reviewed before release builds.
