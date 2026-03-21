# rust-design: Design Sub-Workflow

Analyze a TypeScript module and produce a complete Rust API design document.

## Prerequisites

- The target module is identified (user specifies which module)
- `overview.md` and `process.md` have been read (Step 0 in SKILL.md)

## Workflow

### Step 1: Read TypeScript Source

Read all source files for the target module (see Module Directory Mapping in SKILL.md). Focus on:

- Public exports (functions, classes, types)
- Internal helper functions that will need Rust equivalents
- npm dependencies used (these will be replaced by Rust crates)

### Step 2: Extract Interface Inventory

Build a complete table of every public function:

| Function | Parameters (with types) | Return Type | Sync/Async | Notes |
| -------- | ----------------------- | ----------- | ---------- | ----- |

Include type definitions (`type`, `interface`) that cross the module boundary.

### Step 3: Map All Callers

Search the entire codebase for imports from this module. For each caller:

- Record the file path and function used
- Note how the return value is consumed (important for type mapping)
- Flag any callers that depend on implementation details (not just the public API)

Use `find_referencing_symbols` or `search_for_pattern` for thorough coverage.

### Step 4: Design Rust API

For each TS function, propose the Rust equivalent:

| TS Function | Rust Function | Rust Params | Rust Return | Binding |
| ----------- | ------------- | ----------- | ----------- | ------- |

Type mapping rules:

- `string` -> `String`
- `number` -> `i64` or `f64` (check usage)
- `boolean` -> `bool`
- `Buffer` / `ArrayBuffer` -> `Buffer` (napi)
- `Promise<T>` -> `AsyncTask<T>` (napi) or `Result<T>`
- `Record<string, T>` -> `HashMap<String, T>` or `serde_json::Value`
- Custom interfaces -> `#[napi(object)]` structs

Decide sync vs async for each function:

- Sync if: pure computation, fast (<1ms), no I/O
- Async if: I/O bound, CPU-heavy (>1ms), currently returns Promise

### Step 5: Design Error Handling

Define a `thiserror` error enum for the module:

```rust
#[derive(thiserror::Error, Debug)]
pub enum ModuleError {
    #[error("description")]
    VariantName,
}
```

Map each variant to the error message JS callers currently see. Ensure backward compatibility.

### Step 6: Plan Migration Strategy

Decide between:

- **All-at-once**: Replace all callers in a single commit. Best for small modules with few callers.
- **Gradual**: Add Rust alongside TS, migrate callers one by one, then remove TS. Best for large modules.

Document the decision and rationale.

### Step 7: Define Test Strategy

For each function, define:

- **Contract test**: same input -> same output for TS and Rust
- **Edge cases**: empty input, maximum size, Unicode, error conditions
- **Migration test**: caller works correctly after switching to Rust

### Step 8: Write design.md

Populate all sections of the module's `design.md` file with the analysis from steps 1-7. Replace every `<!-- TO BE FILLED -->` placeholder with actual content.

### Step 9: Update progress.md

Update the module's `progress.md`:

- Set Design stage status to `complete`
- Record the date
- Fill in the confidence assessment
- Log any important decisions made during analysis
