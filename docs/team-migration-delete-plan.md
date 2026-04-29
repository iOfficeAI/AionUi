# Team Backend Migration — Delete Plan

**Date**: 2026-04-29  
**Status**: Ready for execution  
**Total lines to delete**: ~4,567 lines  
**Files to modify**: 3  
**Files to delete**: 27  
**Safe**: YES - no dependencies in other business logic  

---

## 1. Files to Delete from `src/process/team/`

### Core Services & Session (3 files, 1,065 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `src/process/team/TeamSession.ts` | 234 | Manages individual team session lifecycle |
| `src/process/team/TeamSessionService.ts` | 763 | Master service orchestrating all team operations |
| `src/process/team/index.ts` | 14 | Barrel export (re-exports shared types + TeamSession, TeamSessionService) |

### Agent & Teammate Management (3 files, 678 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `src/process/team/TeammateManager.ts` | 618 | Spawns teammates, monitors lifecycle, manages agent slots |
| `src/process/team/TaskManager.ts` | 109 | Implements task board (TaskCreate, TaskUpdate, TaskList) |
| `src/process/team/Mailbox.ts` | 52 | Inter-agent async message passing |

### Data Persistence (2 files, 424 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `src/process/team/repository/SqliteTeamRepository.ts` | 381 | SQLite DAO for team/task/mailbox/agent-status CRUD |
| `src/process/team/repository/ITeamRepository.ts` | 43 | Repository interface definition |

### Event Bus & Utilities (3 files, 88 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `src/process/team/teamEventBus.ts` | 17 | Event emitter for in-process team response streaming |
| `src/process/team/mcpReadiness.ts` | 50 | Polls team MCP servers until ready |
| `src/process/team/googleAuthCheck.ts` | 21 | Helper to validate Google OAuth for team features |

### Prompts & AI Guidance (9 files, 635 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `src/process/team/prompts/leadPrompt.ts` | 187 | AI system prompt for leader agent |
| `src/process/team/prompts/teamGuidePrompt.ts` | 108 | Prompt guiding teams through MCP/agent creation |
| `src/process/team/prompts/buildRolePrompt.ts` | 44 | Helper to build role-specific prompts |
| `src/process/team/prompts/teammatePrompt.ts` | 114 | AI system prompt for teammate agents |
| `src/process/team/prompts/teamGuideAssistant.ts` | 48 | Assistant label resolution for team guide |
| `src/process/team/prompts/teamGuideCapability.ts` | 21 | Feature gate for team guide MCP injection |
| `src/process/team/prompts/formatHelpers.ts` | 14 | Prompt formatting utilities |
| `src/process/team/prompts/toolDescriptions.ts` | 18 | Tool descriptions for agent MCP |
| `src/process/team/types.ts` | 59 | Process-side type definitions (MailboxMessage, TeamTask, IdleNotification) |

### MCP Servers (6 files, 1,677 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `src/process/team/mcp/team/TeamMcpServer.ts` | 633 | Team MCP server (core: create/list/get/delete/agents) |
| `src/process/team/mcp/team/teamMcpStdio.ts` | 307 | STDIO wrapper for TeamMcpServer + lifecycle |
| `src/process/team/mcp/guide/TeamGuideMcpServer.ts` | 262 | Guides users through team creation (aion_create_team) |
| `src/process/team/mcp/guide/teamGuideMcpStdio.ts` | 131 | STDIO wrapper for TeamGuideMcpServer |
| `src/process/team/mcp/guide/teamGuideSingleton.ts` | 45 | Singleton initialization of TeamGuideMcpServer |
| `src/process/team/mcp/tcpHelpers.ts` | 206 | TCP server helpers for MCP agent communication |
| `src/process/team/mcp/modelListHandler.ts` | 68 | Handler for model list in team context |

### Summary
```
- 27 files total
- ~4,567 lines of code
- All contained in src/process/team/
- No cross-module dependencies (files outside team/ don't import team/ types)
```

---

## 2. External Files with `@process/team` Dependencies

**Files that import from `@process/team`** (13 files):

### Critical Path — Must Update (5 files, modify not delete)
These files **wire up** the team bridge and must be updated to remove team initialization:

