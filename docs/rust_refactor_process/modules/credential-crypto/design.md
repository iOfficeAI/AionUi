# Credential Crypto Module -- Rust Design

> Source: `src/process/channels/utils/credentialCrypto.ts`
> Rust crate: `native/crates/aionui-cred`
> Design date: 2026-03-20

## 1. TypeScript Interface Analysis

**Source files:**

- `src/process/channels/utils/credentialCrypto.ts`

**Function signatures:**

| TS Function | Parameters | Return Type | Sync/Async | Notes |
|-------------|-----------|-------------|------------|-------|
| `isEncryptionAvailable` | -- | `boolean` | sync | Always returns `true`; placeholder for future real encryption |
| `encryptString` | `plaintext: string` | `string` | sync | Base64 encode with `b64:` prefix; fallback to `plain:` on error |
| `decryptString` | `encoded: string` | `string` | sync | Handles `b64:`, `enc:`, `plain:` prefixes + legacy no-prefix |
| `encryptCredentials` | `credentials: Record<string, string \| number \| boolean \| undefined> \| undefined` | same | sync | Only encrypts the `token` field via `encryptString` |
| `decryptCredentials` | `credentials: Record<string, string \| number \| boolean \| undefined> \| undefined` | same | sync | Only decrypts the `token` field via `decryptString` |

**Current encryption scheme:**

- Encoding: Base64 with `b64:` prefix (current format)
- Legacy formats supported for read: `enc:` prefix (old safeStorage), `plain:` prefix, raw unencoded (no prefix)
- Only the `token` field is encrypted in credential objects
- Storage location: `assistant_plugins.config` column (JSON) in SQLite database
- No npm dependencies -- uses only Node.js built-in `Buffer` for Base64

**Caller sites:**

| File | Functions Used | Call Sites | Context |
|------|---------------|------------|---------|
| `src/process/services/database/index.ts` | `encryptCredentials`, `decryptCredentials` | 3 | Encrypt before DB write (upsertChannelPlugin), decrypt after DB read (getChannelPlugins, getChannelPlugin) |
| `src/process/channels/utils/index.ts` | all (re-export) | -- | Barrel re-export via `export * from './credentialCrypto'` |

`isEncryptionAvailable`, `encryptString`, `decryptString` have no external callers -- they are only used internally or as utility re-exports.

## 2. Rust API Design

**Function mapping:**

| TS Function | Rust Function | Rust Params | Rust Return | Sync/Async |
|-------------|--------------|-------------|-------------|------------|
| `isEncryptionAvailable` | `is_encryption_available` | -- | `bool` | sync |
| `encryptString` | `encrypt_string` | `plaintext: &str` | `String` | sync |
| `decryptString` | `decrypt_string` | `encoded: &str` | `String` | sync |
| `encryptCredentials` | `encrypt_credentials` | `credentials: &mut serde_json::Value` | `()` | sync |
| `decryptCredentials` | `decrypt_credentials` | `credentials: &mut serde_json::Value` | `()` | sync |

All functions remain sync -- they are pure computation with zero I/O, sub-microsecond execution time.

**Type mapping:**

| TS Type | Rust Type (Pure Layer) | napi Binding Type | Notes |
|---------|----------------------|-------------------|-------|
| `string` | `&str` / `String` | `String` | napi auto-converts |
| `boolean` | `bool` | `bool` | direct mapping |
| `Record<string, string \| number \| boolean \| undefined> \| undefined` | `serde_json::Value` | `Option<serde_json::Value>` | serde-json feature; `undefined` maps to `None` |

**Design decisions:**

- The pure Rust layer (`aionui-cred`) uses standard Rust types + `serde_json::Value` (no napi types). `serde_json` is a pure Rust crate, so this does not violate the "no napi in core logic" rule.
- `encrypt_credentials` / `decrypt_credentials` take `&mut Value` in-place to avoid cloning the full credentials object. The napi binding layer handles the clone/conversion.
- The `base64` crate (v0.22+) with `engine::general_purpose::STANDARD` replaces `Buffer.from().toString('base64')`.

**Rust crate dependencies:**

```toml
[dependencies]
base64 = "0.22"
serde_json = "1"
```

## 3. Error Handling Strategy

The current TS code **never throws** to callers. All errors are caught internally with `console.error`/`console.warn` and fallback values are returned:

| TS Error Scenario | Current Behavior | Rust Behavior |
|-------------------|-----------------|---------------|
| `encryptString` encoding fails | Returns `plain:${plaintext}` | Won't fail: `base64::encode` is infallible for valid UTF-8 |
| `decryptString` decoding fails (b64:) | Returns `''` | Return `String::new()` on `base64::decode` error |
| `decryptString` decoding fails (enc:) | Returns `''` | Return `String::new()` on `base64::decode` error |
| Empty/null input | Returns `''` or `undefined` | Return `String::new()` or `None` |

