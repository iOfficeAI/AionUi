# FS Bridge Module -- Rust Design

> Migrates core filesystem operations from `src/process/utils/utils.ts` to the `aionui-fs` Rust crate.
> The IPC handler layer (`fsBridge.ts`) stays in TypeScript as a thin orchestrator.

## 1. TypeScript Interface Analysis

**Source files:**

- `src/process/utils/utils.ts` — filesystem utility functions (the migration target)
- `src/process/bridge/fsBridge.ts` — IPC handler layer (stays in TS)
- `src/common/adapter/ipcBridge.ts` — IPC interface definitions and types

### Functions Migrating to Rust

| TS Function                | Parameters                                                                  | Return Type           | Sync/Async | Callers                                                               |
| -------------------------- | --------------------------------------------------------------------------- | --------------------- | ---------- | --------------------------------------------------------------------- |
| `readDirectoryRecursive`   | `dirPath, options?: {root, abortController, fileService, maxDepth, search}` | `Promise<IDirOrFile>` | async      | `fsBridge.ts` (getFilesByDir), `conversationBridge.ts` (getWorkspace) |
| `copyDirectoryRecursively` | `src, dest, options?: {overwrite}`                                          | `Promise<void>`       | async      | `applicationBridge.ts`, `initStorage.ts` (×2)                         |
| `verifyDirectoryFiles`     | `dir1, dir2`                                                                | `Promise<boolean>`    | async      | `initStorage.ts`                                                      |
| `ensureDirectory`          | `dirPath`                                                                   | `void`                | sync       | `initStorage.ts` (×2), `resetPasswordCLI.ts`, `database/index.ts`     |

### Functions Staying in TypeScript

| TS Function                | Rationale                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `getTempPath`              | Depends on `app.getPath('temp')` (Electron API)                                         |
| `getDataPath`              | Depends on `app.getPath('userData')` + `ensureCliSafeSymlink` (macOS Electron-specific) |
| `getConfigPath`            | Same as `getDataPath`                                                                   |
| `ensureCliSafeSymlink`     | macOS-only, uses `app.getPath('home')`, `lstatSync`, `readlinkSync`, `symlinkSync`      |
| `copyFilesToDirectory`     | Depends on `getSystemDir()` for temp dir + `AIONUI_TIMESTAMP_SEPARATOR` config constant |
| `generateHashWithFullName` | Unused (no callers outside barrel export); trivial computation, no perf gain            |
| `initFsBridge`             | IPC handler registration (`ipcBridge.fs.*.provider()`), inherently Electron-coupled     |
| All skill handlers         | Depend on `findBuiltinResourceDir`, `getUserSkillsDir` (Electron paths), YAML parsing   |
| `downloadRemoteBuffer`     | Node.js `http`/`https` with streaming, redirect handling, host allowlist                |
| `createZip`                | JSZip integration with IPC data types and cancellation support                          |

### Key Types

```typescript
// From ipcBridge.ts
interface IDirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}
```

### Caller Details

**readDirectoryRecursive:**

1. `fsBridge.ts:216` — `getFilesByDir` IPC handler. Calls with default options (no search, no fileService). Returns `tree ? [tree] : []`.
2. `conversationBridge.ts:311` — `getWorkspace` IPC handler. Calls with full options: `{root, fileService, abortController, maxDepth: 10, search: {text, onProcess}}`. Uses `fileService.shouldIgnoreFile()` callback and `onProcess` for real-time progress updates.

**copyDirectoryRecursively:**

1. `applicationBridge.ts:36` — System directory migration. `await copyDirectoryRecursively(oldDir.cacheDir, cacheDir)`.
2. `initStorage.ts:85` — Legacy data migration. `await copyDirectoryRecursively(oldDir, newDir)`.
3. `initStorage.ts:441` — Builtin skills copy. `await copyDirectoryRecursively(builtinSkillsDir, userSkillsDir, { overwrite: false })`.

**verifyDirectoryFiles:**

