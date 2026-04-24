# `invokeBridge` Audit — 2026-04-23

> **⚠️ OUT OF SCOPE for this migration track.**
>
> This audit was produced while the coordinator was scoped to
> **Skill-Library + Assistant surface only**. The findings below document
> latent Class E failures in `conversation` / `cron` / `team` / `extension`
> e2e helpers — **those domains are owned by their respective future
> migration tracks, not by this one**.
>
> Any commit that modifies files outside `tests/e2e/{features/assistants,
> features/settings/skills, helpers/skillsHub.ts, helpers/httpBridge.ts,
> helpers/index.ts}` overreaches this track's charter and should be reverted.
> Two such commits (cron-crud + extensions migration) were landed then
> reverted (`e61e07c38`, `c2d4af05a`) because they crossed into team / cron /
> extensions territory.
>
> This file remains checked in **as a forward-reference for whoever owns
> those domains later** — it tells them what needs to change and where the
> breakage patterns are. It is **not a todo list for this coordinator**.



**Scope:** Find all remaining e2e call sites that use `invokeBridge()` after
the Skill-pilot + Assistant-verify work, determine which keys still have
live IPC handlers vs. which keys are HTTP-migrated in the renderer.

**Conclusion (TL;DR):** 21 test files still rely on `invokeBridge` for keys
that are **ALL already HTTP-migrated** in `src/common/adapter/ipcBridge.ts`.
These will all time out the same way Assistant Class E failures did. No
keys we found still map to a live IPC subscribe handler — the keys don't
even appear as string literals in `ipcBridge.ts` anymore; they're
`key.sub.key` dotted paths that existed under an older provider protocol
that has been replaced by HTTP adapters. The renderer never emits
`subscribe-<key>` for these anymore, so the backend never receives the
request, so `invokeBridge` hangs its 10 s timeout.

## Method

1. `grep -rn "invokeBridge" tests/e2e/{helpers,specs,features}` → 21 files.
2. Extract unique key strings from `invokeBridge(page, '<key>', …)` calls.
3. For each key, grep `src/common/adapter/ipcBridge.ts` for both `'<key>'`
   literal AND the equivalent dotted-path accessor (e.g. `team.list`).
4. Inspect `ipcBridge.ts` to see how the dotted-path is defined — literally
   every one is a `httpGet/httpPost/httpDelete/httpPatch`, no legacy `bridge.buildProvider`.

## Affected files (21)

### Helpers (5)

- `tests/e2e/helpers/bridge.ts` — the helper itself (kept; the legacy
  protocol is fine on keys that still use it, which appears to be zero on
  this branch).
- `tests/e2e/helpers/httpBridge.ts` — the modern alternative.
- `tests/e2e/helpers/extensions.ts` — 10 `invokeBridge` calls for
  `extensions.get-*`.
- `tests/e2e/helpers/chatAionrs.ts` — 7 calls
  (`mode.get-model-config`, `get-conversation`, `remove-conversation`, etc.).
- `tests/e2e/helpers/chatGemini.ts` — 10 calls (same domain).

### Features (2)

- `tests/e2e/features/conversations/gemini/basic-flow.e2e.ts` — 5 calls.
- `tests/e2e/features/conversations/gemini/mid-conversation-switch.e2e.ts` — 2 calls for
  `acpConversation.getMode.invoke`.

### Specs (14)

- `cron-crud.e2e.ts` — `cron.list-jobs`, `cron.get-job`, `cron.remove-job`.
- `ext-no-extensions.e2e.ts`, `ext-ipc-queries.e2e.ts`, `ext-lifecycle.e2e.ts`,
  `ext-permissions.e2e.ts`, `ext-webui-contrib.e2e.ts` — `extensions.*`.
- `team-*.e2e.ts` (6 files) — `team.list`, `team.create`, `team.get`,
  `team.remove`, `team.ensure-session`.

## Full unique key list (29)

```
acpConversation.getMode.invoke      e2e-full-extension
channel.get-plugin-status           e2e-isolation
conversation.warmup                 e2e-lifecycle
cron.get-job                        e2e-state-check
cron.list-jobs                      ext-feishu
cron.remove-job                     extensions.disable
extensions.enable                   extensions.get-acp-adapters
extensions.get-agents               extensions.get-assistants
extensions.get-loaded-extensions    extensions.get-mcp-servers
extensions.get-permissions          extensions.get-risk-level
extensions.get-settings-tabs        extensions.get-skills
extensions.get-themes               extensions.get-webui-contributions
get-conversation                    hello-world
mode.get-model-config               remove-conversation
team.create                         team.ensure-session
team.get                            team.list
team.remove                         webui.get-status
webui.start                         webui.stop
```

