# rust-code: Implementation Sub-Workflow

Implement a Rust crate from a completed design document.

## Prerequisites

- The module's `design.md` is fully populated (all sections filled, no `TO BE FILLED` placeholders)
- `overview.md` has been read for Cargo workspace layout and error conventions
- The module's `progress.md` shows Design stage as `complete`

If `design.md` is incomplete, stop and tell the user to run `/rust-design` first.

## Workflow

### Step 1: Verify Design Completeness

Read the module's `design.md`. Check:

- [ ] Function mapping table is complete
- [ ] Type mapping is defined for every parameter and return value
- [ ] Error enum is specified
- [ ] Migration strategy is chosen
- [ ] Test cases are listed

If any section is missing, inform the user and halt.

### Step 2: Scaffold Crate

Create the crate directory under `native/crates/<crate-name>/`:

```
native/crates/<crate-name>/
├── Cargo.toml
└── src/
    └── lib.rs
```

Add the crate to:

1. `native/Cargo.toml` workspace members
2. `native/binding/Cargo.toml` dependencies

If the `native/` directory or workspace doesn't exist yet, create it following the layout in `overview.md`.

### Step 3: Implement Pure Rust Logic

Write the core module logic in `src/lib.rs` (or split into submodules if needed). Rules:

- No napi types in this layer. Use standard Rust types only.
- Follow the function signatures from `design.md` exactly.
- Implement the error enum from `design.md`.
- Add `#[cfg(test)]` unit tests for each function.
- Keep functions focused -- one function, one responsibility.

Run `cargo test -p <crate-name>` to verify.

### Step 4: Add napi Bindings

In the `native/binding/src/` directory, create a module file for the bindings:

```rust
use napi_derive::napi;
use <crate_name>::*;

#[napi]
pub fn function_name(/* napi-compatible params */) -> napi::Result</* return */> {
    // Convert napi types -> Rust types
    // Call pure logic
    // Convert result back -> napi types
}
```

Rules:

- The binding layer is a thin adapter. No business logic here.
- Use `#[napi(object)]` for struct parameters/returns that map to JS objects.
- Use `Buffer` for binary data crossing the boundary.
- Async functions use `#[napi]` with `async fn` or `AsyncTask`.

### Step 5: Build Verification

```bash
cd native && cargo build
# Then from project root:
bun run build:native   # or equivalent napi build command
```

Verify the `.node` file loads without errors:

```javascript
const addon = require('./native/binding/index.node');
console.log(Object.keys(addon)); // should list exported functions
```

### Step 6: Write Contract Tests

Create test files in the project's `tests/` directory. For each function in `design.md`:

```typescript
import { describe, it, expect } from 'vitest';
import * as tsImpl from '<original-ts-module>';
import * as rustImpl from '<rust-binding>';

describe('<module> contract tests', () => {
  it('<function> produces identical output', () => {
    const input = /* test input from design.md */;
    const tsResult = tsImpl.function(input);
    const rustResult = rustImpl.function(input);
    expect(rustResult).toEqual(tsResult);
  });
});
```

Run `bun run test` and ensure all contract tests pass.

### Step 7: Update progress.md

Update the module's `progress.md`:

- Set Implementation stage status to `complete`
- Record the date
- Note the crate location and any deviations from `design.md`
- Update confidence assessment
