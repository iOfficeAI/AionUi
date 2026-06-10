# A4 — Diff Loop with Pierre: Demo Flow & QA Matrix

> **Bet A4** of the Chisl OpenCode UX Parity Program (Phase 1).
> Win-condition slice: **review a diff from a tool-call message and jump to the
> file at the exact line — without leaving Chisl.**

---

## 1. What shipped (this bet) vs. what pre-existed

Pre-existing (committed before this bet — see CHANGELOG "replace diff2html
with @pierre/diffs"): the shared Pierre `DiffView`
(`packages/desktop/src/renderer/components/media/DiffView.tsx`) with Chisl
Shiki themes and click-to-jump (`requestEditorRevealLine({line})` +
`ipcBridge.shell.openFile({file_path, line_number})`, DiffView.tsx:188); the
Preview panel diff branch (`PreviewPanel.tsx:586` → `viewers/DiffViewer.tsx`
→ `DiffView` with `file_path={metadata?.file_path}`); tool messages computing
unified diffs via `createTwoFilesPatch` (`MessageToolCall.tsx`,
`MessageAcpToolCall.tsx`) into `FileChangesPanel`.

New in this bet:

| Change                                                                                                                                                               | Location                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Explicit one-click **"View diff"** button on every tool-message file row (real `<button>`, icon + label, aria-label)                                                 | `components/base/FileChangesPanel.tsx`               |
| Click-to-jump fixed from the tool-message path: `handleDiffClick` now propagates the file path (`relativePath`) so `metadata.file_path` resolves to the on-disk path | `hooks/file/useDiffPreviewHandlers.ts`               |
| Launcher: diff previews skip the disk-read branch (a diff is a synthetic comparison, not a file) while still resolving `metadata.file_path` for jump                 | `hooks/file/usePreviewLauncher.ts`                   |
| Same path propagation for grouped file-changes messages                                                                                                              | `pages/conversation/Messages/MessageFileChanges.tsx` |
| i18n `preview.viewDiff` in all 8 locales                                                                                                                             | `services/i18n/locales/*/preview.json`               |

## 2. Demo flow (the loop)

1. In a conversation, let the agent edit a file (any `Edit`/`replace` tool
   call, or an ACP diff content block).
2. The tool message renders a file row with `+N/−M` stats and a **View diff**
   button → click it.
3. The Preview panel opens with the Pierre `DiffView` (stacked/side-by-side
   toggle, Chisl light/dark Shiki themes).
4. Click any line in the diff → the in-app editor reveals that line
   (`requestEditorRevealLine`) and `shell.openFile({file_path, line_number})`
   fires with the resolved path. The whole loop happens inside Chisl.

## 3. QA matrix

| Scenario                                                                                                               | Expected                                     | Proving test                                                                                                         | Result                     |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| View-diff button renders per file row when `onDiffClick` provided; absent otherwise; click fires with the right file   | explicit affordance                          | `toolMessageDiffLink.dom.test.tsx` › FileChangesPanel cases                                                          | ✅ automated               |
| `handleDiffClick` launches preview with `contentType:'diff'`, `diffContent === patch`, and the path argument           | diff opens as diff, path travels             | `toolMessageDiffLink.dom.test.tsx` › useDiffPreviewHandlers case                                                     | ✅ automated               |
| Tool message (Edit/replace) → click View diff → `launchPreview` receives a patch containing old+new strings            | end-to-end wiring from the message component | `toolMessageDiffLink.dom.test.tsx` › MessageToolCall integration                                                     | ✅ automated               |
| Preview diff branch passes `metadata.file_path` into Pierre `DiffView`                                                 | jump has a real path                         | `toolMessageDiffLink.dom.test.tsx` › DiffViewer prop pass-through                                                    | ✅ automated               |
| Launcher resolves `relativePath` → absolute `metadata.file_path` for diff content and does NOT read the file from disk | no content clobbering, path resolved         | `toolMessageDiffLink.dom.test.tsx` › usePreviewLauncher diff branch                                                  | ✅ automated               |
| Line click in `DiffView` → `requestEditorRevealLine` + `shell.openFile({file_path, line_number})`                      | click-to-jump                                | pre-existing wiring (DiffView.tsx:188), exercised manually in the prior Pierre integration; not re-asserted this bet | ⚠️ analysis (pre-existing) |
| Visual end-to-end in the running app (click diff line → editor opens at line)                                          |                                              | **owner run** (1-minute check during the win-condition demo)                                                         | ⏳ owner                   |

Test run: `bun run test tests/unit/renderer/conversation/toolMessageDiffLink.dom.test.tsx` → **7/7 passed, exit 0** (2026-06-09).

## 4. Theme QA

- All NEW surfaces in this bet use semantic tokens / existing shared constants
  only — verified by grep: no hex literals in the new button, the wizard, or
  `messages.css` additions.
- **Pre-existing debt (not introduced here):** `renderer/styles/colors.ts`
  `diffColors` centralizes hardcoded gruvbox hexes (`#b8bb26`, `#fb4934`, …)
  used by `FileChangesPanel` stats and other diff chrome since before this
  bet. Recommended follow-up: re-express `diffColors` via `--success`/
  `--danger` tokens (the Pierre `DiffView` itself already maps line types to
  semantic tokens via `color-mix`).
