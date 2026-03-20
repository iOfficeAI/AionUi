# Auth Module -- Progress

## Status

| Stage          | Status   | Date       | Notes                                                                                               |
| -------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Design         | complete | 2026-03-20 | Internal refactoring strategy; 12 functions migrated, 8 remain as TS orchestrators                  |
| Implementation | complete | 2026-03-20 | aionui-auth crate + napi binding; 44 Rust unit tests + 52 contract tests passing                    |
| Benchmark      | complete | 2026-03-20 | JWT 100-180x faster; hashPassword 12.6x; session/secret gen 6.5x; validation ~same                  |
| Migration      | complete | 2026-03-20 | AuthService + resetPasswordCLI switched to Rust; bcryptjs/jsonwebtoken -> devDeps; 1225 tests green |

## Milestones

| Milestone           | Target | Actual     | Status                                                                             |
| ------------------- | ------ | ---------- | ---------------------------------------------------------------------------------- |
| design.md complete  | --     | 2026-03-20 | done                                                                               |
| Crate compiles      | --     | 2026-03-20 | done                                                                               |
| Contract tests pass | --     | 2026-03-20 | done                                                                               |
| Benchmark complete  | --     | 2026-03-20 | done                                                                               |
| Callers migrated    | --     | 2026-03-20 | done                                                                               |
| Old TS removed      | --     | 2026-03-20 | done (bcryptjs/jsonwebtoken moved to devDeps; AuthService TS kept as orchestrator) |

## Decision Log

| Date       | Decision                                            | Rationale                                                                                                                |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2026-03-20 | Internal refactoring strategy (callers unchanged)   | AuthService has 6+ callers; changing import paths is unnecessary since the class stays as an orchestrator                |
| 2026-03-20 | bcrypt -> argon2 for new hashes, keep bcrypt verify | argon2 is stronger and configurable; existing bcrypt hashes in DB must remain verifiable during transition               |
| 2026-03-20 | JWT secret passed as parameter to Rust functions    | Secret management depends on DB (UserRepository) and env vars; keeping it in TS avoids mixing concerns                   |
| 2026-03-20 | Stateful parts (blacklist, timers) stay in TS       | In-memory Map + setInterval are Node.js patterns; Rust gains nothing from managing JS runtime timers                     |
| 2026-03-20 | verify_jwt returns Option (not Result)              | TS verifyToken catches all JWT errors and returns null; throwing would break callers expecting null on invalid tokens    |
| 2026-03-20 | hash_password and verify_password are async napi    | argon2 hashing is deliberately slow (~100ms); blocking the event loop would stall the Express server                     |
| 2026-03-20 | sha256_hex exposed for blacklist token hashing      | Replaces Node.js crypto.createHash('sha256'), allowing full removal of crypto import for hash operations                 |
| 2026-03-20 | resetPasswordCLI.ts included in migration scope     | It uses bcryptjs independently (salt 10); must switch to Rust hash_password to allow removing bcryptjs from package.json |
| 2026-03-20 | napi Task trait for async password ops              | Uses libuv thread pool via Task trait instead of tokio; avoids extra dependency and aligns with napi-rs best practices   |
| 2026-03-20 | JWT cross-compatibility verified (TS<->Rust)        | 52 contract tests confirm TS jwt.sign tokens are verifiable by Rust and vice versa; same HS256 algorithm, iss/aud claims |
| 2026-03-20 | bcryptjs/jsonwebtoken moved to devDependencies      | Contract tests and benchmarks still need them for comparison; production code no longer imports them                     |
| 2026-03-20 | AuthService.ts kept as thin orchestrator            | Stateful logic (blacklist, JWT secret cache, timers) stays in TS; crypto ops delegate to @aionui/native                  |

## Blockers

| Blocker | Severity | Status | Resolution |
| ------- | -------- | ------ | ---------- |
| --      | --       | --     | --         |

## Confidence Assessment

| Aspect            | Level          | Notes                                                                                                            |
| ----------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| API compatibility | High           | 1225 tests green; zero caller changes needed; AuthService public API unchanged                                   |
| Performance gain  | High           | JWT 100-180x faster (every request); hashPassword 12.6x; memory 193x less                                        |
| Migration risk    | Realized: Zero | Internal refactoring only; all tests pass; tsc/lint/format clean; bcryptjs/jsonwebtoken removed from prod bundle |