1. `initStorage.ts:88` — Post-migration verification. `const isVerified = await verifyDirectoryFiles(oldDir, newDir)`. If true, deletes old dir.

**ensureDirectory:**

1. `initStorage.ts:822-823` — Storage init. `ensureDirectory(getHomePage()); ensureDirectory(getDataPath())`.
2. `resetPasswordCLI.ts:58` — DB path prep. `ensureDirectory(dir)`.
3. `database/index.ts:94` — DB init. `ensureDirectory(dir)`.

## 2. Rust API Design

### Crate: `aionui-fs`

```
native/crates/aionui-fs/
├── Cargo.toml
└── src/
    ├── lib.rs          # module root, error enum, re-exports
    ├── directory.rs    # read_directory_tree, ensure_dir
    ├── copy.rs         # copy_directory, verify_directory_structure
    └── types.rs        # DirOrFile struct
```

### Function Mapping

| TS Function                | Rust Function                | Rust Params                                                                               | Rust Return                 | Binding        |
| -------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- | -------------- |
| `readDirectoryRecursive`   | `read_directory_tree`        | `dir: &str, root: &str, max_depth: u32, skip_names: &[String], search_text: Option<&str>` | `Result<Option<DirOrFile>>` | `AsyncTask`    |
| `copyDirectoryRecursively` | `copy_directory`             | `src: &str, dest: &str, overwrite: bool`                                                  | `Result<()>`                | `AsyncTask`    |
| `verifyDirectoryFiles`     | `verify_directory_structure` | `dir1: &str, dir2: &str`                                                                  | `Result<bool>`              | `AsyncTask`    |
| `ensureDirectory`          | `ensure_dir`                 | `dir_path: &str`                                                                          | `Result<()>`                | sync `#[napi]` |

### Type Mapping

| TypeScript              | Rust                     | Notes                                      |
| ----------------------- | ------------------------ | ------------------------------------------ |
| `string` (path)         | `String`                 | UTF-8 paths                                |
| `boolean`               | `bool`                   |                                            |
| `IDirOrFile`            | `DirOrFile`              | `#[napi(object)]` struct                   |
| `IDirOrFile.children`   | `Option<Vec<DirOrFile>>` | Recursive napi object serialization        |
| `Promise<T>`            | `AsyncTask<T>`           | napi Task trait, runs on libuv thread pool |
| `void` (sync)           | `()`                     | Sync napi function                         |
| `CopyOptions.overwrite` | `bool`                   | Default `true` in binding layer            |

### Sync vs Async Decisions

| Function                     | Decision  | Rationale                                                                                    |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `read_directory_tree`        | **Async** | Recursive `readdir` + `stat` for potentially thousands of entries; blocks event loop if sync |
| `copy_directory`             | **Async** | I/O-heavy bulk copy; can take seconds for large directories                                  |
| `verify_directory_structure` | **Async** | Recursive `readdir` + comparison; similar I/O profile to read_directory_tree                 |
| `ensure_dir`                 | **Sync**  | Single `mkdir` + optional `lstat`/`unlink`; <1ms; TS version already uses sync fs ops        |

### Design Decisions for `read_directory_tree`

The TS `readDirectoryRecursive` has complex callback-driven features:

1. **`fileService.shouldIgnoreFile(path)`** — JS callback, cannot be called efficiently from Rust. Replaced by `skip_names: Vec<String>` parameter (list of directory/file names to skip, e.g. `["node_modules", ".git"]`). Callers pre-process their ignore logic into this list.

2. **`search.onProcess` callback** — Real-time progress reporting to UI. Dropped in Rust version. Rationale: Rust traversal is expected to be 10-50x faster than Node.js; a <50ms traversal makes streaming progress irrelevant. The complete result is returned at once.

3. **`AbortController`** — Request cancellation. Not implemented in initial Rust version. Rationale: same as above — fast traversal means the operation completes before cancellation arrives. Can be added later via `Arc<AtomicBool>` if needed.

