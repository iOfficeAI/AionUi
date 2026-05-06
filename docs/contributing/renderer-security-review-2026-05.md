# Renderer security review — May 2026

## Scope

Snapshot review for commit `bbada2a9268060d2b41ddf1d885a9b27ecd2103d`.

This document records the renderer-facing issues found during local review, the chosen fix scope for the current PR, and the deferred follow-up work that should land in separate atomic PRs.

## Fixed in this PR

### 1. Raw HTML in update release notes

- **Problem**: `UpdateModal` rendered release notes with `MarkdownView allowHtml`, which enabled `rehypeRaw` for externally sourced update content.
- **Risk**: Untrusted HTML could render directly in the UI.
- **Fix**: Stop enabling `allowHtml` in update release notes. Release notes now render as normal markdown only.

### 2. Message tips XSS surface

- **Problem**: `MessageTips` rendered non-JSON content via `dangerouslySetInnerHTML`.
- **Risk**: Error and warning strings could inject HTML into the renderer.
- **Fix**: Render message tip text as plain React text content instead of raw HTML.

### 3. External URL protocol hardening

- **Problem**: External-link opening accepted any URL scheme that `new URL()` parsed.
- **Risk**: Renderer content could launch unsupported or dangerous protocols such as `file:` or custom handlers.
- **Fix**: Enforce a protocol allowlist in both renderer and main-process shell bridges. Allowed protocols are `http:`, `https:`, and `mailto:`.

### 4. Diff header title injection

- **Problem**: `Diff2Html` wrote the title into the DOM with `innerHTML`.
- **Risk**: A crafted title could inject markup into the diff header.
- **Fix**: Use `textContent` instead of `innerHTML`.

## Deferred to follow-up PRs

These were intentionally not included here to keep the PR atomic and reviewable.

### A. Preview markdown raw HTML policy

- `src/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer.tsx`
- Review whether preview markdown should continue to use `rehypeRaw` by default.
- Preferred follow-up: trusted/untrusted preview modes or sanitizer-backed raw HTML support.

### B. Login CSRF exception

- `src/process/webserver/setup.ts`
- `/login` is still excluded from CSRF protection.
- This should be fixed in a dedicated auth-flow PR because it changes login bootstrapping behavior and requires targeted regression coverage.

### C. Generic preload / renderer capability boundary

- `src/preload/main.ts`
- `src/common/adapter/main.ts`
- `src/common/adapter/ipcBridge.ts`
- Main recommendation: replace the generic renderer-to-main event emitter with explicit capability-scoped APIs.

### D. HTML/webview preview isolation

- `src/renderer/pages/conversation/Preview/components/renderers/HTMLRenderer.tsx`
- `src/renderer/components/media/WebviewHost.tsx`
- Follow-up should tighten script execution, content isolation, and trusted-preview boundaries.

## Why this split

The current PR is constrained to one atomic security hardening fix set around renderer content rendering and external-link dispatch. The deferred items have wider auth or architecture impact and should be reviewed independently.
