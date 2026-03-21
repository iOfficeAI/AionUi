# Auth Module -- Rust Design

> Source: `src/process/webserver/auth/service/AuthService.ts`
> Rust crate: `native/crates/aionui-auth`
> Design date: 2026-03-20

## 1. TypeScript Interface Analysis

**Source files:**

- `src/process/webserver/auth/service/AuthService.ts` -- core auth logic (505 lines)
- `src/process/webserver/auth/repository/UserRepository.ts` -- DB access layer (stays in TS)
- `src/process/webserver/auth/middleware/AuthMiddleware.ts` -- Express middleware (stays in TS)
- `src/process/webserver/auth/middleware/TokenMiddleware.ts` -- token extraction middleware (stays in TS)
- `src/process/webserver/auth/repository/RateLimitStore.ts` -- in-memory rate limit (stays in TS)

**npm dependencies replaced:**

| npm Package    | Version  | Rust Replacement           | Notes                                                 |
| -------------- | -------- | -------------------------- | ----------------------------------------------------- |
| `bcryptjs`     | `^2.4.3` | `argon2` + `bcrypt` crates | argon2 for new hashes; bcrypt crate for legacy verify |
| `jsonwebtoken` | `^9.0.2` | `jsonwebtoken` crate       | Same HMAC-SHA256 flow, RFC 7519 compatible            |
| (Node crypto)  | built-in | `rand`, `subtle`           | randomBytes, timingSafeEqual                          |

**Function signatures (AuthService public API):**

| TS Function                | Parameters                                                   | Return Type                              | Sync/Async | Notes                                                    |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ---------- | -------------------------------------------------------- |
| `hashPassword`             | `password: string`                                           | `Promise<string>`                        | async      | bcrypt 12 rounds; migrates to argon2                     |
| `verifyPassword`           | `password: string, hash: string`                             | `Promise<boolean>`                       | async      | bcrypt.compare; must also support argon2 hashes          |
| `generateToken`            | `user: Pick<AuthUser, 'id' \| 'username'>`                   | `string`                                 | sync       | JWT sign with HS256, 24h expiry                          |
| `verifyToken`              | `token: string`                                              | `TokenPayload \| null`                   | sync       | blacklist check + JWT verify; partially stays in TS      |
| `verifyWebSocketToken`     | `token: string`                                              | `TokenPayload \| null`                   | sync       | Same as verifyToken, different error logging             |
| `refreshToken`             | `token: string`                                              | `string \| null`                         | sync       | verifyToken + generateToken; stays in TS (orchestrator)  |
| `generateRandomPassword`   | --                                                           | `string`                                 | sync       | 12-16 chars, 4 categories, Fisher-Yates shuffle          |
| `generateUserCredentials`  | --                                                           | `UserCredentials`                        | sync       | Random username (6-8 chars) + random password            |
| `validatePasswordStrength` | `password: string`                                           | `{ isValid: boolean, errors: string[] }` | sync       | Min 8, max 128, weak password blocklist                  |
| `validateUsername`         | `username: string`                                           | `{ isValid: boolean, errors: string[] }` | sync       | 3-32 chars, alphanumeric + hyphen + underscore           |
| `generateSessionId`        | --                                                           | `string`                                 | sync       | 32 random bytes -> 64 hex chars                          |
| `constantTimeVerify`       | `provided: string, expected: string, hashProvided?: boolean` | `Promise<boolean>`                       | async      | timingSafeEqual or bcrypt compare + 50ms min delay       |
| `blacklistToken`           | `token: string`                                              | `void`                                   | sync       | SHA-256 hash as key; stays in TS (stateful)              |
| `isTokenBlacklisted`       | `token: string`                                              | `boolean`                                | sync       | Check in-memory Map; stays in TS (stateful)              |
| `getJwtSecret`             | --                                                           | `string`                                 | sync       | DB + env + cache; stays in TS (stateful + DB dependency) |
| `invalidateAllTokens`      | --                                                           | `void`                                   | sync       | Rotate JWT secret in DB; stays in TS (DB dependency)     |

**Type definitions:**

