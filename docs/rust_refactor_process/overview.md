# Rust Refactor Overview

## Goals

AionUi is migrating five TypeScript modules to Rust via napi-rs. The motivations are threefold:

1. **Performance** -- hot-path operations (crypto hashing, SQLite queries, file I/O, document parsing) become native-speed without the overhead of JS bridge layers like `better-sqlite3` or `bcryptjs`.
2. **Security** -- memory-safe Rust replaces C/C++ native addons; credential handling benefits from Rust's `zeroize` and constant-time primitives.
3. **Build reliability** -- eliminating native npm packages (`better-sqlite3`, `bcryptjs`) removes the most frequent source of cross-platform compilation failures in CI and on developer machines.

## Tech Stack

| Layer                | Choice                       | Notes                                                      |
| -------------------- | ---------------------------- | ---------------------------------------------------------- |
| Rust ↔ Node binding  | **napi-rs** (`@napi-rs/cli`) | Generates `.node` addon; supports async, Buffer, serde     |
| SQLite               | **rusqlite** + bundled       | Replaces `better-sqlite3`; sync API matches current usage  |
| Password hashing     | **argon2** crate             | Replaces `bcryptjs`; stronger algorithm, configurable cost |
| JWT                  | **jsonwebtoken** crate       | Replaces `jsonwebtoken` npm; same HMAC-SHA256 flow         |
| Symmetric encryption | **aes-gcm** + **ring**       | Future-proof credential encryption (currently Base64 only) |
| Excel parsing        | **calamine**                 | Replaces `xlsx-republish`; read-only, fast                 |
| Excel writing        | **rust_xlsxwriter**          | Replaces `xlsx-republish` write path                       |
| Word/DOCX            | **quick-xml** + **zip**      | Replaces `mammoth` (read) and `docx` (write)               |
| Filesystem           | **tokio::fs** or std::fs     | Replaces Node.js `fs/promises`                             |
| Error handling       | **thiserror**                | Structured errors mapped to `napi::Error` at the boundary  |

## Architecture Position

```
┌─────────────────────────────────────────────────────┐
│                   Renderer Process                   │
│              (React, no Node.js APIs)                │
└──────────────────────┬──────────────────────────────┘
                       │ IPC (preload.ts)
┌──────────────────────▼──────────────────────────────┐
│                    Main Process                      │
│   ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│   │ Services │  │ Bridges  │  │  Rust Addon      │  │
│   │ (TS)     │──│ (TS)     │──│  (native/*.node) │  │
│   └──────────┘  └──────────┘  └──────────────────┘  │
│                                        │             │
│                       ┌────────────────┘             │
│                       ▼                              │
│              ┌─────────────────┐                     │
│              │ Cargo Workspace │                     │
│              │  native/        │                     │
│              │  ├─ aionui-db   │                     │
│              │  ├─ aionui-auth │                     │
│              │  ├─ aionui-doc  │                     │
│              │  ├─ aionui-cred │                     │
│              │  └─ aionui-fs   │                     │
│              └─────────────────┘                     │
└─────────────────────────────────────────────────────┘
```

The Rust addon lives in the main process only. Renderer access goes through the existing IPC bridge, unchanged. Worker processes can also load the addon directly if needed.

## Module Priority

Ordered by risk (lowest first) and value (highest first):

| Priority | Module                 | Rationale                                                                     |
| -------- | ---------------------- | ----------------------------------------------------------------------------- |
| 1        | **credential-crypto**  | Smallest surface (4 functions), no external state, ideal proof-of-concept     |
| 2        | **auth**               | Self-contained; bcrypt→argon2 migration is a clear win                        |
| 3        | **fs-bridge**          | Stateless I/O; enables benchmarking of bulk file operations                   |
| 4        | **database**           | Largest surface, highest value; replaces `better-sqlite3` native rebuild pain |
| 5        | **document-converter** | Highest complexity (multiple formats); depends on ecosystem maturity          |

## Cargo Workspace Layout

```
native/
├── Cargo.toml              # workspace root
├── crates/
│   ├── aionui-db/          # rusqlite, migrations, repositories
│   ├── aionui-auth/        # argon2, JWT, session management
│   ├── aionui-doc/         # calamine, quick-xml, document conversion
│   ├── aionui-cred/        # aes-gcm, credential encryption
│   └── aionui-fs/          # filesystem operations, temp files
└── binding/
    └── src/lib.rs           # single napi-rs entry point, re-exports all crates
```

A single `binding` crate produces one `.node` file that re-exports all modules. This avoids loading multiple native addons and simplifies the build pipeline.

## Error Handling Convention

All Rust crates use `thiserror` for internal errors. At the napi boundary, errors are converted:

```rust
// In each crate
#[derive(thiserror::Error, Debug)]
pub enum AuthError {
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("token expired")]
    TokenExpired,
    // ...
}

// In binding crate
impl From<AuthError> for napi::Error {
    fn from(e: AuthError) -> Self {
        napi::Error::from_reason(e.to_string())
    }
}
```

JS callers receive standard `Error` objects with descriptive messages, preserving the current error contract.

## CI Integration Notes

- The Rust build is triggered by `bun run build:native` (wraps `napi build --release`).
- CI caches `native/target/` to avoid full rebuilds.
- The `.node` artifact is platform-specific; CI builds for `win32-x64`, `darwin-arm64`, and `linux-x64`.
- Pre-built binaries are committed to `native/artifacts/` for quick local setup (optional, team decides).
- `bun run test` continues to work unchanged; contract tests import the built `.node` addon.
