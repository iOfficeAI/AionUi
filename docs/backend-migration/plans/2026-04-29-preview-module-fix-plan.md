# Preview Module Backend Migration Fix Plan

> Source of truth for the preview module cleanup after the backend migration. Focuses on Electron mode — WebUI / Web fallback is intentionally out of scope.

## Status Snapshot

Not started. Three PRs, each self-testable end-to-end.

- [ ] PR 1: file-read sandbox fix (md / txt / code / html / image / diff)
- [ ] PR 2: office preview sandbox + stability (word / excel / ppt / document convert)
- [ ] PR 3: UX polish (error mapper / extension table merge / truncate banner / encodeURI)

## Goal

Fix the preview regressions exposed by the IPC → HTTP migration:

1. Users whose workspace is outside `$HOME` and `$TMPDIR` cannot preview any workspace file.
2. When the backend rejects a path, `read_file` silently returns `Ok(None)` and the frontend throws `TypeError: Cannot read properties of null`. The toast just says "preview failed".
3. Office preview routes (`/api/*-preview/start`) have no sandbox validation at all — `officecli` can be spawned against arbitrary absolute paths.
4. `/api/document/convert` has the same problem — anyone could convert `/etc/passwd`.

Non-goals:

- WebUI / Web fallback for PDF and HTML (different PR when needed).
- pdf.js integration.
- `/api/fs/serve` binary streaming route.
- Large-file streaming or chunked read.

## Current State

### Working in Electron today

- `ipcBridge.fs.{read,write,getImageBase64,metadata,readBuffer,fetchRemoteImage}` routes through `/api/fs/*` and hits `FileService` in `aionui-backend`.
- `ipcBridge.{word,excel,ppt}Preview.{start,stop,status}` routes through `/api/*-preview/*`, spawns `officecli`, and proxies through `/api/office-watch-proxy/{port}/*` and `/api/ppt-proxy/{port}/*`.
- `ipcBridge.previewHistory.{list,save,getContent}` routes through `/api/preview-history/*`.
- `ipcBridge.document.convert` routes through `/api/document/convert`.
- WebSocket events `preview.open`, `{word,excel,ppt}-preview.status`, `fileStream.contentUpdate`, `fileWatch.fileChanged` are wired.

### Not working

| Preview type                  | Symptom                                                                                   | Root cause                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| md / txt / code / html / diff | "preview failed" toast for any workspace outside `$HOME` / `$TMPDIR`                      | `FileService.allowed_roots` is fixed at startup; `read_file` returns `Ok(None)` on reject; frontend treats result as `string` and throws `TypeError` |
| png / jpg / svg etc.          | Same as above                                                                             | `get_image_base64` rejects via sandbox; same frontend silent swallow                                                                                 |
| word / excel / ppt            | No crash, but spawns `officecli` on any absolute path including paths outside the sandbox | `start_{word,excel,ppt}_preview` / `start_office_watch` / `document/convert` bypass `validate_path` entirely                                         |

### Backend design constraints

- `FileService::new` takes `allowed_roots: Vec<PathBuf>` at construction. `state_builders.rs:239` currently sets `[temp_dir(), home_dir()]`.
- `validate_path` canonicalizes and checks `starts_with`. Strict.
- `has_traversal` substring-matches `..` — too eager; rejects `foo..bar.md`.
- `AppError::Forbidden` may or may not exist (verify before adding); 403 with `code: "PATH_OUTSIDE_SANDBOX"` is the target shape.

## Decisions

- **Workspace injection strategy**: per-request `workspace: Option<String>` field in each request body. No shared mutable state, no `register_workspace` lifecycle, no persistent sandbox. Callers that already know the workspace pass it; callers that don't rely on the default `[temp_dir(), home_dir()]`.
- **Officecli in tests**: real `officecli` is assumed installed on the developer machine and CI. No mocking.
- **Scope of PR 1**: file-read types only. No PDF, no office. PDF preview works in Electron via `<webview src="file://">` which does not touch `FileService`.
- **Scope of PR 2**: all `officecli`-backed routes + `document/convert`. Adds sandbox validation only; does not refactor the `officecli` lifecycle.

