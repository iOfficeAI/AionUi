# KSC Troubleshooting Notes

This note records the KSC integration lessons from debugging Gemini CLI / Aionrs requests through the local KSC proxy.

## Request Flow

KSC models are synced by `src/process/bridge/kscBridge.ts`.

1. Request login URL from `GET {baseUrl}/cli/login/url`.
2. Poll login result from `GET {baseUrl}/cli/login/result?loginUUID=...`.
3. Read `sk` and `userInfo.companyCode` from the login result.
4. Load models from `GET {baseUrl}/cli/models`, with fallback to `GET {baseUrl}/openapi2/models/list`.
5. Persist local providers whose `baseUrl` points at `/api/ksc-proxy/:providerId/...`.
6. Gemini CLI / Aionrs calls the local OpenAI-compatible proxy, which forwards to `{upstreamBaseUrl}{inferenceChatPath}`.

ProxyAI reference implementation lives in:

- `/Users/may/work/github/ProxyAI/src/main/kotlin/ee/carlrobert/codegpt/settings/service/ksc/api/KscApiClient.kt`
- `/Users/may/work/github/ProxyAI/src/main/kotlin/ee/carlrobert/codegpt/settings/service/ksc/KscModelSyncService.kt`

## Known Symptoms

### `Provider error: API error 500: {"success":false,"error":"Internal server error","code":"internal_error"}`

First check the Electron main-process log.

If the first error is:

```text
Did not get a valid CSRF token for 'POST /api/ksc-proxy/.../v1/chat/completions'
```

the request never reached KSC. It was blocked locally by `tiny-csrf`.

Fix pattern:

- Exclude the full dynamic proxy path from CSRF in `src/process/webserver/setup.ts`.
- `tiny-csrf` only does exact string matches for string exclusions.
- Use a regexp exclusion such as `^/api/ksc-proxy(?:/|$)` for dynamic provider IDs and nested paths.

### `Request is being retried after a temporary failure. Please wait...`

This usually means the OpenAI-compatible client received a retryable upstream failure. For KSC, check these details before changing retry logic:

- The synced provider must use the login result's `userInfo.companyCode` when present.
- The provider URL must respect `inferenceChatPath`; do not hardcode `/v1`.
- Runtime chat headers should match ProxyAI's convention:
  `Content-Type: application/json`, `Authorization: Bearer {sk}`, `X-LLM-Application-Tag: proxyai`, `ksyun-code-type: camelotkltapi`, and optionally `X-KSC-COMPANY-CODE`.
- Do not add an extra runtime `sk` header unless KSC explicitly requires it for that endpoint.

## Debug Checklist

1. Confirm the app was restarted after webserver middleware changes.
2. Re-login and re-sync KSC models after changing provider generation logic.
3. Inspect `[KscBridge] login succeeded, loading models` and confirm the effective `companyCode`.
4. Confirm the request path is `/api/ksc-proxy/:providerId/{inference base}/chat/completions`.
5. If the log mentions CSRF, fix `setup.ts`; if it mentions `[API] KSC proxy error`, inspect proxy forwarding; if KSC returns a response body, compare headers and body against ProxyAI.

## Implementation Notes

- KSC provider IDs are stable hashes using the model name. Existing synced providers may keep stale headers until KSC login/model sync runs again.
- The local proxy route is loopback-only, so CSRF protection is not the main trust boundary for `/api/ksc-proxy`; provider auth and loopback restriction are.
- The OpenAI SDK surfaces local proxy failures as provider/API errors, so always read the Electron main-process log before assuming KSC itself returned 500.
