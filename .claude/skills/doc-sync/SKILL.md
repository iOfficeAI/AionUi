---
name: doc-sync
description: |
  Track uncommitted file changes and update related project documentation.
  Use when: (1) After completing a development task, (2) User says "/doc-sync",
  (3) Before committing, to ensure docs are up to date,
  (4) User asks to "sync docs" or "update docs for my changes".
---

# Doc Sync Skill

Scan uncommitted changes, identify which documentation is affected, and update it.

**Announce at start:** "I'm using doc-sync to update documentation based on your uncommitted changes."

## Workflow

### Step 1: Scan Changes

```bash
git status -s
git diff --name-only
git diff --cached --name-only
```

Collect all modified, added, and deleted files (staged + unstaged).

### Step 2: Classify Changes

Map each changed file to a documentation area using the rules below. A single file may map to multiple doc areas.

#### Mapping Rules

| Changed File Pattern | Documentation Target | Action |
|---------------------|---------------------|--------|
| `native/crates/aionui-auth/**` | `docs/rust_refactor_process/modules/auth/progress.md` | Update implementation/benchmark status |
| `native/crates/aionui-db/**` | `docs/rust_refactor_process/modules/database/progress.md` | Update implementation/benchmark status |
| `native/crates/aionui-doc/**` | `docs/rust_refactor_process/modules/document-converter/progress.md` | Update implementation/benchmark status |
| `native/crates/aionui-cred/**` | `docs/rust_refactor_process/modules/credential-crypto/progress.md` | Update implementation/benchmark status |
| `native/crates/aionui-fs/**` | `docs/rust_refactor_process/modules/fs-bridge/progress.md` | Update implementation/benchmark status |
| `src/process/webserver/auth/**` | `docs/rust_refactor_process/modules/auth/design.md` | Check if TS interface changed; flag if design.md needs revision |
| `src/process/services/database/**` | `docs/rust_refactor_process/modules/database/design.md` | Check if TS interface changed; flag if design.md needs revision |
| `src/common/chat/document/**` | `docs/rust_refactor_process/modules/document-converter/design.md` | Check if TS interface changed; flag if design.md needs revision |
| `src/process/channels/utils/credentialCrypto.ts` | `docs/rust_refactor_process/modules/credential-crypto/design.md` | Check if TS interface changed; flag if design.md needs revision |
| `src/process/bridge/fsBridge.ts` | `docs/rust_refactor_process/modules/fs-bridge/design.md` | Check if TS interface changed; flag if design.md needs revision |
| `tests/bench/**` | Corresponding module's `benchmark.md` | Update benchmark data if results changed |
| `.claude/skills/**` | `AGENTS.md` Skills Index table | Verify skill registration is up to date |
| `docs/rust_refactor_process/overview.md` | -- | Informational: core reference doc changed |
| `docs/conventions/**` | `AGENTS.md` | Check if conventions section needs sync |

If a changed file doesn't match any pattern, skip it -- not every change needs doc updates.

### Step 3: Read Affected Docs

For each matched documentation file, read its current content. Compare against the actual changes to determine what's stale or missing.

### Step 4: Update Documentation

For each affected doc, apply the appropriate update:

**progress.md updates:**
- Set the current stage status based on what exists in the codebase (e.g., if the Rust crate now compiles, mark Implementation as `in progress`)
- Record today's date
- Add decision log entries for significant choices visible in the diff
- Update confidence assessment if warranted

**design.md flags:**
- If a TS source function signature changed, warn the user: "The TS interface for [module] has changed since the design was written. Run `/rust-design` to refresh."
- Do NOT silently modify design.md -- it requires the full design workflow

**benchmark.md updates:**
- If benchmark scripts changed, note that results may need re-running
- If new benchmark data files exist, incorporate the numbers

**AGENTS.md updates:**
- If a new skill directory was added, ensure it appears in the Skills Index table
- If a skill's SKILL.md description changed, sync the table entry

### Step 5: Report

Present a summary to the user:

```
Documentation sync complete:
- Updated: [list of files updated with brief description of what changed]
- Flagged: [list of docs that need manual attention, with reason]
- Skipped: [count of changed files with no doc mapping]
```

## Rules

- **Read before write.** Always read the current doc content before modifying.
- **No silent design changes.** If the TS interface changed, flag it for `/rust-design` -- don't patch `design.md` yourself.
- **Preserve existing content.** Only update fields that are affected by the code changes. Don't overwrite manual notes or decisions.
- **Date accuracy.** Use today's date when updating status fields. Never use placeholder dates.
- **Be conservative.** If you're unsure whether a doc needs updating, flag it rather than changing it.