(The `e2e-*` and `ext-feishu`/`hello-world` keys appear to be spec-local
test strings used by `ext-ipc-queries` as invalid-key probes — they are
intentionally broken test inputs and don't need migration.)

## HTTP equivalents (verified in `src/common/adapter/ipcBridge.ts`)

Every business key maps to an HTTP route. Representative sample:

| IPC key | `ipcBridge.ts` line | HTTP equivalent |
|---|---|---|
| `team.list` | 1357 | `GET /api/teams?userId=<>` |
| `team.create` | 1356 | `POST /api/teams` |
| `team.get` | 1360 | `GET /api/teams/:id` |
| `team.remove` | 1361 | `DELETE /api/teams/:id` |
| `team.ensure-session` | 1378 | `POST /api/teams/:id/session` |
| `conversation.warmup` | 84 | `POST /api/conversations/:id/warmup` |
| `extensions.enable` | 361 (partial — `enableSkillsMarket`) | `POST /api/skills/market/enable` |

The other `extensions.get-*` keys don't directly map: the renderer uses
`ipcBridge.extensions.getAssistants` etc. which point at
`GET /api/extensions/<subresource>` per
`aionui-backend/crates/aionui-extension/src/routes.rs:41-51`. So the e2e
migration would call those routes, same as the Assistant verify track did.

## Why the fix is not 1 line

Each call site needs individual attention:

- **Key → HTTP route lookup** per key (I've only done it for the 7 Assistant
  keys).
- **Request shape mapping**: some keys pass `{ id }` as an IPC data payload;
  the HTTP equivalent may need the id in the path or the body (see the
  `DELETE external-paths` body-vs-query bug I hit in the P1-A1 fix).
- **Response shape**: IPC returned raw objects; HTTP wraps in
  `{success,data,…}`. `httpInvoke` already unwraps `data`, but tests that
  used `invokeBridge<null>` to detect "not found" may behave differently
  under HTTP (404 vs `data: null`).
- **Request shape surprises**: `cron.remove-job` passes `{jobId}` as IPC
  data; backend probably expects `DELETE /api/cron/jobs/:jobId` (path
  param). Have to read each backend route signature.

## Risk assessment

- **All 21 files currently test as "Class E test-infra" failures** under
  the current codebase, same way Assistant tests P2-3/P1-20/P1-21 were
  failing.
- **Unless these specs are run (they aren't part of Assistant-verify or
  Skill-pilot runs), the breakage is latent but will bite when:**
  - Someone runs the full e2e suite (not just `settings/skills/` or
    `assistants/`).
  - Someone modifies code in conversation / cron / team / extensions
    domains and the CI gate tries to run those specs.
- **Suggested priority:** P1 (not P0). Unblocks CI-wide e2e, not pilot
  delivery.

## Proposed migration path

Four independent tasks, each ~30–60 min:

### M1: Extensions helpers (`helpers/extensions.ts`, 11 call sites)

Easy — all read-only `GET /api/extensions/<x>`. Pattern is identical to
the Assistant `extensions.getAssistants` fix already shipped. Affects 5
spec files downstream (all `ext-*.e2e.ts`).

### M2: Team helpers (`team-*.e2e.ts`, 6 files, ~15+ call sites)

Slightly more complex — paths are nested (`/api/teams/:id/…`). Need to
check each backend route signature.

### M3: Cron helpers (`cron-crud.e2e.ts`, 3 calls)

Small. `GET /api/cron/jobs`, `GET /api/cron/jobs/:id`, `DELETE …`.

### M4: Conversation helpers (`chatAionrs.ts`, `chatGemini.ts`, gemini specs, ~34 call sites)

Largest surface. `conversation.warmup` and `remove-conversation` have
obvious HTTP equivalents. `mode.get-model-config` and
`acpConversation.getMode.invoke` need source-of-truth lookup.

## Not blocking Phase 1

Phase 1 (Skill-Library + Assistant) is complete and delivered. This audit
is forward-looking: when Module 3+ (conversations, extensions, cron, team
full migration) is scheduled, these e2e helpers must be migrated alongside
the renderer work — following the same owner-pairing pattern the pilot
established (backend-dev for routes, frontend-dev for helpers, e2e-tester
for runs).

Alternatively, all four migrations could land as a single dedicated
"e2e-infrastructure sweep" task before any further module work — this is
cheaper because the pattern is now well-understood (P1-A1 established it).

**Recommendation:** bundle M1+M2+M3+M4 into a single "e2e-infra-sweep"
ticket, assign to frontend-dev in the next work session. Estimated total
effort: 2-3 hours.
