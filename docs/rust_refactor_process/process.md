# Rust Refactor Process

This document defines the four-stage workflow for migrating each TypeScript module to Rust. Every module follows the same sequence. The `/rust-design`, `/rust-code`, `/rust-bench`, and `/rust-migrate` skills automate each stage respectively.

## Stage 1: Design

**Goal:** Produce a complete `design.md` for the target module before writing any Rust code.

**Inputs:** TypeScript source files, call sites, existing tests.

**Steps:**

1. Read the module's TypeScript source files. Extract every public function signature, class method, and type definition.
2. Trace all call sites across the codebase -- bridges, services, tests, and other modules that import from this module.
3. Map each TypeScript function to a proposed Rust function. Document the type mapping (e.g., `string` -> `String`, `ArrayBuffer` -> `Buffer`, `Promise<T>` -> `AsyncTask<T>`).
4. Decide sync vs async for each function. Rule of thumb: if the TS version is sync and fast, keep it sync in Rust. If it does I/O or is CPU-heavy (>1ms), make it async via napi `AsyncTask`.
5. Design the error enum using `thiserror`. Map each error variant to the JS-side error message the caller currently expects.
6. Define the napi binding pattern -- which functions get `#[napi]`, which use `#[napi(object)]` for structs, and how `Buffer` / `serde_json::Value` cross the boundary.
7. Write the migration plan: will callers switch all at once or gradually? Does the new API need to be backward-compatible with the old one during transition?
8. Define the test strategy: contract tests (Rust output matches TS output for same input), migration tests (callers work with both implementations), and edge case tests.

**Output:** `docs/rust_refactor_process/modules/<module>/design.md` fully populated.

## Stage 2: Implementation

**Goal:** Working Rust crate with napi bindings and passing contract tests.

**Inputs:** Completed `design.md`.

**Steps:**

1. Verify `design.md` exists and is complete. Do not proceed without it.
2. Scaffold the crate directory under `native/crates/<crate-name>/`. Add it to the workspace `Cargo.toml` and the binding crate's dependencies.
3. Implement the pure Rust logic first -- no napi types, just standard Rust structs, enums, and functions. This layer is independently testable with `cargo test`.
4. Add the napi binding layer in the `binding` crate. Each public function gets a thin wrapper that converts napi types to Rust types, calls the pure logic, and converts back.
5. Run `bun run build:native` to verify the addon compiles and loads.
6. Write contract tests in `tests/`: for each function in `design.md`, call both the TS and Rust implementations with identical inputs and assert identical outputs.
7. Update `progress.md` with implementation status.

**Output:** Passing `cargo test` + passing contract tests in Vitest.

## Stage 3: Benchmark

**Goal:** Quantify the performance difference between TS and Rust implementations.

**Inputs:** Working TS implementation + working Rust implementation (both loadable).

**Steps:**

1. Set up a benchmark script that imports both implementations. Use `performance.now()` for JS timing and a warm-up phase to eliminate JIT noise.
2. Establish the TS baseline: run each key operation 1000+ iterations, record p50/p95/p99 latency and memory delta.
3. Run the same operations through the Rust addon under identical conditions.
4. Fill in `benchmark.md` with the results, environment info (CPU, OS, Node version), and a brief conclusion.
5. Update `progress.md` with benchmark status.

**Output:** Populated `benchmark.md` with comparative data.

## Stage 4: Migration

**Goal:** All callers use the Rust implementation; old TS code is removed.

**Inputs:** Passing benchmarks, completed `design.md` migration plan.

**Steps:**

1. Re-read `design.md` section "Migration Plan" to confirm the switch strategy (gradual vs all-at-once).
2. Replace import paths in each caller. If the design calls for a compatibility wrapper, implement it as a thin TS shim that delegates to the Rust addon.
3. Run the full test suite (`bun run test`). Every existing test must pass without modification (unless the test was specifically testing TS internals that no longer exist).
4. Remove the old TS implementation files. Remove now-unused npm dependencies from `package.json`.
5. Run `bun run lint:fix && bun run format && bunx tsc --noEmit` to verify no stale imports or type errors remain.
6. Update `progress.md` with migration status. Mark the module as complete.

**Output:** Clean codebase with no TS remnants for the module; all tests green.

## Cross-Stage Rules

- **Never skip a stage.** Design before code, code before benchmark, benchmark before migration.
- **Design is the source of truth.** If implementation diverges from `design.md`, update the design doc first, then adjust the code.
- **Contract tests are mandatory.** They are the safety net that proves the Rust implementation behaves identically to the TS one.
- **Progress tracking is continuous.** Update `progress.md` at the end of every stage, not just when the module is done.
- **One module at a time.** Complete all four stages for one module before starting the next, unless explicitly parallelized by the team.
