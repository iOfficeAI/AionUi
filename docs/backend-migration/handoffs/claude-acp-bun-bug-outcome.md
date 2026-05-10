# Claude ACP Handshake Timeout — Outcome

- **Date:** 2026-05-10
- **Issue:** AionUi#2826
- **Backend fix:** iOfficeAI/aionui-backend#218 (#217 root-cause)

## What broke

After the WebSocket proxy fix (#2825) shipped, the tarball WebUI served the SPA and passed WS upgrade correctly. But every Claude chat failed with:

```
POST /api/conversations/:id/warmup → 502
{"code":"BAD_GATEWAY","error":"Bad gateway: Initialize handshake timed out after 30s"}
```

Codex / Gemini / Aion CLI were unaffected.

## Root cause

`aionui-backend` bundled `bun 1.1.38`. Claude's ACP adapter is spawned as:

```
bun x --bun @agentclientprotocol/claude-agent-acp@0.29.2
```

Inside `bun x --bun`, bun `exec`s into the adapter's node entrypoint. bun 1.1.38 has a stdin-buffering bug: data written to bun's pipe-backed stdin _before_ the `exec` is buffered by bun itself and is not flushed to the child unless the parent closes stdin (EOF).

Long-lived stdio protocols like ACP (and MCP / LSP) keep stdin open for the session lifetime. So the adapter never sees the `initialize` message and AionUi times out at 30s.

## Reproduction

Minimal Rust + `tokio::process::Command` reproducer established:

| bun version | keep stdin open?       | result                          |
| ----------- | ---------------------- | ------------------------------- |
| 1.1.38      | yes (protocol mode)    | ❌ adapter hangs, 30s timeout   |
| 1.1.38      | no (write once + drop) | ✅ 1s response — proves the bug |
| 1.3.13      | yes (protocol mode)    | ✅ 1s response                  |

## Fix

`aionui-backend/crates/aionui-runtime/Cargo.toml`:

```toml
[package.metadata.aionui-runtime]
bun_version = "1.3.13"  # was "1.1.38"
```

`build.rs` auto-downloads / sha256 / zstd-compresses the new bun per target. No other backend code needed changes. Released as `v0.1.0-preview-test2` (tag re-cut at main HEAD after merge).

## AionUi changes

None. `package.json#aionuiBackendVersion` stays at `v0.1.0-preview-test2`. Because we re-cut the backend tag rather than bumping to a new tag, the next `build-and-release.yml` run on dev downloads the bun-1.3.13-bundled backend automatically.

This doc itself is the first AionUi-side commit that triggers that build.

## Verification plan

- [ ] `build-and-release.yml` run on this commit produces a tarball whose bundled backend contains bun 1.3.13 (verify via `strings resources/bundled-aionui-backend/.../aionui-backend | grep 'bun-v1.3.13'`)
- [ ] Download the new darwin-arm64 tarball, start `aionui-web start`, send a Claude message, expect a real response (no InitTimeout)
- [ ] Playwright-automated regression test (nice-to-have, follow-up): click Claude pill, type "ping", assert a text bubble response within 15s
