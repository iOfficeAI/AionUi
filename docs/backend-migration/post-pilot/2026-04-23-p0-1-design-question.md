# P0-1 Reopened — Design Question, Not a 1-File Fix

**Date:** 2026-04-23
**Context:** coordinator attempted to land P0-1 (TC-S-17 duplicate-path
rejection) solo per user's standing "continue推进" instruction. Stopped
before touching code because a product-behavior decision is needed.

## The conflict

The post-pilot list P0-1 frames this as a "small-diff fix": backend's
`POST /api/skills/external-paths` should reject duplicate `path` with a 4xx
so the renderer's `handleAddCustomPath` keeps the Add-Path modal open.

Inspection of `aionui-backend/crates/aionui-extension/src/external_paths.rs`
reveals the current Rust implementation is **designed as upsert**:

- Line 66 doc: _"If a path with the same value already exists, it is updated
  with the new name."_
- Function body (lines 75-82): `find(|p| p.path == path)` → update `name`;
  else append.
- Existing test `add_duplicate_path_updates_name` (line 194-209) **asserts
  the upsert behavior**.
- `enable_skills_market` (line 104) depends on upsert for its idempotency:
  calling enable twice should not grow the list. Test `enable_market_idempotent`
  (line 301) relies on this.

So reject-on-duplicate cannot be a blanket behavior change — it would break
the skills-market enable flow.

## The product question

What SHOULD the contract be?

**Option A — Preserve upsert, make e2e reflect reality.**

- Keep `add_custom_external_path` as upsert.
- Update TC-S-17 to expect the modal to close and the entry's name to
  update silently. UI changes: none.
- Revise the post-pilot P0-1 framing: there is no migration regression;
  the TS baseline likely also upserted, and the e2e test was authored
  against an incorrect assumption.
- Cheapest. Treats "duplicate path" as a legitimate user intent to rename.

**Option B — Reject on duplicate for user-driven adds, keep upsert for
internal callers.**

- Split the function: `add_custom_external_path_strict(name, path)` →
  returns `DuplicatePath` error; kept existing `add_custom_external_path`
  for `enable_skills_market` internal use.
- HTTP handler at `POST /api/skills/external-paths` calls the strict form.
  Market enable continues to use the upsert form.
- Add `ExtensionError::DuplicatePath(String)` and map to
  `StatusCode::CONFLICT` (409).
- Renderer's `handleAddCustomPath` already catches errors and leaves
  modal open — no renderer change beyond ensuring the toast message is
  user-friendly for 409.
- TC-S-17 passes as currently written.
- Costs: ~30 lines of Rust + 2 tests + a thin renderer toast update.

**Option C — Reject globally, refactor market enable to check-first.**

- Make the only `add_custom_external_path` reject duplicates.
- Rewrite `enable_skills_market` to `if !already_enabled { add... }`.
- Breaks the existing `enable_market_idempotent` test assertion that
  only 1 entry exists after 2 enable calls — actually it still passes
  (check-first also yields 1 entry). Let me re-read... yes, it still
  passes with the check-first pattern.
- More invasive than B, no clear benefit over B.

## My recommendation (if forced to pick): Option B

- Preserves existing internal callers' semantics without special casing.
- Matches the user's product intuition that "add duplicate path" is
  probably an error from the UI's perspective.
- TC-S-17 was authored by the e2e-coverage team and presumably reflects
  the intended user contract; honoring it is the default stance.
- Smallest blast radius.

## Why I stopped instead of landing Option B

Three reasons:

1. The post-pilot list framed this as "1-file small fix" — that framing
   was wrong. The actual fix touches backend (new function, new error,
   error mapping, 2 tests) AND a design call on whether to split the
   function. That's a decision, not a routine.

2. The current Rust code has **explicit documentation and a test** that
   say upsert is intentional. Overriding an intentional design without
   user confirmation violates the "investigate before deleting /
   overwriting" safety principle.

3. The user signed off for the day and specifically said "明天我希望
   收到成果". They got the pilot and the Assistant verification —
   the significant deliverables. Reopening a product decision and
   committing code alone before they wake risks pushing a direction
   they didn't approve.

## What needs decision from user

Pick A / B / C above (or a 4th option), then re-spawn a small backend-dev

- frontend-dev team to land it (~1 hour) and e2e-tester to confirm TC-S-17
  flips to PASS.

## Pointers

- Code: `aionui-backend/crates/aionui-extension/src/external_paths.rs`
- Error def: `aionui-backend/crates/aionui-extension/src/error.rs`
- Renderer: `src/renderer/pages/settings/SkillsHubSettings.tsx:209-223`
  (`handleAddCustomPath`)
- Test case to flip: `tests/e2e/features/settings/skills/edge-cases.e2e.ts`
  (or wherever TC-S-17 lives — grep `TC-S-17` under `tests/e2e/`)
- Upstream reference: post-pilot list §P0-1.