| File | Lines importing team | Action | Details |
|------|-----|--------|---------|
| `src/process/utils/initBridge.ts` | 2 imports | **REMOVE** | `import { TeamSessionService, SqliteTeamRepository } from '@process/team'` (L12)<br>`import { initTeamGuideService } from '@process/team/mcp/guide/teamGuideSingleton'` (L13)<br>Remove lines 19-20: `const teamRepo = new SqliteTeamRepository();` + `const teamSessionService = new TeamSessionService(...)`<br>Remove lines 28-30: `initTeamGuideService()` call |
| `src/process/bridge/index.ts` | 2 imports | **REMOVE** | `import type { TeamSessionService } from '@process/team/TeamSessionService'` (L8)<br>`import { initTeamBridge } from './teamBridge'` (L26)<br>Remove line 31: `teamSessionService: TeamSessionService;` from `BridgeDependencies`<br>Remove line 52: `initTeamBridge(deps.teamSessionService)` call<br>Remove line 79: `initTeamBridge` re-export<br>Remove line 84: `disposeAllTeamSessions` re-export |
| `src/process/bridge/teamBridge.ts` | 1 import | **DELETE** | Entire file is team-specific. Exports `initTeamBridge()` and `disposeAllTeamSessions()` which wire up ipcBridge.team endpoints to TeamSessionService |
| `src/process/agent/acp/index.ts` | 3 imports | **REMOVE** | `import { getTeamGuideStdioConfig } from '@process/team/mcp/guide/teamGuideSingleton'` (L42)<br>`import { shouldInjectTeamGuideMcp } from '@process/team/prompts/teamGuideCapability.ts'` (L43)<br>`import { waitForMcpReady } from '@process/team/mcpReadiness'` (L44)<br>These are used in `createAcpAgent()` to optionally inject team-guide MCP. Remove the conditional MCP injection (lines ~120-140) |

### Teammate Response Stream Handlers (5 files, modify not delete)
These files use `teamEventBus` to emit response streams when teammates respond. **Keep the `teamEventBus` import** but extract it so it's independent:

| File | Lines importing team | Action | Details |
|------|-----|--------|---------|
| `src/process/task/AcpAgentManager.ts` | 1 import (L3) | **EXTRACT** | Move `import { teamEventBus } from '@process/team/teamEventBus'` to new file `src/process/task/teamResponseEmitter.ts` (no team process dependency)<br>Keep the `teamEventBus.emit('responseStream', ...)` calls in AcpAgentManager (L310, L660) |
| `src/process/task/AionrsManager.ts` | 1 import (L9) | **EXTRACT** | Same as AcpAgentManager |
| `src/process/task/NanoBotAgentManager.ts` | 1 import (L17) | **EXTRACT** | Same as AcpAgentManager |
| `src/process/task/OpenClawAgentManager.ts` | 1 import (L9) | **EXTRACT** | Same as AcpAgentManager |
| `src/process/task/RemoteAgentManager.ts` | 1 import (L9) | **EXTRACT** | Same as AcpAgentManager |

**Note on teamEventBus**: It's a simple EventEmitter for in-process response streaming — NOT team-specific. Keep it but move to `src/process/common/` or `src/process/task/` so it's not under team/ path.

### Prompt utilities imported by agents (3 files, remove imports)
These files import team prompt utilities for injecting MCP configs. Remove when team prompts are deleted:

| File | Lines importing team | Action | Details |
|------|-----|--------|---------|
| `src/process/acp/compat/AcpAgentV2.ts` | 3 imports (L23-25) | **REMOVE** | `import { getTeamGuideStdioConfig } from '@/process/team/mcp/guide/teamGuideSingleton'`<br>`import { waitForMcpReady } from '@/process/team/mcpReadiness'`<br>`import { shouldInjectTeamGuideMcp } from '@/process/team/prompts/teamGuideCapability'`<br>Remove team guide MCP injection in `createAgent()` (~L50-70) |
| `src/process/acp/runtime/AcpRuntime.ts` | 2 imports (L4, L21) | **REMOVE** | Same as AcpAgentV2 |
| `src/process/task/agentUtils.ts` | 2 imports (L7-8) | **REMOVE** | `import { getTeamGuidePrompt } from '@process/team/prompts/teamGuidePrompt.ts'`<br>`import { resolveLeaderAssistantLabel } from '@process/team/prompts/teamGuideAssistant.ts'`<br>These populate team prompt hints. Safe to remove. |

**Total lines to remove**: ~100 imports + 50 conditional MCP injection blocks

---

## 3. Files NOT to Delete