## Execution Plan

### PR 1 — File-read sandbox fix

**Scope**: md / txt / code / html / image / diff. No office, no PDF.

#### Backend changes (`aionui-backend`)

1. `crates/aionui-api-types/src/file.rs`
   - Add `workspace: Option<String>` to `ReadFileRequest`, `ReadFileBufferRequest`, `GetImageBase64Request`, `GetFileMetadataRequest`.

2. `crates/aionui-file/src/path_safety.rs`
   - Replace `has_traversal` body: walk `Path::new(path).components()`, reject `Component::ParentDir` only; keep the `\0` check.
   - Add `pub fn validate_path_with_extra_root(path, base_roots, extra) -> Result<PathBuf, AppError>` that appends `extra` to `base_roots` and calls `validate_path`.

3. `crates/aionui-common/src/error.rs`
   - Verify `AppError::Forbidden(String)` variant exists. If missing, add it; map to HTTP 403 with `code: "PATH_OUTSIDE_SANDBOX"`.

4. `crates/aionui-file/src/traits.rs`
   - Add `extra_root: Option<&Path>` to `read_file`, `read_file_buffer`, `get_image_base64`, `get_file_metadata`.

5. `crates/aionui-file/src/service.rs`
   - `read_file`: remove the `Ok(None)` on reject branch (L639-642). Reject with `AppError::Forbidden`. Keep `Ok(None)` only for "file does not exist inside sandbox".
   - `read_file_buffer`: same change.
   - `get_image_base64`, `get_file_metadata`: accept `extra_root`, call `validate_path_with_extra_root`.

6. `crates/aionui-file/src/routes.rs`
   - Four handlers (`read_file`, `read_file_buffer`, `get_image_base64`, `get_file_metadata`): pull `workspace` from body, pass as `extra_root`.

#### Backend tests (`aionui-backend`)

1. `crates/aionui-file/src/path_safety.rs` unit tests
   - `has_traversal_allows_legal_filename_with_dots` — `foo..bar.md`, `README..old`, `my..file.txt` all allowed.
   - `has_traversal_still_rejects_parent_dir` — `../etc`, `a/../b`, `..`, `/foo/../bar` all rejected.
   - `validate_path_accepts_extra_workspace_root` — path under tempdir, extra root = tempdir, returns `Ok`.

2. `crates/aionui-file/tests/file_read_write.rs` integration tests
   - `read_file_with_extra_workspace_root_outside_home` — create tempdir outside home, pass as `extra_root`, read succeeds.
   - `read_file_rejects_outside_sandbox_without_workspace` — assert `AppError::Forbidden`, not `Ok(None)`.
   - `read_file_returns_none_for_missing_file_in_sandbox` — path inside sandbox but file does not exist → `Ok(None)`.
   - `read_file_buffer_with_extra_workspace_root` — buffer version.

3. `crates/aionui-file/tests/image_processing.rs`
   - `image_base64_with_extra_workspace_root` — png inside tempdir, extra_root = tempdir, returns base64.

4. `crates/aionui-app/tests/file_e2e.rs`
   - `read_file_with_workspace_field_accepts_non_home_path` — POST `/api/fs/read` with body including `workspace`, returns 200 + content.
   - `read_file_without_workspace_rejects_non_sandbox_path` — same path, no `workspace`, returns 403 with `code: "PATH_OUTSIDE_SANDBOX"`.
   - `read_file_non_existent_within_sandbox_returns_null` — path in `$HOME` but file missing → 200, `data: null`.
   - `image_base64_with_workspace_field_accepts_non_home_path` — same for image-base64 route.

#### Frontend changes (`AionUi`)