Since no errors propagate to callers, the Rust crate does not need a public error enum. Errors are handled internally via `Result` + `.unwrap_or_default()` pattern.

```rust
// No public error enum needed. Internal handling:
pub fn decrypt_string(encoded: &str) -> String {
    // Returns empty string on decode failure, matching TS behavior
}
```

The napi binding functions return direct values (not `napi::Result`), preserving the "never throws" contract.

## 4. FFI Boundary Design

**Binding pattern:**

```rust
// native/binding/src/cred.rs

use napi_derive::napi;
use serde_json::Value;

#[napi]
pub fn is_encryption_available() -> bool {
    aionui_cred::is_encryption_available()
}

#[napi]
pub fn encrypt_string(plaintext: String) -> String {
    aionui_cred::encrypt_string(&plaintext)
}

#[napi]
pub fn decrypt_string(encoded: String) -> String {
    aionui_cred::decrypt_string(&encoded)
}

#[napi]
pub fn encrypt_credentials(credentials: Option<Value>) -> Option<Value> {
    let mut creds = credentials?;
    aionui_cred::encrypt_credentials(&mut creds);
    Some(creds)
}

#[napi]
pub fn decrypt_credentials(credentials: Option<Value>) -> Option<Value> {
    let mut creds = credentials?;
    aionui_cred::decrypt_credentials(&mut creds);
    Some(creds)
}
```

**Key binding decisions:**

- `Option<Value>` handles the `undefined` input/output case (JS `undefined` ↔ Rust `None`).
- `serde_json::Value` requires `napi` crate with `serde-json` feature enabled.
- No `#[napi(object)]` structs needed -- the credential record is dynamic (arbitrary keys).
- All functions are thin adapters with zero business logic.

## 5. Migration Plan

**Strategy: All-at-once**

Rationale: Only 1 caller file (`database/index.ts`) with 3 call sites. Only 2 functions (`encryptCredentials`, `decryptCredentials`) are used externally. The risk is minimal, and a gradual migration would add unnecessary complexity for such a small surface.

**Migration steps:**

1. Change the import in `src/process/services/database/index.ts`:
   ```typescript
   // Before
   import { encryptCredentials, decryptCredentials } from '@process/channels/utils/credentialCrypto';
   // After
   import { encryptCredentials, decryptCredentials } from '@native/binding';
   ```
2. Verify no type annotations need adjustment (both return `Record<...> | undefined`, Rust returns `serde_json::Value | undefined` which is compatible).
3. Run full test suite.
4. Remove `src/process/channels/utils/credentialCrypto.ts`.
5. Update the barrel export in `src/process/channels/utils/index.ts` to remove the re-export line.
6. Verify no other files import from the old path (already confirmed: none do).

**Backward compatibility:**

- The Rust version must handle all 4 format prefixes identically: `b64:`, `enc:`, `plain:`, and legacy no-prefix.
- Encrypted output must use the `b64:` prefix, matching current behavior.
- Empty string and `undefined` inputs must return the same values as the TS version.

## 6. Test Strategy

**Contract tests** (Vitest, `tests/cred-contract.test.ts`):

| Test Case | Input | Expected Output | Tests |
|-----------|-------|----------------|-------|
| Encrypt empty string | `''` | `''` | both TS and Rust return empty |
| Encrypt normal string | `'my-secret-token'` | `'b64:bXktc2VjcmV0LXRva2Vu'` | Base64 correctness + prefix |
| Encrypt Unicode | `'令牌-密钥-🔑'` | `'b64:...'` (valid base64) | Unicode handling |
| Decrypt b64: prefix | `'b64:bXktc2VjcmV0LXRva2Vu'` | `'my-secret-token'` | Current format |
| Decrypt enc: prefix | `'enc:bXktc2VjcmV0LXRva2Vu'` | `'my-secret-token'` | Legacy format compatibility |
| Decrypt plain: prefix | `'plain:my-secret-token'` | `'my-secret-token'` | Plain text passthrough |
| Decrypt no prefix | `'raw-legacy-value'` | `'raw-legacy-value'` | Legacy unencoded passthrough |
| Decrypt invalid base64 | `'b64:!!!invalid!!!'` | `''` | Error handling |
| Decrypt empty string | `''` | `''` | Empty input |
| Encrypt credentials with token | `{ token: 'abc', name: 'test' }` | `{ token: 'b64:YWJj', name: 'test' }` | Only token encrypted |
| Encrypt credentials without token | `{ name: 'test' }` | `{ name: 'test' }` | No token = no change |
| Encrypt credentials undefined | `undefined` | `undefined` | Null passthrough |
| Decrypt credentials roundtrip | encrypt then decrypt | Original credentials | Roundtrip integrity |
| isEncryptionAvailable | -- | `true` | Always true |

**Edge cases:**

- Very long strings (10KB+ token values)
- Credentials with non-string token values (`number`, `boolean`) -- must pass through unchanged
- Credentials with `undefined` token value -- must pass through unchanged