```typescript
interface TokenPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

interface UserCredentials {
  username: string;
  password: string;
  createdAt: number;
}
```

**Caller sites:**

| File                                                       | Methods Used                                                                                                                                                                                                | Call Sites | Context                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------ |
| `src/process/webserver/routes/authRoutes.ts`               | hashPassword, verifyPassword (via constantTimeVerify), generateToken, verifyToken, refreshToken, blacklistToken, validatePasswordStrength, generateUserCredentials, invalidateAllTokens, constantTimeVerify | 10+        | Main HTTP route handler; heaviest user     |
| `src/process/webserver/index.ts`                           | hashPassword, generateUserCredentials, getJwtSecret                                                                                                                                                         | 3          | WebUI bootstrap / initial setup            |
| `src/process/bridge/webuiBridge.ts`                        | generateToken                                                                                                                                                                                               | 1          | QR login token generation                  |
| `src/process/bridge/services/WebuiService.ts`              | generateToken, verifyToken                                                                                                                                                                                  | 2          | Session management                         |
| `src/process/webserver/auth/middleware/TokenMiddleware.ts` | verifyToken, verifyWebSocketToken                                                                                                                                                                           | 2          | Request authentication                     |
| `src/process/webserver/auth/middleware/AuthMiddleware.ts`  | validateUsername, validatePasswordStrength                                                                                                                                                                  | 2          | Registration input validation              |
| `src/process/utils/resetPasswordCLI.ts`                    | (independent bcrypt usage, salt 10)                                                                                                                                                                         | 1          | Standalone CLI; separate migration concern |
| `tests/unit/webuiChangeUsername.test.ts`                   | AuthService (mocked)                                                                                                                                                                                        | 6          | Unit tests                                 |

## 2. Rust API Design

**Migration boundary:** AuthService is a mixed class containing both pure computation and stateful/DB-dependent logic. The Rust crate handles only the **pure computational** layer. The TS AuthService remains as a thin orchestrator that delegates crypto operations to `@aionui/native` while retaining state management (blacklist, JWT secret cache) and DB access (UserRepository).

**Function mapping:**

| TS Function                    | Rust Function                | Rust Params                                               | Rust Return          | Sync/Async | Binding   |
| ------------------------------ | ---------------------------- | --------------------------------------------------------- | -------------------- | ---------- | --------- |
| `hashPassword`                 | `hash_password`              | `password: String`                                        | `String`             | async      | `#[napi]` |
| `verifyPassword`               | `verify_password`            | `password: String, hash: String`                          | `bool`               | async      | `#[napi]` |
| `generateToken`                | `generate_token`             | `payload: JwtPayload, secret: String, expires_in: String` | `String`             | sync       | `#[napi]` |
| (part of `verifyToken`)        | `verify_jwt`                 | `token: String, secret: String`                           | `Option<JwtPayload>` | sync       | `#[napi]` |
| `validateUsername`             | `validate_username`          | `username: String`                                        | `ValidationResult`   | sync       | `#[napi]` |
| `validatePasswordStrength`     | `validate_password_strength` | `password: String`                                        | `ValidationResult`   | sync       | `#[napi]` |
| `generateRandomPassword`       | `generate_random_password`   | --                                                        | `String`             | sync       | `#[napi]` |
| `generateUserCredentials`      | `generate_user_credentials`  | --                                                        | `UserCredentials`    | sync       | `#[napi]` |
| `generateSessionId`            | `generate_session_id`        | --                                                        | `String`             | sync       | `#[napi]` |
| `generateSecretKey`            | `generate_secret_key`        | --                                                        | `String`             | sync       | `#[napi]` |
| (part of `constantTimeVerify`) | `constant_time_compare`      | `a: String, b: String`                                    | `bool`               | sync       | `#[napi]` |
| (part of `blacklistToken`)     | `sha256_hex`                 | `input: String`                                           | `String`             | sync       | `#[napi]` |

**Functions that remain in TS AuthService (not migrated to Rust):**