1. `src/common/adapter/ipcBridge.ts`
   - Update types for `fs.readFile`, `fs.readFileBuffer`, `fs.getImageBase64`, `fs.getFileMetadata`: add optional `workspace` to params; allow `null` return for `readFile` / `readFileBuffer` / `getImageBase64`.

2. `src/renderer/utils/previewError.ts` (new)
   - `type PreviewErrorKind = 'sandbox' | 'not_found' | 'timeout' | 'too_large' | 'unknown'`
   - `classifyPreviewError(error: unknown): PreviewErrorKind` — map `BackendHttpError.code === 'PATH_OUTSIDE_SANDBOX'` to `sandbox`, `FILE_NOT_FOUND` to `not_found`, message match `/timeout/i` to `timeout`, null return to `not_found`, else `unknown`.
   - `previewErrorToI18nKey(kind)` — returns i18n key.

3. `src/renderer/hooks/file/usePreviewLauncher.ts`
   - All `ipcBridge.fs.readFile.invoke` / `getImageBase64.invoke` calls (L129, L150): add `workspace` from context.
   - On `null` return from `readFile`: treat as `not_found` via `classifyPreviewError`.
   - Replace bare `catch` (L176-178) with error classification; surface kind on a returned state or emit through the existing message channel.

4. `src/renderer/pages/conversation/Workspace/hooks/useWorkspaceFileOps.ts`
   - `handlePreviewFile` (L293-412): pass `workspace` to `ipcBridge.fs.readFile.invoke` (L386) and `getImageBase64.invoke` (L383).
   - Catch block (L407-409): classify error, toast with i18n key from `previewErrorToI18nKey`.

5. `src/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer.tsx`
   - Add `workspace` prop. Pass from `PreviewContext`.
   - L104 `fetchRemoteImage.invoke`: no change (remote, no sandbox).
   - L135, L315 `getImageBase64.invoke`: pass `workspace`.

6. `src/renderer/pages/conversation/Preview/components/renderers/HTMLRenderer.tsx`
   - L98, L120, L133, L160: pass `workspace`.

7. `src/renderer/pages/conversation/Preview/components/viewers/ImageViewer.tsx`
   - Add `workspace` prop. L44: pass `workspace`.

8. `src/renderer/pages/conversation/Preview/context/PreviewContext.tsx`
   - L587-588: pass `workspace` to `getImageBase64` / `readFile`.
   - Thread `workspace` through context consumers.

9. `src/renderer/components/media/FilePreview.tsx`, `LocalImageView.tsx`, `src/renderer/utils/file/download.ts`, `src/renderer/pages/conversation/Messages/components/MessageToolGroup.tsx`, `src/renderer/pages/conversation/Workspace/components/FileChangeList.tsx`, `src/renderer/pages/conversation/components/SkillRuleGenerator.tsx`
   - Locate every `ipcBridge.fs.readFile.invoke` / `getImageBase64.invoke` / `readFileBuffer.invoke` call. Pass `workspace` where a conversation context is available. For global UI (settings, css theme), workspace is absent and caller relies on default sandbox.

10. i18n — `locales/{en,zh,zh-Hant,...}/translation.json`
    - `conversation.workspace.preview.errors.outsideSandbox` — "File is outside the workspace sandbox, cannot preview." / "文件不在工作区范围内，无法预览。"
    - `conversation.workspace.preview.errors.notFound` — "File does not exist or has been deleted." / "文件不存在或已被删除。"
    - `conversation.workspace.preview.errors.timeout` — "Reading file timed out. Please retry." / "读取文件超时，请稍后重试。"
    - Run `bun run i18n:types && node scripts/check-i18n.js`.

#### Frontend tests (`AionUi`)

