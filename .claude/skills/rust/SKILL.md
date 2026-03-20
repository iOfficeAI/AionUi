---
name: rust
description: |
  Rust refactoring lifecycle: design, implement, benchmark, migrate TS->Rust (napi-rs).
  Use when: (1) Analyzing a TS module for Rust rewrite (/rust-design),
  (2) Implementing a Rust crate from a design doc (/rust-code),
  (3) Benchmarking TS vs Rust performance (/rust-bench),
  (4) Migrating callers from TS to Rust (/rust-migrate).
---

# Rust Refactoring Skill

Manage the full lifecycle of rewriting TypeScript modules in Rust via napi-rs.

**Announce at start:** "I'm using the rust skill to [design | implement | benchmark | migrate] the [module] module."

## Sub-Workflows

| Command         | Stage          | Reference                                      | Output                                        |
| --------------- | -------------- | ---------------------------------------------- | --------------------------------------------- |
| `/rust-design`  | Design         | [references/design.md](references/design.md)   | Populated `design.md` for the module          |
| `/rust-code`    | Implementation | [references/code.md](references/code.md)       | Working crate + passing contract tests        |
| `/rust-bench`   | Benchmark      | [references/bench.md](references/bench.md)     | Populated `benchmark.md` with comparison data |
| `/rust-migrate` | Migration      | [references/migrate.md](references/migrate.md) | Callers switched, old TS removed              |

## Step 0: Read Context (All Sub-Workflows)

Before executing any sub-workflow, read these files to establish context:

1. `docs/rust_refactor_process/overview.md` -- tech stack, architecture, conventions
2. `docs/rust_refactor_process/process.md` -- the four-stage process definition
3. The target module's `progress.md` -- current status, blockers, decisions

Then proceed to the specific sub-workflow reference file.

## Module Directory Mapping

| Module             | Docs Path                                                | TS Source Path                                                                               |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| credential-crypto  | `docs/rust_refactor_process/modules/credential-crypto/`  | `src/process/channels/utils/credentialCrypto.ts`                                             |
| auth               | `docs/rust_refactor_process/modules/auth/`               | `src/process/webserver/auth/`                                                                |
| fs-bridge          | `docs/rust_refactor_process/modules/fs-bridge/`          | `src/process/bridge/fsBridge.ts`, `src/process/utils/utils.ts`                               |
| database           | `docs/rust_refactor_process/modules/database/`           | `src/process/services/database/`                                                             |
| document-converter | `docs/rust_refactor_process/modules/document-converter/` | `src/common/chat/document/DocumentConverter.ts`, `src/process/services/conversionService.ts` |

## Mandatory Rules

1. **Design before code.** Never write Rust implementation without a completed `design.md`. If the design doc is empty, run `/rust-design` first.
2. **Contract tests are non-negotiable.** Every Rust function must have a test proving its output matches the original TS function for the same input.
3. **No breaking changes.** The Rust implementation must be a drop-in replacement. If the API must change, document the reason in `design.md` and get user approval.
4. **Update progress.md.** At the end of every sub-workflow, update the module's `progress.md` with current status, decisions made, and confidence assessment.
5. **One module at a time.** Complete all four stages for one module before starting the next, unless the user explicitly requests parallel work.
6. **Error contract preservation.** JS callers must receive the same error messages they get today. Map Rust errors through `thiserror` -> `napi::Error` as documented in `overview.md`.

## Quick Checklist

- [ ] Read `overview.md` and `process.md` before starting
- [ ] Checked module's `progress.md` for current status
- [ ] Following the correct sub-workflow reference file
- [ ] Not skipping any stage (design -> code -> bench -> migrate)
- [ ] Contract tests written and passing
- [ ] `progress.md` updated at end of work