| Function               | Reason                                                                      |
| ---------------------- | --------------------------------------------------------------------------- |
| `getJwtSecret`         | Depends on UserRepository (DB access), process.env, and in-memory cache     |
| `invalidateAllTokens`  | Depends on UserRepository (DB write)                                        |
| `blacklistToken`       | Stateful (in-memory Map + timer); uses `sha256_hex` from Rust               |
| `isTokenBlacklisted`   | Stateful (in-memory Map)                                                    |
| `verifyToken`          | Orchestrates blacklist check (TS) + `verify_jwt` (Rust) + getJwtSecret (TS) |
| `verifyWebSocketToken` | Same orchestration pattern as verifyToken                                   |
| `refreshToken`         | Calls verifyToken + generateToken; pure orchestration                       |
| `constantTimeVerify`   | Orchestrates 50ms min-delay (TS) + delegates compare to Rust                |

**Type mapping:**

| TS Type               | Rust Type (Pure Layer)    | napi Binding Type                  | Notes                               |
| --------------------- | ------------------------- | ---------------------------------- | ----------------------------------- |
| `string`              | `&str` / `String`         | `String`                           | napi auto-converts                  |
| `boolean`             | `bool`                    | `bool`                             | direct mapping                      |
| `number` (timestamp)  | `i64`                     | `i64`                              | JS Date.now() fits i64              |
| `TokenPayload`        | `JwtPayload` struct       | `#[napi(object)] JwtPayload`       | userId + username                   |
| `UserCredentials`     | `UserCredentials` struct  | `#[napi(object)] UserCredentials`  | username + password + createdAt     |
| `{ isValid, errors }` | `ValidationResult` struct | `#[napi(object)] ValidationResult` | isValid: bool + errors: Vec<String> |

**Sync/Async decisions:**

| Function                     | Decision | Rationale                                                           |
| ---------------------------- | -------- | ------------------------------------------------------------------- |
| `hash_password`              | async    | argon2 is deliberately slow (~100ms); must not block the event loop |
| `verify_password`            | async    | argon2/bcrypt verify is CPU-heavy (~100ms)                          |
| `generate_token`             | sync     | JWT sign is fast (<1ms), pure computation                           |
| `verify_jwt`                 | sync     | JWT verify is fast (<1ms), pure computation                         |
| `validate_username`          | sync     | String validation, sub-microsecond                                  |
| `validate_password_strength` | sync     | String checks, sub-microsecond                                      |
| `generate_random_password`   | sync     | RNG + string building, sub-millisecond                              |
| `generate_user_credentials`  | sync     | Calls generate_random_password internally                           |
| `generate_session_id`        | sync     | 32 bytes of RNG -> hex, sub-millisecond                             |
| `generate_secret_key`        | sync     | 64 bytes of RNG -> hex, sub-millisecond                             |
| `constant_time_compare`      | sync     | Pure byte comparison, sub-microsecond                               |
| `sha256_hex`                 | sync     | Single hash, sub-microsecond                                        |

**Rust crate dependencies:**

```toml
[dependencies]
argon2 = "0.5"
bcrypt = "0.16"
jsonwebtoken = "9"
rand = "0.8"
subtle = "2"
sha2 = "0.10"
hex = "0.4"
thiserror = "2"
regex = "1"
```

## 3. Error Handling Strategy

**Error enum:**

```rust
#[derive(thiserror::Error, Debug)]
pub enum AuthError {
    #[error("password hashing failed: {0}")]
    HashFailed(String),

    #[error("password verification failed: {0}")]
    VerifyFailed(String),

    #[error("token signing failed: {0}")]
    TokenSignFailed(String),

    #[error("invalid token")]
    InvalidToken,

    #[error("token expired")]
    TokenExpired,
}
```

**JS-side error mapping:**

| Rust Error Variant | JS-side Behavior (Current)                            | Rust Behavior                                          |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------ |
| `HashFailed`       | bcrypt callback rejects -> Promise rejection          | `napi::Error` from `AuthError` -> JS Promise rejection |
| `VerifyFailed`     | bcrypt callback rejects -> Promise rejection          | `napi::Error` from `AuthError` -> JS Promise rejection |
| `TokenSignFailed`  | jwt.sign throws -> caught by caller                   | `napi::Error` from `AuthError` -> JS throw             |
| `InvalidToken`     | verifyToken catches internally -> returns null        | `verify_jwt` returns `None` (no throw)                 |
| `TokenExpired`     | verifyToken catches TokenExpiredError -> returns null | `verify_jwt` returns `None` (no throw)                 |

