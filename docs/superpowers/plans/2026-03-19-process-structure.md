# Main Process Structure Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 5 main-process modules (`worker/`, `webserver/`, `channels/`, `extensions/`, `agent/`) from `src/` root into `src/process/` to match the target project layout.

**Architecture:** Each module is moved via `git mv`, then all import paths referencing `@/module/...` are updated to `@process/module/...`. Config files (tsconfig, vite, vitest) are updated to reflect new paths. Order is from lowest to highest dependency count.

**Tech Stack:** TypeScript, Electron (electron-vite), Vitest

---

## Pre-Migration Notes

### Import Path Strategy

All 5 modules are currently at `src/<module>/` and imported via `@/<module>/...` (resolves through `@/*` → `./src/*`).

After moving to `src/process/<module>/`, imports change to `@process/<module>/...` (resolves through `@process/*` → `./src/process/*`).

**Special cases:**

- `@worker/*` alias in tsconfig/vite points to `src/worker/*` — must update to `src/process/worker/*`
- Worker entry points in `electron.vite.config.ts` rollup input — must update paths
- `vitest.config.ts` coverage include paths — must update
- Renderer imports of `@/channels/types` and `@/webserver/middleware/csrfClient` — must update to `@/process/channels/types` and `@/process/webserver/middleware/csrfClient` (these are type-only or isomorphic imports)

### Verification Command

After each task, run:

```bash
bunx tsc --noEmit
```

### File Counts (imports to update per module)

| Module      | External import lines | Internal cross-imports                      |
| ----------- | --------------------- | ------------------------------------------- |
| worker/     | 1                     | agent/ refs inside worker                   |
| webserver/  | 9                     | process/, extensions/, adapter/ refs inside |
| channels/   | 20                    | extensions/ ref inside                      |
| extensions/ | 12                    | channels/, common/ refs inside              |
| agent/      | 19                    | process/, extensions/ refs inside           |

