# FS Bridge Module -- Rust Design

> This document will be fully populated by the `rust-design` skill after analyzing the TypeScript source.
> Source: `src/process/bridge/fsBridge.ts`, `src/process/utils/utils.ts`

## 1. TypeScript Interface Analysis

**Source files:**

- `src/process/bridge/fsBridge.ts` (IPC handler implementations)
- `src/common/adapter/ipcBridge.ts` (IPC interface definitions)
- `src/process/utils/utils.ts` (filesystem utilities)

**Function signatures:**

<!-- TO BE FILLED by rust-design -->

| TS Function              | Parameters              | Return Type           | Sync/Async |
| ------------------------ | ----------------------- | --------------------- | ---------- |
| `getFilesByDir`          | `{dir, root}`           | `IDirOrFile[]`        | async      |
| `getImageBase64`         | `{path}`                | `string`              | async      |
| `readFile`               | `{path}`                | `string`              | async      |
| `readFileBuffer`         | `{path}`                | `ArrayBuffer`         | async      |
| `writeFile`              | `{path, data}`          | `boolean`             | async      |
| `createTempFile`         | `{fileName}`            | `string`              | async      |
| `getFileMetadata`        | `{path}`                | `FileMetadata`        | async      |
| `copyFiles`              | `{src, dest}`           | `Result`              | async      |
| `removeEntry`            | `{path}`                | `Result`              | async      |
| `renameEntry`            | `{path, newName}`       | `Result`              | async      |
| `readBuiltinRule`        | `{fileName}`            | `string`              | async      |
| `readBuiltinSkill`       | `{fileName}`            | `string`              | async      |
| `readAssistantRule`      | `{assistantId, locale}` | `string`              | async      |
| `readAssistantSkill`     | `{assistantId, locale}` | `string`              | async      |
| `readDirectoryRecursive` | `dirPath, options`      | `Promise<IDirOrFile>` | async      |

**Caller sites:**

<!-- TO BE FILLED by rust-design -->

## 2. Rust API Design

<!-- TO BE FILLED by rust-design -->

## 3. Error Handling Strategy

<!-- TO BE FILLED by rust-design -->

## 4. FFI Boundary Design

<!-- TO BE FILLED by rust-design -->

## 5. Migration Plan

<!-- TO BE FILLED by rust-design -->

## 6. Test Strategy

<!-- TO BE FILLED by rust-design -->