1. `tests/unit/usePreviewLauncher.dom.test.ts` (new)
   - `launchPreview_md_file_success` — mock bridge returns content, assert `openPreview` called with correct metadata.
   - `launchPreview_md_file_sandbox_error` — mock bridge throws `BackendHttpError` with `code: 'PATH_OUTSIDE_SANDBOX'`; assert loading cleared, error kind = `sandbox`.
   - `launchPreview_md_file_null_returned` — mock bridge returns `null`; assert kind = `not_found`.
   - `launchPreview_md_file_timeout` — mock bridge rejects with `Error('File read timeout')`; assert kind = `timeout`.
   - `launchPreview_image_passes_workspace` — spy on `invoke`, assert `workspace` in args.
   - `launchPreview_pdf_skips_read` — contentType `pdf`, assert `readFile` not called, `openPreview` called with empty content.

2. `tests/unit/useWorkspaceFileOps.dom.test.ts` (new)
   - `previewFile_md_calls_readFile_with_workspace` — spy invoke args.
   - `previewFile_png_calls_getImageBase64_with_workspace` — same.
   - `previewFile_outside_sandbox_shows_outsideSandbox_toast` — mock bridge throws sandbox error; assert `messageApi.error` called with translated text matching i18n key.
   - `previewFile_missing_file_shows_notFound_toast` — same for null return.

3. Samples to copy: `tests/unit/FilePreview.dom.test.tsx`, `tests/unit/previewFileWatch.dom.test.ts`, `tests/unit/useAutoPreviewOfficeFiles.dom.test.ts`.

4. Playwright E2E — `tests/e2e/features/previews/preview-panel.e2e.ts` (extend)
   - New describe: `preview files in non-home workspace`.
   - `beforeAll`: `fs.mkdtemp(path.join(os.tmpdir(), 'aionui-e2e-non-home-'))`; write `a.md`, `b.txt`, `c.png` (1x1 minimal bytes), `d.html`. Create a conversation with `extra.workspace = <tempdir>` through `invokeBridge`.
   - Cases:
     - `opens markdown` — click tree node, assert panel visible, assert rendered content matches `a.md`.
     - `opens txt` — assert code viewer has expected text.
     - `opens png` — assert `<img src^="data:image/">` present in preview panel.
     - `opens html` — assert iframe with expected title.
   - `afterAll`: `fs.rm(tempdir, { recursive: true, force: true })`.

#### Self-test commands

```bash
# Backend
cd aionui-backend
cargo fmt --all
cargo clippy -p aionui-file -p aionui-app -p aionui-common --all-targets -- -D warnings
cargo test -p aionui-file
cargo test -p aionui-app file_e2e

# Backend live smoke
cargo run -p aionui-app -- --port 25808 --local --data-dir /tmp/aionui-e2e-data &
mkdir -p /tmp/aionui-test-ws && echo '# hello' > /tmp/aionui-test-ws/a.md
curl -s http://127.0.0.1:25808/api/fs/read \
  -H 'Content-Type: application/json' \
  -d '{"path":"/tmp/aionui-test-ws/a.md","workspace":"/tmp/aionui-test-ws"}' | jq .
curl -s http://127.0.0.1:25808/api/fs/read \
  -H 'Content-Type: application/json' \
  -d '{"path":"/opt/nowhere/x.md"}' | jq .

# Frontend
cd AionUi
bun run lint:fix
bun run format
bunx tsc --noEmit
bun run test
bun run test:e2e -- preview-panel
bun run i18n:types
node scripts/check-i18n.js
prek run --from-ref origin/main --to-ref HEAD

# Manual smoke in Electron
npm run dev
# set workspace to /Users/zhoukai/Documents/测试数据 then click md/txt/png/html in the workspace tree
```

#### PR 1 checklist

- [ ] Backend: unit + integration + e2e tests green
- [ ] Frontend: unit + e2e tests green
- [ ] i18n types regenerate with no errors
- [ ] `prek` green
- [ ] Manual smoke: md/txt/code/image/html all preview in `/Users/zhoukai/Documents/测试数据`
- [ ] Manual smoke: same files with workspace under `/tmp/aionui-test-ws` preview correctly
- [ ] Manual negative: path outside the sandbox returns `outsideSandbox` toast, not a generic "preview failed"
- [ ] GitHub issue opened
- [ ] PRs opened on both `aionui-backend` and `AionUi` with cross-links and `Closes #<n>`