4. **Search behavior** — When `search_text` is provided, `maxDepth` is not decremented (effectively unlimited depth). Only nodes whose `name` contains the search text are included, along with their ancestor directories. This is implemented in Rust.

5. **`node_modules` skip** — Hardcoded in TS. In Rust, `node_modules` is always added to `skip_names` by default.

6. **Sort order** — Children sorted: directories first, then alphabetically by name. Same in Rust.

## 3. Error Handling Strategy

```rust
#[derive(thiserror::Error, Debug)]
pub enum FsError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Cannot copy directory into itself: {0}")]
    SelfCopy(String),

    #[error("Cannot copy directory into its subdirectory: {0} -> {1}")]
    SubdirectoryCopy(String, String),

    #[error("Cannot copy parent directory into child directory: {0} -> {1}")]
    ParentChildCopy(String, String),
}
```

**Error mapping at the napi boundary:**

| Rust Error                  | JS Error Message                                                       | TS Original                                                         |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `FsError::Io`               | `"I/O error: {details}"`                                               | Various `console.error` + throw / return false                      |
| `FsError::SelfCopy`         | `"Cannot copy directory into itself: {path}"`                          | `throw new Error('Cannot copy directory into itself: …')`           |
| `FsError::SubdirectoryCopy` | `"Cannot copy directory into its subdirectory: {src} -> {dest}"`       | `throw new Error('Cannot copy directory into its subdirectory: …')` |
| `FsError::ParentChildCopy`  | `"Cannot copy parent directory into child directory: {src} -> {dest}"` | `throw new Error('Cannot copy parent into child: …')`               |

Note: `readDirectoryRecursive` returns `null` (not an error) for non-existent or non-directory paths. This maps to `Ok(None)` in Rust → `null` in JS.

## 4. FFI Boundary Design

### napi Structs

```rust
#[napi(object)]
pub struct DirOrFile {
    pub name: String,
    pub full_path: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub children: Option<Vec<DirOrFile>>,
}
```

napi-rs serializes `#[napi(object)]` structs recursively to JS objects. The `children` field produces a nested array matching the `IDirOrFile` interface exactly.

**Field name mapping:** napi-rs automatically converts Rust `snake_case` to JS `camelCase` for `#[napi(object)]` structs: `full_path` → `fullPath`, `relative_path` → `relativePath`, `is_dir` → `isDir`, `is_file` → `isFile`.

### AsyncTask Pattern

```rust
pub struct ReadDirectoryTreeTask {
    dir_path: String,
    root: String,
    max_depth: u32,
    skip_names: Vec<String>,
    search_text: Option<String>,
}

#[napi]
impl Task for ReadDirectoryTreeTask {
    type Output = Option<DirOrFile>;      // Rust-side result
    type JsValue = Option<DirOrFile>;     // JS-side value (same, serialized by napi)

    fn compute(&mut self) -> Result<Self::Output> {
        aionui_fs::read_directory_tree(
            &self.dir_path,
            &self.root,
            self.max_depth,
            &self.skip_names,
            self.search_text.as_deref(),
        ).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn read_directory_tree(
    dir_path: String,
    root: Option<String>,
    max_depth: Option<u32>,
    skip_names: Option<Vec<String>>,
    search_text: Option<String>,
) -> AsyncTask<ReadDirectoryTreeTask> {
    let root = root.unwrap_or_else(|| dir_path.clone());
    let max_depth = max_depth.unwrap_or(1);
    let mut skip = skip_names.unwrap_or_default();
    // Always skip node_modules
    if !skip.iter().any(|s| s == "node_modules") {
        skip.push("node_modules".to_string());
    }
    AsyncTask::new(ReadDirectoryTreeTask {
        dir_path, root, max_depth, skip_names: skip, search_text,
    })
}
```

### Sync Function

```rust
#[napi]
pub fn ensure_dir(dir_path: String) -> Result<()> {
    aionui_fs::ensure_dir(&dir_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
```

### TypeScript Declarations (index.d.ts additions)