Most error paths are non-throwing: `verify_jwt` returns `Option<JwtPayload>` instead of throwing, matching the TS pattern where `verifyToken` catches all errors and returns `null`. Only `hash_password` and `verify_password` can throw (as Promise rejections), matching the current behavior where bcrypt callback errors bubble up.

Validation functions never throw -- they return `ValidationResult { isValid: false, errors: [...] }`.

## 4. FFI Boundary Design

**napi-rs binding pattern:**

```rust
// native/binding/src/auth.rs

use napi::bindgen_prelude::*;
use napi_derive::napi;

// --- Structs ---

#[napi(object)]
pub struct JwtPayload {
    pub user_id: String,
    pub username: String,
}

#[napi(object)]
pub struct UserCredentials {
    pub username: String,
    pub password: String,
    pub created_at: i64,
}

#[napi(object)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
}

// --- Password hashing (async) ---

#[napi]
pub async fn hash_password(password: String) -> Result<String> {
    aionui_auth::hash_password(&password)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn verify_password(password: String, hash: String) -> Result<bool> {
    aionui_auth::verify_password(&password, &hash)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// --- JWT (sync) ---

#[napi]
pub fn generate_token(payload: JwtPayload, secret: String, expires_in: String) -> Result<String> {
    aionui_auth::generate_token(&payload.into(), &secret, &expires_in)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn verify_jwt(token: String, secret: String) -> Option<JwtPayload> {
    aionui_auth::verify_jwt(&token, &secret).map(|p| p.into())
}

// --- Validation (sync) ---

#[napi]
pub fn validate_username(username: String) -> ValidationResult {
    aionui_auth::validate_username(&username).into()
}

#[napi]
pub fn validate_password_strength(password: String) -> ValidationResult {
    aionui_auth::validate_password_strength(&password).into()
}

// --- Generation (sync) ---

#[napi]
pub fn generate_random_password() -> String {
    aionui_auth::generate_random_password()
}

#[napi]
pub fn generate_user_credentials() -> UserCredentials {
    aionui_auth::generate_user_credentials().into()
}

#[napi]
pub fn generate_session_id() -> String {
    aionui_auth::generate_session_id()
}

#[napi]
pub fn generate_secret_key() -> String {
    aionui_auth::generate_secret_key()
}

// --- Crypto utilities (sync) ---

#[napi]
pub fn constant_time_compare(a: String, b: String) -> bool {
    aionui_auth::constant_time_compare(a.as_bytes(), b.as_bytes())
}

#[napi]
pub fn sha256_hex(input: String) -> String {
    aionui_auth::sha256_hex(input.as_bytes())
}
```

**Key binding decisions:**

- `JwtPayload`, `UserCredentials`, `ValidationResult` use `#[napi(object)]` for direct JS object mapping. napi-rs auto-converts camelCase field names at the boundary (Rust `user_id` -> JS `userId`).
- `hash_password` and `verify_password` are `async` napi functions. napi-rs runs them on the libuv thread pool, matching the current Promise-based API.
- `verify_jwt` returns `Option<JwtPayload>` (not `Result`) because the TS version catches all errors and returns `null`. This avoids throwing exceptions for expected conditions (expired tokens, invalid signatures).
- `generate_token` returns `Result<String>` because signing failures are unexpected and should propagate as errors.
- The JWT `secret` and `expires_in` are passed as parameters, not stored in Rust. State management (JWT secret caching, env var fallback) remains in the TS AuthService.

## 5. Migration Plan

**Strategy: Internal refactoring (callers unchanged)**

This module differs from credential-crypto: AuthService is a stateful class with DB dependencies, not a set of pure functions. The migration replaces AuthService's internal implementation while preserving its public API.

**Rationale:** AuthService has 6+ callers across routes, bridges, middleware, and tests. All callers import `AuthService` and call static methods. Changing every caller's import path would be disruptive and unnecessary. Instead, we swap the internals:

- `bcryptjs` calls -> `@aionui/native` hash_password / verify_password
- `jsonwebtoken` calls -> `@aionui/native` generate_token / verify_jwt
- `crypto.randomBytes` calls -> `@aionui/native` generate_session_id / generate_secret_key
- `crypto.timingSafeEqual` -> `@aionui/native` constant_time_compare
- `crypto.createHash('sha256')` -> `@aionui/native` sha256_hex
- Validation logic -> `@aionui/native` validate_username / validate_password_strength
- Password generation -> `@aionui/native` generate_random_password / generate_user_credentials

**Migration steps:**

1. Build and verify aionui-auth crate compiles (`cargo test` passes).
2. Add `aionui-auth` to the binding crate's dependencies; add `mod auth;` to `lib.rs`.
3. Run `bun run build:native` to verify the addon compiles and exports new functions.
4. Modify `AuthService.ts`:
   - Replace `import bcrypt from 'bcryptjs'` with imports from `@aionui/native`.
   - Replace `import jwt from 'jsonwebtoken'` with imports from `@aionui/native`.
   - Remove `import crypto from 'crypto'` where replaced by Rust functions.
   - Rewrite `hashPassword`, `verifyPassword` to delegate to Rust async functions.
   - Rewrite `generateToken` to call Rust `generateToken(payload, secret, expiresIn)`.
   - Rewrite `verifyToken` / `verifyWebSocketToken` to call Rust `verifyJwt(token, secret)` for the JWT part, keeping blacklist check and getJwtSecret in TS.
   - Rewrite `generateRandomPassword`, `generateUserCredentials`, `generateSessionId`, `generateSecretKey` to delegate to Rust.
   - Rewrite `validateUsername`, `validatePasswordStrength` to delegate to Rust.
   - Rewrite `constantTimeVerify` to use Rust `constantTimeCompare` (mode 2) and Rust `verifyPassword` (mode 1), keeping the 50ms delay in TS.
   - Rewrite `blacklistToken` to use Rust `sha256Hex` for hashing, keeping Map and timer in TS.
5. Also update `resetPasswordCLI.ts` to use `@aionui/native` hash_password instead of bcryptjs.
6. Run full test suite (`bun run test`).
7. Remove `bcryptjs` and `jsonwebtoken` from `package.json` dependencies. Remove `@types/bcryptjs` and `@types/jsonwebtoken` from devDependencies.
8. Run `bun run lint:fix && bun run format && bunx tsc --noEmit`.

**bcrypt -> argon2 hash migration:**

Existing users have bcrypt-hashed passwords in the database (`$2a$12$...` format). The Rust `verify_password` function auto-detects the hash algorithm by prefix:

- `$2a$` or `$2b$` -> verify with bcrypt crate
- `$argon2id$` -> verify with argon2 crate
- Other -> return false

New passwords are always hashed with argon2. Transparent re-hash on login (optional enhancement, not required for initial migration):

```typescript
// In authRoutes.ts login handler (future enhancement):
const isValid = await AuthService.verifyPassword(password, user.password_hash);
if (isValid && user.password_hash.startsWith('$2')) {
  // Transparently upgrade bcrypt hash to argon2
  const newHash = await AuthService.hashPassword(password);
  UserRepository.updatePassword(user.id, newHash);
}
```

**Backward compatibility:**

- JWT tokens generated by the TS `jsonwebtoken` npm package must be verifiable by the Rust `jsonwebtoken` crate and vice versa (same HS256 algorithm, same claim structure with `iss`, `aud`, `exp`).
- Existing bcrypt password hashes remain valid; verify_password handles both formats.
- All AuthService public methods retain identical signatures and behavior.
- No caller changes required.

## 6. Test Strategy

**Contract tests** (Vitest, `tests/contract/auth-contract.test.ts`):