---

### PR 2 — Office preview sandbox + stability

**Scope**: word / excel / ppt / document convert / office-watch. Depends on PR 1 being merged so the `workspace` field shape is stable.

#### Backend changes (`aionui-backend`)

1. `crates/aionui-api-types/src/office.rs`
   - Add `workspace: Option<String>` to `StartPreviewRequest`, `DocumentConversionRequest`.
   - Add `workspace: Option<String>` to `OfficeWatchStartRequest` (in `aionui-api-types/src/file.rs` if defined there).

2. `crates/aionui-office/src/routes.rs`
   - `start_word_preview`, `start_excel_preview`, `start_ppt_preview`: call `validate_path_with_extra_root` on `file_path` before handing off to `watch_manager.start`. On failure return `AppError::Forbidden`.
   - `convert_document`: same validation.
   - Decision: the `start_*_preview` handlers need a reference to `FileService.allowed_roots`. Either inject `FileService` into `OfficeRouterState` or pass the base roots at state build time. Pick whichever touches fewer crates.

3. `crates/aionui-file/src/routes.rs`
   - `start_office_watch`: same validation.

4. `crates/aionui-app/src/state_builders.rs`
   - Thread `allowed_roots` into `OfficeRouterState`. Verify no other consumer breaks.

5. Error-code normalization in `crates/aionui-office/src/`
   - `OfficeError` variants surface to HTTP with stable `code` strings: `OFFICECLI_NOT_FOUND`, `OFFICECLI_INSTALL_FAILED`, `OFFICECLI_PORT_TIMEOUT`, `OFFICECLI_START_FAILED`, `PATH_OUTSIDE_SANDBOX`.
   - Keep 200 status on lifecycle errors only where the frontend already expects `{ error, url }` shape; switch to proper 4xx/5xx for sandbox and invalid inputs.

6. Proxy route validation — `crates/aionui-office/src/proxy.rs`
   - `is_active_port(port, doc_type)` is already called. Verify it binds port↔doc_type tightly; otherwise patch so a PPT port cannot be proxied via `/api/office-watch-proxy` and vice versa.

#### Backend tests (`aionui-backend`)

1. `crates/aionui-office/tests/` (integration)
   - `start_word_preview_accepts_path_in_extra_workspace` — tempdir outside home, returns successful start (requires officecli).
   - `start_word_preview_rejects_path_outside_sandbox` — returns 403 with `code: "PATH_OUTSIDE_SANDBOX"`, no `officecli` spawn.
   - Same two for excel and ppt.
   - `convert_document_rejects_outside_sandbox` — 403.

2. `crates/aionui-app/tests/office_e2e.rs`
   - `office_preview_flow_with_workspace` — full lifecycle: start with workspace field, poll status, stop. Assert `url` returned and reachable.
   - `office_preview_rejects_without_workspace_for_non_home_path` — 403.
   - `document_convert_rejects_outside_sandbox` — 403.

3. Proxy route — `crates/aionui-office/tests/proxy_integration.rs`
   - `proxy_rejects_mismatched_doc_type` — PPT port accessed via word proxy returns 403 or 404.

#### Frontend changes (`AionUi`)

1. `src/common/adapter/ipcBridge.ts`
   - `pptPreview.start`, `wordPreview.start`, `excelPreview.start`: add optional `workspace` to params.
   - `document.convert`: add optional `workspace` to request.
   - `workspaceOfficeWatch.scan`: already has workspace; confirm.

