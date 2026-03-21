# Credential Crypto Module -- Benchmark

## Test Environment

| Property   | Value                                     |
| ---------- | ----------------------------------------- |
| OS         | Windows_NT 10.0.26200 x64                 |
| CPU        | 13th Gen Intel Core i5-13500HX (20 cores) |
| RAM        | 39.7 GB                                   |
| Node.js    | v22.12.0                                  |
| Rust       | 1.93.0 (stable)                           |
| Iterations | 10,000 (warmup: 1,000)                    |

## Operation Comparison

| Operation                  | TS p50 | TS p95 | Rust p50 | Rust p95 | Speedup (p50) |
| -------------------------- | ------ | ------ | -------- | -------- | ------------- |
| encryptString (short)      | 300ns  | 800ns  | 300ns    | 400ns    | 1.0x          |
| encryptString (10KB)       | 4.8us  | 17.5us | 5.6us    | 6.2us    | 0.9x          |
| decryptString (b64 short)  | 400ns  | 600ns  | 400ns    | 400ns    | 1.0x          |
| decryptString (b64 10KB)   | 4.0us  | 7.8us  | 22.4us   | 25.9us   | 0.2x          |
| decryptString (enc legacy) | 3.4us  | 5.5us  | 400ns    | 400ns    | 8.5x          |
| encryptCredentials         | 300ns  | 300ns  | 3.1us    | 3.3us    | 0.1x          |
| decryptCredentials         | 600ns  | 700ns  | 6.3us    | 6.6us    | 0.1x          |

## Memory Usage

| Operation                     | TS heap delta (KB) | Rust heap delta (KB) | Notes                                                            |
| ----------------------------- | ------------------ | -------------------- | ---------------------------------------------------------------- |
| 10,000 encrypt/decrypt cycles | 1,224.5            | -786.2               | GC timing makes comparison unreliable for such small allocations |

## Conclusion

For this specific module, Rust does not offer a performance advantage. The reasons are straightforward:

1. **Node.js Buffer is already native.** `Buffer.from().toString('base64')` delegates to V8's C++ layer. The actual compute is already in native code, so Rust's raw speed advantage evaporates.

2. **napi FFI overhead dominates.** Each JS-to-Rust call involves type marshalling (especially `serde_json::Value` serialization for credential objects). For sub-microsecond operations, this crossing cost exceeds the compute time itself.

3. **The enc: legacy speedup is a console.warn artifact.** TS logs a warning on every legacy-format decode; Rust silently processes. This 8.5x difference disappears if the TS console.warn is removed.

**Migration justification is not performance.** This module's value in the Rust rewrite is:

- Proof of concept for the full napi-rs build pipeline and CI integration
- Foundation for future real encryption (aes-gcm) without adding another native npm dependency
- Consistent codebase when other modules (auth, database) are migrated
- The credential-crypto functions are called only during plugin config load/save (not hot-path), so the microsecond-level difference has zero user impact