Since this is an internal refactoring (callers don't change), contract tests verify the Rust functions match TS behavior at the function level.

| Test Case                               | Input                                  | Expected Output                               | Tests                                        |
| --------------------------------------- | -------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| hash_password produces verifiable hash  | `"myPassword123!"`                     | argon2 hash string (starts with `$argon2id$`) | Hash format + verify(password, hash) == true |
| verify_password with argon2 hash        | password + argon2 hash                 | `true`                                        | New hash format verification                 |
| verify_password with bcrypt hash        | password + bcrypt hash (from bcryptjs) | `true`                                        | Legacy hash backward compatibility           |
| verify_password wrong password          | wrong password + hash                  | `false`                                       | Negative case                                |
| generate_token + verify_jwt roundtrip   | payload + secret + "24h"               | Same payload back                             | JWT cross-compatibility                      |
| generate_token matches TS jwt.sign      | Same payload + secret                  | Both verifiable by both implementations       | TS/Rust JWT interoperability                 |
| verify_jwt with TS-generated token      | Token from TS jwt.sign + same secret   | Valid payload                                 | Backward compatibility                       |
| verify_jwt expired token                | Token with past expiry                 | `null`                                        | Expiry enforcement                           |
| verify_jwt wrong secret                 | Token + different secret               | `null`                                        | Secret mismatch                              |
| verify_jwt invalid string               | `"not.a.jwt"`                          | `null`                                        | Malformed input                              |
| validate_username valid                 | `"admin"`                              | `{ isValid: true, errors: [] }`               | Happy path                                   |
| validate_username too short             | `"ab"`                                 | `{ isValid: false, errors: [...] }`           | Min length                                   |
| validate_username too long              | 33-char string                         | `{ isValid: false, errors: [...] }`           | Max length                                   |
| validate_username invalid chars         | `"user@name"`                          | `{ isValid: false, errors: [...] }`           | Regex check                                  |
| validate_username leading underscore    | `"_user"`                              | `{ isValid: false, errors: [...] }`           | Edge rule                                    |
| validate_password_strength valid        | `"StrongP@ss1"`                        | `{ isValid: true, errors: [] }`               | Happy path                                   |
| validate_password_strength too short    | `"short"`                              | `{ isValid: false, errors: [...] }`           | Min 8 chars                                  |
| validate_password_strength too long     | 129-char string                        | `{ isValid: false, errors: [...] }`           | Max 128 chars                                |
| validate_password_strength weak         | `"password"`                           | `{ isValid: false, errors: [...] }`           | Blocklist check                              |
| generate_random_password format         | --                                     | 12-16 chars, all 4 categories present         | Length + complexity                          |
| generate_user_credentials format        | --                                     | username 6-8 chars, valid password            | Structure validation                         |
| generate_session_id format              | --                                     | 64 hex chars                                  | Length + hex charset                         |
| generate_secret_key format              | --                                     | 128 hex chars                                 | Length + hex charset                         |
| constant_time_compare equal             | `"abc", "abc"`                         | `true`                                        | Equality                                     |
| constant_time_compare not equal         | `"abc", "xyz"`                         | `false`                                       | Inequality                                   |
| constant_time_compare different lengths | `"short", "longer"`                    | `false`                                       | Length mismatch                              |
| sha256_hex correctness                  | `"hello"`                              | Known SHA-256 hex digest                      | Deterministic output                         |

**Edge cases:**

- Empty password string to `hash_password` -- should produce a valid hash (argon2 allows empty input)
- Very long password (10KB) to `hash_password` -- should succeed or return reasonable error
- Unicode passwords (Chinese, emoji) -- hash + verify roundtrip must work
- JWT payload with numeric userId (legacy) -- `verify_jwt` should return userId as string
- Token with missing `iss` or `aud` claims -- `verify_jwt` should return null
- `validate_username` with Unicode characters -- should fail (only ASCII alphanumeric + `-_`)
- `generate_random_password` called 100 times -- all outputs should pass `validate_password_strength`
- `constant_time_compare` with empty strings -- should return true (both empty)

**Migration tests (integration):**

After swapping AuthService internals, the existing test suite serves as the migration test:

- `tests/unit/webuiChangeUsername.test.ts` -- tests AuthService indirectly
- Full `bun run test` (1175+ tests) -- any regression means the migration broke something
- Manual verification: login/logout/change-password/QR-login flows work end-to-end