```typescript
export interface DirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<DirOrFile>;
}

export function readDirectoryTree(
  dirPath: string,
  root?: string | undefined | null,
  maxDepth?: number | undefined | null,
  skipNames?: string[] | undefined | null,
  searchText?: string | undefined | null
): Promise<DirOrFile | null>;

export function copyDirectory(src: string, dest: string, overwrite?: boolean | undefined | null): Promise<void>;

export function verifyDirectoryStructure(dir1: string, dir2: string): Promise<boolean>;

export function ensureDir(dirPath: string): void;
```

## 5. Migration Plan

**Strategy: Internal refactoring** (same as auth module)

Callers of `readDirectoryRecursive`, `copyDirectoryRecursively`, `verifyDirectoryFiles`, and `ensureDirectory` continue to import from `@process/utils`. The barrel export (`src/process/utils/index.ts`) is updated to delegate to the Rust native addon.

### Step-by-step

1. **Build Rust crate** — `aionui-fs` with 4 functions, passing `cargo test`.
2. **Add napi bindings** — AsyncTask wrappers in `binding/src/fs.rs`.
3. **Update `utils.ts`** — Replace function bodies with calls to `@aionui/native`. Keep function signatures identical.
4. **Update `fsBridge.ts`** — The `getFilesByDir` handler already calls `readDirectoryRecursive` from `@process/utils`, so no change needed.
5. **Handle `conversationBridge.ts`** — The `getWorkspace` handler uses `fileService.shouldIgnoreFile` and `search.onProcess`. Two options:
   - (a) Call Rust `readDirectoryTree` with `skipNames`, apply file service filtering in TS post-traversal. Drop `onProcess` since Rust is fast enough.
   - (b) Keep the TS `readDirectoryRecursive` for this one caller and use Rust only for the simple case.
   - **Decision: Option (a).** The performance gain justifies dropping streaming progress. The `fileService` filtering can be applied in TS after Rust returns the tree.
6. **Run full test suite** — All existing tests must pass.
7. **Remove old implementations** — Delete the function bodies in `utils.ts`, keeping only the native delegation wrappers.

### Backward Compatibility

- All callers import from `@process/utils` — no import path changes.
- Function signatures remain identical (parameters, return types).
- `readDirectoryRecursive` wrapper in TS handles the `options` object → flat Rust parameters conversion.
- `ensureDirectory` is sync in both TS and Rust.
- No npm dependencies are removed (all dependencies are Node.js built-ins: `fs`, `path`, `os`).

## 6. Test Strategy

### Contract Tests (`tests/contract/fs-contract.test.ts`)

For each migrated function, call both TS original and Rust implementation with identical inputs and assert identical outputs.

| Function                   | Test Cases                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readDirectoryTree`        | Valid directory with nested files; empty directory; non-existent path (returns null); file path (returns null); maxDepth=0 returns no children; node_modules skipped; custom skip names; search text matching; search with deep nesting |
| `copyDirectory`            | Normal copy; overwrite=true replaces files; overwrite=false skips existing; self-copy throws; subdirectory-copy throws; parent-child-copy throws; empty source directory                                                                |
| `verifyDirectoryStructure` | Identical directories → true; different file count → false; different names → false; nested difference → false; non-existent dirs → false                                                                                               |
| `ensureDir`                | Creates new directory; no-op for existing directory; handles symlink at path; handles file blocking path                                                                                                                                |

### Edge Cases

- Unicode file/directory names
- Very deep directory nesting (100+ levels, if max_depth allows)
- Empty directory
- Permission denied (read-only directory)
- Race condition: file deleted between readdir and stat
- Windows path separators (`\` vs `/`)
- Symlinks in directory tree

### Migration Tests

- Existing `readDirectoryRecursive.test.ts` (6 tests) must pass unchanged after switching to Rust
- `fsBridge.skills.test.ts` must pass unchanged
- `applicationBridge.test.ts` must pass unchanged
- Full test suite (`bun run test`) must be green