### ✅ Keep All (shared types, adapters, UI)
| File | Why Keep |
|------|----------|
| `src/common/types/teamTypes.ts` | Shared frontend/backend team types (TTeam, TeamAgent, status events) |
| `src/common/adapter/teamMapper.ts` | Converts backend responses to frontend types (fromBackendTeam, toBackendAgent) |
| `src/common/utils/teamModelUtils.ts` | Utility for team model/agent rendering |
| `src/renderer/pages/team/*` | All team UI components, pages, hooks (they call REST API via ipcBridge, not process team/) |

---

## 4. ipcBridge.ts Changes — Methods to Delete vs Keep

**File**: `src/common/adapter/ipcBridge.ts` (lines 1583–1644)

### ❌ DELETE These Methods (no backend support)
```typescript
team.sendMessage        // (L1612-1615) — Backend removed message sending endpoints
team.sendMessageToAgent // (L1616-1619) — Backend removed message sending endpoints
```

**Why delete?** Rust backend (`aionui-backend`) **does NOT provide** `/api/teams/:id/messages` or `/api/teams/:id/agents/:id/messages` endpoints anymore. Team communication now goes through Mailbox + TaskBoard MCP servers running in-process.

### ⚠️ DELETE These WS Events (no backend events)
```typescript
team.listChanged  // (L1642) — wsEmitter<...>('team.list-changed')
team.mcpStatus    // (L1643) — wsEmitter<...>('team.mcp.status')
```

**Why delete?** Backend WebSocket no longer emits these events. Teams are fully stateless on backend.

### ✅ KEEP These Methods (backend provides REST APIs)
```typescript
team.create          // (L1584-1590)  — POST /api/teams
team.list            // (L1591-1596)  — GET /api/teams?user_id=
team.get             // (L1597-1600)  — GET /api/teams/:id
team.remove          // (L1601)       — DELETE /api/teams/:id
team.addAgent        // (L1602-1608)  — POST /api/teams/:id/agents
team.removeAgent     // (L1609-1611)  — DELETE /api/teams/:id/agents/:slot_id
team.renameAgent     // (L1622-1625)  — PATCH /api/teams/:id/agents/:slot_id/name
team.renameTeam      // (L1626-1629)  — PATCH /api/teams/:id/name
team.setSessionMode  // (L1630-1633)  — POST /api/teams/:id/session-mode
team.updateWorkspace // (L1634-1637)  — POST /api/teams/:id/workspace
team.stop            // (L1620)       — DELETE /api/teams/:id/session
team.ensureSession   // (L1621)       — POST /api/teams/:id/session
```

### ✅ KEEP These WS Events (backend provides WebSocket events)
```typescript
team.agentStatusChanged  // (L1638) — wsEmitter<...>('team.agent.status')
team.agentSpawned        // (L1639) — wsEmitter<...>('team.agent.spawned')
team.agentRemoved        // (L1640) — wsEmitter<...>('team.agent.removed')
team.agentRenamed        // (L1641) — wsEmitter<...>('team.agent.renamed')
```

**Summary of ipcBridge.ts edits:**
- **Delete**: 2 HTTP methods (sendMessage, sendMessageToAgent)
- **Delete**: 2 WS emitters (listChanged, mcpStatus)
- **Keep**: 11 HTTP methods (all CRUD + session management)
- **Keep**: 4 WS emitters (agent lifecycle events)

---

## 5. Scripts to Check/Delete

### `scripts/build-mcp-servers.js` — **MODIFY, NOT DELETE**
- **Current lines**: 56 total
- **Team MCP entries**: Lines 42–49 build TeamMcpServer and TeamGuideMcpServer
- **Action**: Delete only the esbuild.build() calls for team MCP servers (L40-49), keep the image gen server build
- **Before**:
  ```javascript
  await Promise.all([
    esbuild.build({...imageGenServer}),
    esbuild.build({...teamMcpServer}),      // DELETE
    esbuild.build({...teamGuideMcpServer}), // DELETE
  ]);
  ```
- **After**:
  ```javascript
  await esbuild.build({...imageGenServer});
  ```

---

## 6. Risk Assessment

### ✅ No Breaking Changes
- **Conversation module**: Uses `teamEventBus` only for optional response stream forwarding (safe to extract)
- **Agent managers**: Don't depend on team session logic, only route messages
- **No shared utilities**: Team code is isolated; utilities (database, logging, etc.) are in common/
- **Renderer fully isolated**: All team UI calls REST API via ipcBridge, not process code

### ⚠️ Compilation Check Required
After deletion, verify:
```bash
bun run lint:fix
bunx tsc --noEmit
bun run test
```

