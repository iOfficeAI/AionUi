# A2 — Integrated Terminal: Spike Findings & QA

> **Bet A2** of the Chisl OpenCode UX Parity Program (Phase 1).
> Win-condition slice: **the user runs a command in the in-app terminal**;
> heavy output must not freeze the renderer; no orphan PTYs.

---

## 1. Emulator decision: ghostty-web vs xterm.js (spike outcome)

The framework named `ghostty-web` as the default choice, with xterm.js as the
documented fallback. **Decision: xterm.js.** Two independent grounds:

### 1a. ghostty-web fails the production bar (researched 2026-06-09)

`ghostty-web` (npm, published by Coder, MIT) is real and popular
(~124k weekly downloads) but **v0.4.0 is 6 months stale** with ~15 unreleased
fixes, unanswered release/roadmap requests
([#137](https://github.com/coder/ghostty-web/issues/137),
[#156](https://github.com/coder/ghostty-web/issues/156)), and open
**showstopper** bugs:

| Class             | Issue                                                                                                            | Effect                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Data corruption   | [#139](https://github.com/coder/ghostty-web/issues/139)                                                          | `getViewport()` merges content from different lines at cols ≥ 120                                                                              |
| Data corruption   | [#138](https://github.com/coder/ghostty-web/issues/138)                                                          | stale cell data bleeds into new rows after scroll                                                                                              |
| Memory corruption | [#141](https://github.com/coder/ghostty-web/issues/141)                                                          | WASM heap corrupts after disposing a terminal that rendered multi-codepoint graphemes — all later terminals crash (workaround: leak terminals) |
| Input             | [#145](https://github.com/coder/ghostty-web/issues/145), [#148](https://github.com/coder/ghostty-web/issues/148) | DECSCUSR dropped (vim cursor), Ctrl+V paste broken, mouse wheel sends arrows under mouse tracking                                              |
| Perf              | [#155](https://github.com/coder/ghostty-web/issues/155), [#161](https://github.com/coder/ghostty-web/issues/161) | Canvas-2D only (no WebGL), reported visible keystroke echo latency                                                                             |
| Missing           | —                                                                                                                | no serialize, no search, no clipboard addon                                                                                                    |

Several consumers pin `github:…#main` instead of npm to get unreleased fixes —
a maintenance smell. A multi-tab terminal that disposes terminals (our exact
design) hits #141 head-on. **Measured spike on ghostty-web was therefore not
performed: the disqualifying defects are documented upstream and reproduce by
design (dispose-per-tab), not by tuning.**

### 1b. xterm.js was already integrated and shipping in this repo

`@xterm/xterm@5.5` + `addon-fit` + `addon-canvas` (DOM-renderer fallback) were
already committed (`TerminalPanel/TerminalInstance.tsx`), with a main-process
PTY (`@lydell/node-pty` in `process/services/terminal/TerminalService.ts`) and
a full tab strip. xterm.js is battle-tested (VS Code), actively maintained
(6.0 line releasing as of June 2026), and has the addon ecosystem ghostty-web
lacks. Replacing a working integration with a dependency carrying open
memory-corruption bugs would be strictly worse.

## 2. Architecture (process boundary)

PTY lifecycle is **entirely in the main process** — `TerminalService`
(singleton) owns `@lydell/node-pty` instances; the renderer holds only xterm
views and talks through the IPC bridge (`terminal.spawn/write/resize/kill/
list/snapshot` + `output`/`exit` emitters, allowlisted in
`common/adapter/events.ts`). `before-quit` runs `disposeTerminalBridge()` +
`killAll()` (`packages/desktop/src/index.ts`).

## 3. Flood / backpressure (measured)

Two layers, both landed this bet:

1. **Main-process coalescing** (`TerminalService`): per-session pending
   buffer flushed on an 8ms timer or at 64KB, whichever first; flushed before
   exit events (lossless); 512KB ring buffer per session for re-attach.
2. **Renderer write queue** (`TerminalPanel/writeQueue.ts`): single-flight
   `term.write(data, cb)` chaining with 1MB-per-write cap, so one IPC batch
   can never stall the xterm parser unboundedly.

**Measurements (from `tests/unit/services/terminal/terminalServiceFlood.test.ts`,
run 2026-06-09, exit 0):**

| Metric                              | Value                                             |
| ----------------------------------- | ------------------------------------------------- |
| Input chunks (synthetic PTY onData) | 10,000 × 64 B = 640,000 B                         |
| Output IPC events emitted           | **10**                                            |
| Coalesce ratio                      | **1000×** (avg 64,000 B/event)                    |
| Losslessness                        | concat(out) == concat(in), asserted               |
| Ring buffer after flood             | 524,288 B (exactly the 512KB cap, tail-retaining) |

The renderer therefore sees ≤ ~125 events/sec under sustained flood
(8ms windows), each written through the single-flight queue — the
"`yes` flood freezes the renderer" failure mode (1 event + 1 synchronous
write per PTY chunk) is structurally removed.

## 4. QA matrix

| Scenario                                                                    | Proving test                                                                              | Result                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Flood: 10k chunks → bounded events, lossless, ring cap                      | `terminalServiceFlood.test.ts` › flood case (+ size-bound and timer-bound flush cases)    | ✅ automated, measured                                                                                 |
| Pending output flushed before exit (no tail loss)                           | `terminalServiceFlood.test.ts` › flush-on-exit ×2 (natural + kill)                        | ✅ automated                                                                                           |
| PTY lifecycle cleanup (kill, killAll, natural exit, unknown-session guards) | `terminalService.test.ts` (14 tests, pre-existing)                                        | ✅ automated                                                                                           |
| No orphan PTYs on app exit                                                  | `killAll` test + `before-quit` wiring (`index.ts`)                                        | ✅ automated (service) + analysis (wiring)                                                             |
| Reload survival: live sessions re-listed as restored tabs                   | `useTerminalSessions.dom.test.ts` › re-attach (4 tests: restore, dedupe, list-failure ×2) | ✅ automated                                                                                           |
| Reload survival: scrollback recovered via snapshot, no dup/no gap ordering  | snapshot IPC + subscribe-buffer-write-drain ordering in `TerminalInstance.attachReattach` | ⚠️ analysis (ordering documented; underlying queue guarantees proven by `writeQueue.test.ts`, 9 tests) |
| Renderer write chaining, concat cap, lossless drain order                   | `writeQueue.test.ts` (9 tests)                                                            | ✅ automated                                                                                           |
| Tabs (add/close/rename/cycle)                                               | pre-existing `TerminalTabs` + `useTerminalSessions.dom.test.ts` (11 pre-existing tests)   | ✅ automated                                                                                           |
| Per-project cwd (active conversation workspace → spawn cwd)                 | `terminalService.test.ts` cwd tests + `TerminalPanel/index.tsx` `openWithActiveWorkspace` | ✅ automated (service) + analysis (wiring)                                                             |
| Minimal split (split spawns with active cwd; close kills)                   | `useTerminalSessions.dom.test.ts` › split (3 tests)                                       | ✅ automated                                                                                           |
| Tab/panel posture persistence (open/height/pinned)                          | pre-existing `TerminalPanelContext` + configService                                       | ✅ pre-existing                                                                                        |
| Input latency keystroke→echo in the running app                             | —                                                                                         | ⏳ owner run (interactive; not measurable headless)                                                    |
| Live `yes` flood in the running app stays interactive                       | —                                                                                         | ⏳ owner run (1-minute check; structural fix proven above)                                             |

## 5. Known limits / honest scope notes

- **Split is minimal by design:** one vertical split; the right pane hosts its
  own fresh session (same cwd as active tab) outside the tab strip; per-pane
  tab groups are deferred.
- **Snapshot replay is plain-text tail** (512KB): colors/alt-screen state from
  before the reload replay as raw bytes — fine for scrollback recovery, not a
  full terminal-state serialize (xterm `addon-serialize` is the upgrade path).
- Pre-existing failing renderer tests unrelated to the terminal
  (`TerminalPanelHost.dom.test.tsx` expects an older panel primitive) were
  failing before this bet and are reported in the Phase 1 report, not silently
  fixed here.