2. `src/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer.tsx`
   - Add `workspace` prop. Pass to `bridge.start.invoke({ file_path, workspace })`.
   - Replace the single-branch error display with classified branches based on the error field returned by the backend:
     - `OFFICECLI_NOT_FOUND` → install guide + link
     - `OFFICECLI_INSTALL_FAILED` → retry button + logs hint
     - `OFFICECLI_PORT_TIMEOUT` → retry button
     - `OFFICECLI_START_FAILED` → generic failure
     - `PATH_OUTSIDE_SANDBOX` → workspace hint (should be very rare after PR 1's fix)

3. `src/renderer/hooks/file/useAutoPreviewOfficeFiles.ts`
   - Pass `workspace` into auto-preview start calls.

4. `src/renderer/pages/conversation/Preview/components/viewers/{PptViewer,OfficeDocViewer,ExcelViewer}.tsx`
   - Forward `workspace` prop to `OfficeWatchViewer`.

5. i18n
   - `preview.office.errors.officecliNotFound` / `.installFailed` / `.portTimeout` / `.startFailed` / `.outsideSandbox`
   - Install hint link text: `preview.office.installLinkText`.

#### Frontend tests (`AionUi`)

1. `tests/unit/OfficeWatchViewer.dom.test.tsx` (new)
   - Mock `bridge.start.invoke` to return each error variant; assert the correct UI block is rendered.
   - Mock success path; assert `<WebviewHost>` / `<iframe>` appears with the returned URL.
   - Assert `workspace` is forwarded in `start.invoke` args.

2. Playwright E2E — `tests/e2e/features/previews/office-preview.e2e.ts` (new or extend)
   - `beforeAll`: `fs.mkdtemp(path.join(os.tmpdir(), 'aionui-e2e-office-'))`; copy fixture `.docx`, `.xlsx`, `.pptx` files into it (add fixtures under `tests/e2e/fixtures/office/`). Create conversation with `extra.workspace = <tempdir>`.
   - Cases (real `officecli`):
     - `opens docx in non-home workspace` — assert `<webview>` or iframe becomes visible and status flips to `ready`.
     - `opens xlsx in non-home workspace` — same.
     - `opens pptx in non-home workspace` — same.
     - `rejects docx outside sandbox` — call `pptPreview.start.invoke({ file_path: '/opt/nowhere.pptx' })` directly via `invokeBridge`, assert 403 error returned (does not spawn officecli).
   - `afterAll`: stop preview bridges, remove tempdir.

#### Self-test commands

```bash
cd aionui-backend
cargo fmt --all
cargo clippy -p aionui-office -p aionui-file -p aionui-app --all-targets -- -D warnings
cargo test -p aionui-office
cargo test -p aionui-app office_e2e

cd AionUi
bun run lint:fix && bun run format
bunx tsc --noEmit
bun run test
bun run test:e2e -- office-preview
bun run i18n:types && node scripts/check-i18n.js
prek run --from-ref origin/main --to-ref HEAD

# Manual smoke in Electron
npm run dev
# set workspace to /Users/zhoukai/Documents/测试数据, open a docx, xlsx, pptx
```

#### PR 2 checklist

- [ ] All backend tests green including proxy route tests
- [ ] All frontend unit tests green
- [ ] Playwright office E2E green with real officecli
- [ ] Manual smoke: docx/xlsx/pptx in `/Users/zhoukai/Documents/测试数据` all preview in Electron
- [ ] Manual negative: call `pptPreview.start` with path outside sandbox, error surfaces with `outsideSandbox` message
- [ ] GitHub issue opened
- [ ] PRs opened on both repos with cross-links and `Closes #<n>`

---

### PR 3 — UX polish

**Scope**: frontend only, no backend changes.

#### Changes

1. `src/renderer/utils/previewError.ts`
   - Promote PR 1's inline helper to a first-class module if not already.
   - Add richer mapping: backend `code` → `PreviewErrorKind` → i18n key table.

2. Extension detection consolidation
   - `src/renderer/pages/conversation/Preview/fileUtils.ts`
     - Expand `FILE_EXTENSION_MAP` to include `odt`, `odp`, `ods`, `csv`, `tiff`, `avif`, `mdown`, `mkd`.
     - Export a single `getContentTypeByExtension` as the canonical source.
   - `src/renderer/pages/conversation/Workspace/hooks/useWorkspaceFileOps.ts`
     - Delete the inline extension branch (L304-370). Call `getContentTypeByExtension` instead.

3. Large-text truncate banner
   - `src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel.tsx`
     - When `metadata.truncated === true`, render a sticky banner "Content truncated to first 800KB. Click download to see full file."
   - `src/renderer/hooks/file/usePreviewLauncher.ts` and `useWorkspaceFileOps.ts`
     - Propagate `truncated: boolean` through `openPreview` metadata.

4. PDF path encoding
   - `src/renderer/pages/conversation/Preview/components/viewers/PDFViewer.tsx`
     - L112: `const pdfSrc = file_path ? \`file://\${encodeURI(file_path)}\` : content || ''`
     - Verify `encodeURI` handles Chinese / spaces / unicode correctly.

5. Office proxy URL refactor
   - `src/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer.tsx`
     - L115: replace `(window as Window & { __backendPort?: number }).__backendPort` with a shared helper from `src/common/adapter/httpBridge.ts` (`getBaseUrl()` or new `getBackendOrigin()`).
     - Keep the `isElectronDesktop()` branch for direct localhost:port usage.

#### Tests

1. `tests/unit/previewError.test.ts` (new)
   - Map every backend `code` to the expected `kind`.
   - Map every `kind` to the expected i18n key.

2. `tests/unit/fileUtils.test.ts` (extend)
   - Assert new extensions resolve correctly.
   - Assert `md` ↔ `markdown` case-insensitive.

3. `tests/unit/usePreviewLauncher.dom.test.ts` (extend)
   - Assert `truncated: true` passed through metadata when content > threshold.

4. `tests/unit/PDFViewer.dom.test.tsx` (new)
   - Assert `webview src` contains `encodeURI` output for path with unicode and space.

5. Playwright (optional)
   - Case: open a file with `..` in filename like `v1..v2.md`, assert no error.
   - Case: open a file with Chinese in the path, assert preview works.

#### Self-test commands

```bash
cd AionUi
bun run lint:fix && bun run format
bunx tsc --noEmit
bun run test
bun run i18n:types && node scripts/check-i18n.js
prek run --from-ref origin/main --to-ref HEAD
```

#### PR 3 checklist

- [ ] All frontend unit tests green
- [ ] Extension map unified, inline branch deleted
- [ ] PDF path with Chinese / space loads correctly (manual smoke)
- [ ] Truncate banner visible when opening a large text file
- [ ] GitHub issue opened
- [ ] PR opened with `Closes #<n>`

---

## Merge Order

1. PR 1 first — unblocks users immediately
2. PR 2 once PR 1 is in `main` — reuses workspace field convention
3. PR 3 any time after PR 1

## Risk & Rollback

- **PR 1 risk**: callers that currently hit `readFile` without a workspace in Electron depend on home-dir fallback. After this change they keep working because the default `allowed_roots` still includes home. The behavior change for users affected is a net positive — previously silent failure becomes a meaningful error.
- **PR 2 risk**: tightening sandbox on office routes will break flows that currently rely on spawning `officecli` against arbitrary paths. Search for callers that pass non-workspace paths; none should exist in normal user flows.
- **PR 3 risk**: low. Pure UX.

Rollback plan: each PR is independent and revertible. Backend changes ship as additive fields with safe defaults.

## Open Questions

None pending — all decisions captured above.

## Related Work

- `docs/backend-migration/handoffs/` — other module migrations (assistant, model-config, cron) for style reference.
- `.claude/skills/testing/SKILL.md` — testing standards for this repo.
- `.claude/skills/oss-pr/SKILL.md` — PR workflow.