### 🔍 File Dependencies Verified
- ✅ `src/renderer/` — NO imports from @process/team (only ipcBridge HTTP/WS calls)
- ✅ `src/common/` — NO imports from @process/team (only type imports from types/teamTypes)
- ✅ `src/process/` — Only agent bridges + prompts, all extractable

---

## 7. Step-by-Step Deletion Order

### Phase 1: Extract Reusable Components
1. Move `src/process/team/teamEventBus.ts` → `src/process/common/responseEmitter.ts` (or new dedicated module)
2. Update imports in: AcpAgentManager, AionrsManager, NanoBotAgentManager, OpenClawAgentManager, RemoteAgentManager

### Phase 2: Remove Team Initialization Wiring
1. Delete `src/process/bridge/teamBridge.ts`
2. Modify `src/process/bridge/index.ts` — remove teamBridge init, remove type from BridgeDependencies
3. Modify `src/process/utils/initBridge.ts` — remove TeamSessionService instantiation, remove initTeamGuideService call

### Phase 3: Remove Team Prompt Injection
1. Modify `src/process/agent/acp/index.ts` — remove team guide MCP conditional injection
2. Modify `src/process/acp/compat/AcpAgentV2.ts` — remove team guide MCP setup
3. Modify `src/process/acp/runtime/AcpRuntime.ts` — remove team guide MCP setup
4. Modify `src/process/task/agentUtils.ts` — remove team prompt imports

### Phase 4: Update ipcBridge
1. Modify `src/common/adapter/ipcBridge.ts` — delete sendMessage, sendMessageToAgent, listChanged, mcpStatus
2. Verify renderer team pages still work (they only use kept methods: create, list, get, addAgent, removeAgent, etc.)

### Phase 5: Delete Team Core
1. Delete entire `src/process/team/` directory (27 files, ~4,567 lines)
2. Modify `scripts/build-mcp-servers.js` — remove team MCP build entries

### Phase 6: Final Verification
```bash
# Type check
bunx tsc --noEmit

# Lint & format
bun run lint:fix
bun run format

# Run tests (team tests will be removed with src/process/team/)
bun run test

# Build (verify no esbuild errors)
bun run build
```

---

## 8. Files Affected Summary

### 🔴 DELETE (27 files in src/process/team/)
All files under `src/process/team/` and subdirectories.

### 🟡 MODIFY (8 files outside team/)
| File | Changes |
|------|---------|
| `src/process/utils/initBridge.ts` | Remove 2 imports, remove TeamSessionService instantiation, remove initTeamGuideService call |
| `src/process/bridge/index.ts` | Remove 2 imports, remove teamSessionService from BridgeDependencies, remove initTeamBridge call, remove re-export |
| `src/process/agent/acp/index.ts` | Remove 3 imports, remove conditional team guide MCP injection (~20 lines) |
| `src/process/acp/compat/AcpAgentV2.ts` | Remove 3 imports, remove team guide MCP setup (~20 lines) |
| `src/process/acp/runtime/AcpRuntime.ts` | Remove 2 imports, remove team guide MCP setup (~20 lines) |
| `src/process/task/agentUtils.ts` | Remove 2 imports (team prompts no longer needed) |
| `src/common/adapter/ipcBridge.ts` | Delete 4 entries (2 HTTP methods + 2 WS events), keep 15 entries (11 HTTP methods + 4 WS events) |
| `scripts/build-mcp-servers.js` | Remove 2 esbuild.build() calls for team MCP servers |

### 🟢 EXTRACT (1 file to relocate, keep 1)
| File | Action |
|------|--------|
| `src/process/team/teamEventBus.ts` | Move to `src/process/common/` or new module, remove team dependency |

### ✅ KEEP ALL (NO CHANGES)
- All files in `src/common/types/`, `src/common/adapter/` (except ipcBridge modifications)
- All files in `src/renderer/pages/team/`
- All i18n files for team translations
- Conversation, channels, task, and other non-team modules

---

## 9. Validation Checklist

- [ ] No import errors after deletion
- [ ] No TypeScript compilation errors (`tsc --noEmit`)
- [ ] All tests pass (or team tests removed with src/process/team/)
- [ ] Renderer team UI still works (REST API calls via ipcBridge)
- [ ] Conversation response streaming works (extracted teamEventBus)
- [ ] Build completes without errors
- [ ] No lingering @process/team imports in codebase