**Total: ~90 import lines to update across src/ and tests/**

---

## Task 1: Move `worker/` into `src/process/worker/`

**Files:**

- Move: `src/worker/` → `src/process/worker/`
- Modify: `src/process/task/BaseAgentManager.ts:7`
- Modify: `tsconfig.json` (`@worker/*` path)
- Modify: `electron.vite.config.ts` (alias + rollup inputs)
- Modify: `src/process/worker/*.ts` (internal `@/agent/` refs → `@process/agent/` — defer to Task 5)

- [ ] **Step 1: git mv the directory**

```bash
git mv src/worker src/process/worker
```

- [ ] **Step 2: Update tsconfig.json `@worker/*` path**

Change:

```json
"@worker/*": ["./src/worker/*"]
```

To:

```json
"@worker/*": ["./src/process/worker/*"]
```

- [ ] **Step 3: Update electron.vite.config.ts**

In `mainAliases` (line 42):

```ts
// Change:
'@worker': resolve('src/worker'),
// To:
'@worker': resolve('src/process/worker'),
```

In `rollupOptions.input` (lines 95-99):

```ts
// Change all src/worker/ to src/process/worker/
gemini: resolve('src/process/worker/gemini.ts'),
acp: resolve('src/process/worker/acp.ts'),
codex: resolve('src/process/worker/codex.ts'),
'openclaw-gateway': resolve('src/process/worker/openclaw-gateway.ts'),
nanobot: resolve('src/process/worker/nanobot.ts'),
```

- [ ] **Step 4: Update the one external import**

`src/process/task/BaseAgentManager.ts:7`:

```ts
// Change:
import { ForkTask } from '@/worker/fork/ForkTask';
// To:
import { ForkTask } from '@process/worker/fork/ForkTask';
```

- [ ] **Step 5: Update internal imports inside worker that use `@/` prefix**

Search `src/process/worker/` for any `@/agent/`, `@/webserver/`, `@/channels/`, `@/extensions/` imports. These will be updated in their respective tasks later — skip for now. But update any `@/worker/` self-references if they exist.

- [ ] **Step 6: Verify**

```bash
bunx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(worker): move src/worker/ into src/process/worker/"
```

---

## Task 2: Move `webserver/` into `src/process/webserver/`

**Files:**

- Move: `src/webserver/` → `src/process/webserver/`
- Modify: 9 external import files
- Modify: `vitest.config.ts` (coverage paths)
- Modify: `tests/unit/apiRoutesUploadWorkspace.test.ts`

- [ ] **Step 1: git mv the directory**

```bash
git mv src/webserver src/process/webserver
```

- [ ] **Step 2: Bulk update external imports**

Replace `@/webserver/` with `@process/webserver/` in these files:

| File                                          | Line  |
| --------------------------------------------- | ----- |
| `src/renderer/hooks/context/AuthContext.tsx`  | 2     |
| `src/process/bridge/webuiBridge.ts`           | 10-16 |
| `src/process/bridge/services/WebuiService.ts` | 9-11  |

- [ ] **Step 3: Update internal imports inside webserver**

Search `src/process/webserver/` for `@/extensions` → `@process/extensions` (defer to Task 4).
Search for `@process/` imports — these are already correct.
Search for `@/webserver/` self-references → change to relative or `@process/webserver/`.

- [ ] **Step 4: Update vitest.config.ts coverage paths**

```ts
// Change:
'src/webserver/auth/service/AuthService.ts',
'src/webserver/auth/repository/UserRepository.ts',
// To:
'src/process/webserver/auth/service/AuthService.ts',
'src/process/webserver/auth/repository/UserRepository.ts',
```

- [ ] **Step 5: Update test imports**

`tests/unit/apiRoutesUploadWorkspace.test.ts:21`:

```ts
// Change:
import { resolveUploadWorkspace } from '@/webserver/routes/apiRoutes';
// To:
import { resolveUploadWorkspace } from '@process/webserver/routes/apiRoutes';
```

- [ ] **Step 6: Verify**

```bash
bunx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(webserver): move src/webserver/ into src/process/webserver/"
```

---

## Task 3: Move `channels/` into `src/process/channels/`

**Files:**

- Move: `src/channels/` → `src/process/channels/`
- Modify: ~20 external import files across renderer, process, common, extensions

- [ ] **Step 1: git mv the directory**

```bash
git mv src/channels src/process/channels
```

- [ ] **Step 2: Bulk update all external `@/channels/` imports**

Replace `@/channels/` with `@process/channels/` in all files outside `src/process/channels/`:

**Renderer (4 files — type-only imports):**

- `src/renderer/components/settings/SettingsModal/contents/channels/LarkConfigForm.tsx`
- `src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx`
- `src/renderer/components/settings/SettingsModal/contents/channels/TelegramConfigForm.tsx`
- `src/renderer/components/settings/SettingsModal/contents/channels/DingTalkConfigForm.tsx`

**Common (1 file):**

- `src/common/ipcBridge.ts`

**Process (8 files):**

- `src/process/database/IChannelRepository.ts`
- `src/process/database/SqliteChannelRepository.ts`
- `src/process/database/index.ts`
- `src/process/bridge/channelBridge.ts`
- `src/process/task/OpenClawAgentManager.ts`
- `src/process/task/AcpAgentManager.ts`
- `src/process/task/GeminiAgentManager.ts`
- `src/process/task/CodexAgentManager.ts`
- `src/process/index.ts`

**Extensions (1 file — will move in Task 4):**

- `src/extensions/resolvers/ChannelPluginResolver.ts`

- [ ] **Step 3: Update internal imports inside channels**

Search `src/process/channels/` for `@/extensions/` → leave for Task 4.
Search for `@/channels/` self-references → change to relative imports.

- [ ] **Step 4: Verify**

```bash
bunx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(channels): move src/channels/ into src/process/channels/"
```

---

## Task 4: Move `extensions/` into `src/process/extensions/`

**Files:**

- Move: `src/extensions/` → `src/process/extensions/`
- Modify: ~12 external import files

- [ ] **Step 1: git mv the directory**

```bash
git mv src/extensions src/process/extensions
```

- [ ] **Step 2: Bulk update all external `@/extensions` imports**

Replace `@/extensions` with `@process/extensions` in:

**Agent (1 file — will move in Task 5):**

- `src/agent/acp/AcpDetector.ts`

**Process (8 files):**

- `src/process/bridge/modelBridge.ts`
- `src/process/bridge/extensionsBridge.ts`
- `src/process/bridge/channelBridge.ts`
- `src/process/task/AcpSkillManager.ts`
- `src/process/task/AcpAgentManager.ts`
- `src/process/task/GeminiAgentManager.ts`
- `src/process/index.ts`

**Channels (now at src/process/channels/):**

- `src/process/channels/core/ChannelManager.ts`

**Webserver (now at src/process/webserver/):**

- `src/process/webserver/routes/apiRoutes.ts`

**Root entry:**

- `src/index.ts`

- [ ] **Step 3: Update internal imports inside extensions**

Search `src/process/extensions/` for:

- `@/channels/` → `@process/channels/` (ChannelPluginResolver)
- `@/extensions/` self-references → relative imports

- [ ] **Step 4: Verify**

```bash
bunx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(extensions): move src/extensions/ into src/process/extensions/"
```

---

## Task 5: Move `agent/` into `src/process/agent/`

**Files:**

- Move: `src/agent/` → `src/process/agent/`
- Modify: ~19 external import files
- Modify: `vitest.config.ts` (coverage paths for ACP)

- [ ] **Step 1: git mv the directory**

```bash
git mv src/agent src/process/agent
```

- [ ] **Step 2: Bulk update all external `@/agent/` imports**

Replace `@/agent/` with `@process/agent/` in:

**Worker (now at src/process/worker/):**

- `src/process/worker/gemini.ts`
- `src/process/worker/acp.ts`
- `src/process/worker/codex.ts`
- `src/process/worker/openclaw-gateway.ts`
- `src/process/worker/nanobot.ts`

**Bridge (3 files):**

- `src/process/bridge/acpConversationBridge.ts`
- `src/process/bridge/conversationBridge.ts`
- `src/process/bridge/index.ts`

**Task (6 files):**

- `src/process/task/OpenClawAgentManager.ts`
- `src/process/task/NanoBotAgentManager.ts`
- `src/process/task/AcpAgentManager.ts`
- `src/process/task/workerTaskManagerSingleton.ts`
- `src/process/task/CodexAgentManager.ts`
- `src/process/task/GeminiAgentManager.ts` (if it imports agent)

**Channels (now at src/process/channels/):**

- `src/process/channels/actions/SystemActions.ts`

- [ ] **Step 3: Update internal imports inside agent**

Search `src/process/agent/` for:

- `@/extensions` → `@process/extensions`
- `@/agent/` self-references → relative imports
- `@process/` imports — already correct

- [ ] **Step 4: Update vitest.config.ts coverage paths**

```ts
// Change:
'src/agent/acp/AcpAdapter.ts',
'src/agent/acp/AcpConnection.ts',
'src/agent/acp/acpConnectors.ts',
'src/agent/acp/modelInfo.ts',
'src/agent/acp/mcpSessionConfig.ts',
// To:
'src/process/agent/acp/AcpAdapter.ts',
'src/process/agent/acp/AcpConnection.ts',
'src/process/agent/acp/acpConnectors.ts',
'src/process/agent/acp/modelInfo.ts',
'src/process/agent/acp/mcpSessionConfig.ts',
```

- [ ] **Step 5: Verify**

```bash
bunx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(agent): move src/agent/ into src/process/agent/"
```

---

## Task 6: Final Cleanup & Verification

- [ ] **Step 1: Verify src/ directory is clean**

```bash
ls -1 src/
```

Expected remaining:

```
adapter/
common/
index.ts
preload.ts
process/
renderer/
shared/
shims/
skills/
assistant/
types/
types.d.ts
utils/
```

- [ ] **Step 2: Verify process/ directory structure**

```bash
ls -1 src/process/
```

Expected:

```
agent/
bridge/
builtinMcp/
channels/
database/
deepLink.ts
extensions/
i18n/
index.ts
initAgent.ts
initBridge.ts
initStorage.ts
mainWindowLifecycle.ts
message.ts
services/
task/
tray.ts
utils/
utils.ts
webserver/
webuiConfig.ts
worker/
```

- [ ] **Step 3: Run full type check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Run lint**

```bash
bun run lint:fix
```

- [ ] **Step 5: Run tests**

```bash
bun run test
```

- [ ] **Step 6: Update docs if needed**

Update `process.md` and `project-layout.md` to reflect completed migration status.

- [ ] **Step 7: Final commit (if any fixes)**

```bash
git add -A
git commit -m "refactor(process): complete main-process module migration cleanup"
```
