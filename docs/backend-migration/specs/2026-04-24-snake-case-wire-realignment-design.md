# Snake-Case Wire Realignment — Frontend Design Spec

**Date:** 2026-04-24
**Scope:** Flip the builtin-skill pilot's frontend-side camelCase fields
to snake_case, matching the project-wide wire convention established on
`origin/main` by `dae96f8`.

**Companion spec (backend, authoritative source for the contract):**
[`aionui-backend/docs/backend-migration/specs/2026-04-24-snake-case-wire-realignment-design.md`](../../../../aionui-backend/docs/backend-migration/specs/2026-04-24-snake-case-wire-realignment-design.md)

## Background

The builtin-skill pilot shipped to `feat/backend-migration-builtin-skills`
with camelCase field names on its new endpoints. After merging
`feat/backend-migration` (which brought in the snake_case migration) the
two styles coexist:

- Fields pre-dating the pilot were flipped to snake_case correctly
  (`file_name`, `skill_path`, etc.)
- Fields the pilot introduced (`conversationId`, `enabledSkills`,
  `dirPath`, `relativeLocation`, `isCustom`) kept camelCase.

The backend originally accepted camelCase on these because H1
(`04f1537`, `feat/builtin-skills`) had added `#[serde(rename_all =
"camelCase")]` to skill.rs structs. That was a directional mistake —
the project convention is snake_case on the wire. The backend spec
reverts H1 and realigns; this spec covers the frontend-side flips.

## File Changes

### `src/common/adapter/ipcBridge.ts`

| Signature                                       | Current                                        | Target                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listAvailableSkills` response row              | `relativeLocation?: string; isCustom: boolean` | `relative_location?: string; is_custom: boolean`                                                                                                                                 |
| `materializeSkillsForAgent` request             | `{ conversationId, enabledSkills }`            | `{ conversation_id, enabled_skills }`                                                                                                                                            |
| `materializeSkillsForAgent` response            | `{ dirPath }`                                  | `{ dir_path }`                                                                                                                                                                   |
| `cleanupSkillsForAgent` — URL path construction | `p.conversationId`                             | Same name in TypeScript, but URL template unchanged. Electron caller passes `conversationId`; the bridge builds the path. No backend body — URL path names are backend-internal. |

`readBuiltinRule` and `readBuiltinSkill` already correctly send
`file_name` (merge got this right). Leave alone.

### `src/process/task/AcpSkillManager.ts`

- `SkillDefinition` (or local equivalent) if it holds `relativeLocation`
  / `isCustom` — rename fields.
- Anywhere it reads `skill.relativeLocation` / `skill.isCustom` — flip
  access.
- `loadSkillBody` at line 341 sends `{ file_name }` — already correct.

### `src/process/utils/initAgent.ts` and callers of materialize

```ts
// Before:
const { dirPath } = await ipcBridge.fs.materializeSkillsForAgent.invoke({
  conversationId,
  enabledSkills,
});

// After:
const { dir_path: dirPath } = await ipcBridge.fs.materializeSkillsForAgent.invoke({
  conversation_id: conversationId,
  enabled_skills: enabledSkills,
});
```

Alternative: rename the TypeScript local variables too for clarity. But
preserving the TS caller API (callers pass `conversationId` camelCase
JavaScript-style) is cleanest — the bridge layer translates to snake_case
at the wire boundary. Destructure with a rename to map back to JS-style
locals.

### `src/process/task/GeminiAgentManager.ts`

Cleanup call site:

```ts
// Before:
ipcBridge.fs.cleanupSkillsForAgent.invoke({ conversationId });

// After: same — the URL path parameter in the template still named
// conversationId at the TS level. The underlying backend route uses
// :conversation_id; the HTTP bridge interpolates.
```

No change required if the bridge already supports the path template
correctly. Verify the `httpDelete(p => /api/.../${p.conversationId})`
still matches the backend's actual path segment name (backend uses
`/materialize-for-agent/:conversation_id`). If the backend's router
extracts via `{conversation_id}` and the bridge builds
`/materialize-for-agent/${conversationId}`, the string is still correct
because URL path components are just strings — backend doesn't parse
field names from them. Safe to leave.

### `src/process/services/conversation/ConversationServiceImpl.ts`

Same as GeminiAgentManager — no structural change needed. Verify call
site passes `{ conversationId }` object (string value goes through URL
interpolation), not a body field.

### `tests/unit/acpSkillManager.test.ts`

Mocks for `ipcBridge.fs.listBuiltinAutoSkills` and related must return
snake_case keys now. Any assertion on `relativeLocation` / `isCustom`
must flip.

### `tests/unit/initAgent.materialize.test.ts`

- Mock `materializeSkillsForAgent.invoke` return value: `{ dir_path }`
  instead of `{ dirPath }`.
- Assertion on the invoke argument: `{ conversation_id, enabled_skills }`
  instead of camelCase.

### Playwright E2E

`tests/e2e/features/builtin-skill-migration/builtin-skill-migration.e2e.ts`

Audit any payload assertions. Anything that inspects a `dirPath` /
`relativeLocation` / `conversationId` field in an HTTP response or
request body (via `waitForResponse` inspection etc.) must flip to
snake_case. Most tests operate on UI state and don't touch wire
payloads — those are safe.

## Rollout

- Depends on backend-spec's §6 rollout order (backend merges before
  frontend).
- Frontend branch: `feat/backend-migration-builtin-skills`
- Merges at coordinator closure into
  `feat/backend-migration-coordinator`.

## Definition of Done

- [ ] `grep -nE "(conversationId|enabledSkills|dirPath|relativeLocation|isCustom)" src/common/adapter/ipcBridge.ts` returns zero hits on skill-related signatures (camelCase in non-skill areas, like `AcpAgentInfo`, is untouched and out of scope)
- [ ] `bun run test --run tests/unit/acpSkillManager.test.ts tests/unit/initAgent.materialize.test.ts` green
- [ ] Full Vitest baseline unchanged (38 failed / 111 tests, same as pre-realign)
- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run lint --quiet` no new warnings
- [ ] Playwright 8/8 green against backend with realigned skill.rs
