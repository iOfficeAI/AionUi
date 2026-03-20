# rust-migrate: Migration Sub-Workflow

Replace all TypeScript callers with the Rust implementation and remove old code.

## Prerequisites

- Benchmark stage is complete (performance validated)
- `design.md` migration plan section is filled
- All contract tests are passing
- The module's `progress.md` shows Benchmark stage as `complete`

## Workflow

### Step 1: Review Migration Plan

Re-read the "Migration Plan" section of the module's `design.md`. Confirm:

- Switch strategy (all-at-once vs gradual)
- Backward compatibility requirements
- Any callers that need special handling

If the plan calls for gradual migration, identify the migration order for callers.

### Step 2: Replace Callers

For each caller identified in `design.md`:

1. Change the import from the TS module to the Rust binding
2. Adjust any type annotations if the Rust API uses slightly different types (should be minimal per design)
3. If a compatibility shim is needed, create a thin TS wrapper that delegates to the Rust addon

Example:

```typescript
// Before
import { hashPassword } from '@process/webserver/auth/service/AuthService';

// After
import { hashPassword } from '@native/aionui-auth';
```

Track each replacement to ensure none are missed.

### Step 3: Run Full Test Suite

```bash
bun run test
```

Every existing test must pass. If a test fails:

1. Check if it's testing TS implementation internals (mock-based tests that assume TS structure)
2. If so, update the test to work with the Rust implementation
3. If the failure is a genuine behavior difference, this is a bug -- fix the Rust implementation, not the test

Also run:

```bash
bun run lint:fix
bun run format
bunx tsc --noEmit
```

### Step 4: Remove Old Code

Once all tests pass with the Rust implementation:

1. Delete the old TS source files for this module
2. Remove unused npm dependencies from `package.json` (e.g., `better-sqlite3`, `bcryptjs`)
3. Run `bun install` to update the lockfile
4. Run the test suite again to confirm nothing depended on the removed packages

Be cautious: check that no other module imports from the deleted files before removing them.

### Step 5: Update progress.md

Update the module's `progress.md`:
- Set Migration stage status to `complete`
- Record the date
- Document any deviations from the original migration plan
- Set final confidence assessment
- Mark all milestones as done

### Step 6: Prepare for Commit

The changes are ready for the `commit` skill. Suggest a commit message:

```
refactor(<module>): migrate to Rust napi-rs implementation

Replace TypeScript <module> with Rust crate (napi-rs).
- <key change 1>
- <key change 2>
- Remove <old dependency>
```

Inform the user that they can run `/commit` to finalize.
