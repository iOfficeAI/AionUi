# Round 2 Test Report — Team Model Switching Fixes

| Item      | Value                            |
| --------- | -------------------------------- |
| Date      | 2026-04-16                       |
| Branch    | `fix/team-file-sending-pipeline` |
| Tester    | r2-tester                        |
| Tech Plan | `07-r2-tech-plan.md`             |

---

## Summary

All three fixes verified. TypeScript compiles cleanly (`tsc --noEmit` passes). Full test suite passes (4173 tests, 0 failures). 7 new unit tests added for `resolveTeamModelLabel`.

| Fix   | Status | Code Verified | Tests                                  |
| ----- | ------ | ------------- | -------------------------------------- |
| FIX-1 | PASS   | Yes           | N/A (cosmetic UI)                      |
| FIX-2 | PASS   | Yes           | Skipped (private method, no-mock rule) |
| FIX-3 | PASS   | Yes           | 7 new tests added                      |

---

## FIX-1: AddAgentModal Model Label Empty Render

### Code Verification

**TeamModelSelect.tsx** — Confirmed:

- `label?: string` added to `Props` type (line 10)
- Component destructures `label` prop (line 13)
- When `loading || models.length === 0`, returns `null` — entire block (label + select) is hidden
- When models exist, renders `<div>` wrapper with conditional label (lines 36-41) and `<Select>` (lines 42-53)

**AddAgentModal.tsx** — Confirmed:

- External `<div className='flex flex-col gap-6px'>` and `<label>` wrapper removed (was lines 130-133)
- `TeamModelSelect` now receives `label={t('team.addAgent.model', ...)}` prop directly (line 134)
- When `TeamModelSelect` returns `null` (no models), no dangling label appears

**TeamCreateModal.tsx** — Confirmed:

- Uses `TeamModelSelect` without external label wrapper (line 250-254), inside a `FormItem` that owns its own label
- No `label` prop passed — matches backward compatibility design (optional prop)

### Test Coverage

Per tech plan: "No unit test needed (pure UI cosmetic)." Manual verification scenarios documented above.

---

## FIX-2: buildRecoveredAgent Does Not Restore `model`

### Code Verification

**TeamSessionService.ts** `buildRecoveredAgent` (line 400-426) — Confirmed:

- `currentModelId?: string` present in extra type cast (line 407)
- `model` field added to return object (line 424):
  ```typescript
  model: extra.currentModelId || (conversation as { model?: { useModel?: string } }).model?.useModel,
  ```
- Covers ACP path (`extra.currentModelId`) and Gemini/Aionrs fallback (`conversation.model.useModel`)
- When neither exists, `model` is `undefined` — correct default behavior

### Test Coverage

`buildRecoveredAgent` is a private method. The public entry point (`getTeam` -> `repairTeamAgentsIfMissing` -> `buildRecoveredAgent`) requires mocking `ITeamRepository` and `IConversationService`. Per project rule (no mocks), unit testing was skipped. The fix is a single-line addition with clear correctness from code review.

---

## FIX-3: TeamPage Shows Raw Model ID Instead of Label

### Code Verification

**teamModelUtils.ts** `resolveTeamModelLabel` (lines 96-110) — Confirmed:

- Returns `'(default)'` when `modelId` is `undefined`
- Looks up `cachedModels?.[backend]?.availableModels` for matching `id`
- Returns `match.label` if found and non-empty
- Falls back to raw `modelId` string

**TeamPage.tsx** — Confirmed:

- Imports: `ConfigStorage`, `AcpModelInfo`, `resolveTeamModelLabel` added (lines 10-12)
- `AgentChatSlot` props: `cachedModels?: Record<string, AcpModelInfo> | null` added (line 67)
- `TeamPageContent`: `cachedModels` state + effect loads from `ConfigStorage.get('acp.cachedModels')` (lines 203-212)
- Model display (line 121): `{resolveTeamModelLabel(agent.model, agent.agentType, cachedModels)}` replaces `{agent.model ?? '(default)'}`
- `cachedModels` prop threaded to both `AgentChatSlot` render sites (lines 424, 474)

### Test Coverage

7 new tests added to `tests/unit/teamModelUtils.test.ts`:

| Test ID | Scenario                                    | Expected               |
| ------- | ------------------------------------------- | ---------------------- |
| UT-21   | ACP cached models — match found             | Returns friendly label |
| UT-22   | No ACP match (Gemini)                       | Returns raw model ID   |
| UT-23   | modelId is undefined                        | Returns `'(default)'`  |
| UT-24   | cachedModels has no entry for backend       | Returns raw model ID   |
| UT-25   | Backend has models but none match           | Returns raw model ID   |
| UT-26   | Matched model has empty label               | Returns raw model ID   |
| UT-27   | modelId undefined with cachedModels present | Returns `'(default)'`  |

---

## Global Checks

| Check               | Result                                   |
| ------------------- | ---------------------------------------- |
| `bunx tsc --noEmit` | PASS (no errors)                         |
| `bun run test`      | PASS (409 files, 4173 tests, 0 failures) |
| New tests           | 7 added, all passing                     |
| Regressions         | None detected                            |
