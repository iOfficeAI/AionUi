# Conversation to Team Promotion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve the original conversation context when a normal conversation is promoted into a collaborative Team.

**Architecture:** Promote the existing conversation into the Team Leader context instead of creating a parallel empty Leader conversation. Team members continue using isolated conversations, while the original conversation becomes the `conversation_id` of the lead entry inside the Team's serialized `agents` JSON. Existing ad-hoc Team creation remains the fallback until promotion is enabled.

**Tech Stack:** Rust/Axum AionCore, SQLite migrations, React/TypeScript, Electron IPC bridge, Vitest, Cargo tests, i18n.

---

## Scope and invariants

- Never delete or duplicate the source conversation messages.
- Promotion is idempotent: repeated requests return the same Team.
- Source conversation ownership must be checked before any mutation.
- Existing ad-hoc Teams remain readable and deletable.
- Team-member conversations remain isolated; only the Leader context is reused.
- Failed promotion must leave the source conversation and Team tables unchanged.

### Task 1: Confirm existing data relationships

**Files to inspect:** AionCore conversation/team schemas and services; AionUi `TeamChatView`, `TeamPage`, `ChatConversation`, and current ad-hoc mappers.

- Document message ownership, Leader conversation lookup, and Team deletion paths.
- Confirm the current reality: `conversations` has no relational `team_id`, and Team bindings are currently represented in `extra` JSON and `teams.agents[].conversation_id`.
- Produce a compatibility matrix for normal, ad-hoc, promoted, and legacy Teams.

**Verification:** read-only report with exact columns, queries, and call sites.

### Task 2: Add database fields and migration

**AionCore files:** `crates/aionui-db/src/models/team.rs`, `crates/aionui-db/src/models/conversation.rs`, repository implementations, and the next migration under `crates/aionui-db/migrations/`.

- Do not duplicate the source message rows. Prefer a normalized promotion binding or indexed nullable relation only if query analysis justifies it; otherwise update the lead agent's serialized `conversation_id` and source `extra` consistently.
- Add uniqueness needed for one promoted Team per source conversation/user.
- Update row mapping and repository queries.

**TDD:** migration/schema tests first; verify upgrade, fresh schema, duplicate prevention, and rollback behavior where supported.

### Task 3: Implement promotion service and API

**AionCore files:** `crates/aionui-team/src/service.rs`, route module, API DTO module, and route/service integration tests.

Add an idempotent endpoint such as:

```text
POST /api/conversations/:conversation_id/promote-to-team
```

Request fields should include the authenticated user and selected target assistant. Response should include `team_id`, the reused `leader_conversation_id` (the lead agent's conversation id), `origin_conversation_id`, target slot, and whether the Team was newly created.

The transaction must:

1. Validate conversation ownership and existence.
2. Return the existing promoted Team if one is already linked.
3. Resolve the source assistant/model/workspace.
4. Create Team and set the lead agent's `conversation_id` to the original conversation (do not create a duplicate Leader conversation).
5. Add or reuse the selected target member.
6. Roll back all writes on failure.

**Tests:** success, idempotent repeat, cross-user rejection, unknown conversation, missing assistant, target reuse, and transaction failure.

### Task 4: Align AionUi IPC and mapper contracts

**AionUi files:** `packages/desktop/src/common/types/team/`, `teamMapper.ts`, `ipcBridge.ts`.

- Add promotion request/result types.
- Add `team.promoteConversation` IPC adapter.
- Preserve current `team.fromConversation` for fallback compatibility.
- Add mapper tests for complete and malformed backend responses.

### Task 5: Switch the normal conversation flow

**AionUi files:** `ChatConversation.tsx`, `AionrsConversationPanel`, `CollaborationLauncher`, `useAdHocTeamFromConversation`, and the Team status card.

- Add a feature flag for promotion mode.
- On collaboration confirmation, call promotion instead of parallel Team creation when enabled.
- Keep the current conversation route and show the Team association card.
- Ensure the Team Leader view reads the original conversation history.
- Keep ACP and AionRS behavior consistent; exclude read-only, mobile, and Team-owned conversations.

**Tests:** success, existing association, failure/no navigation, team-owned hiding, and source history continuity.

### Task 6: Team view and lifecycle behavior

**AionUi files:** `TeamPage.tsx`, `TeamChatView.tsx`, `TeamSiderSection.tsx`, Team hooks.

- Resolve the lead agent from `teams.agents[].role` and render its original conversation history in Team view.
- Keep member message routing unchanged.
- On disband, preserve and reopen the source conversation.
- Keep ordinary Team deletion behavior unchanged.
- Add tests for Leader history, member isolation, disband recovery, and failed deletion.

### Task 7: Migration, rollout, and rollback

- Run AionCore migration tests and AionUi focused tests.
- Run the full relevant Vitest and Cargo suites.
- Exercise both ACP and AionRS in the isolated Dev profile.
- Enable promotion behind a feature flag initially.
- Keep the current associated-Team path as a fallback until production validation completes.
- Document known environment-only failures separately from feature failures.

## Acceptance criteria

- A normal conversation promoted to Team retains all prior Leader history.
- Reopening the Team shows the same Leader context, with no duplicated messages.
- Additional agents can be added and receive tasks through existing Team mechanisms.
- The original conversation remains accessible and is restored after disband.
- Existing ad-hoc and ordinary Teams continue to work unchanged.
- Ownership, idempotency, rollback, i18n, and focused integration tests pass.
