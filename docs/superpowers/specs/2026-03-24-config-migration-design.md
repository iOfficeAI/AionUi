# Config Migration: Electron → Node Server

**Date**: 2026-03-24
**Status**: Draft (rev 2)
**Scope**: `src/process/utils/configMigration.ts` + `src/process/utils/initStorage.ts`

## Background

AionUi runs in two environments:

| Environment            | DataDir                                                             | Config file path (macOS)                       |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| Electron desktop       | `app.getPath("userData")` → `~/Library/Application Support/AionUi/` | `~/.aionui-config/aionui-config.txt` (symlink) |
| Node standalone server | `~/.aionui-server/`                                                 | `~/.aionui-server/config/aionui-config.txt`    |

The directories are intentionally isolated. However, users who already have a configured desktop app should not need to reconfigure the server from scratch. This feature enables migration of relevant config keys from the Electron data directory to the Node server data directory.

## Goals

1. On first server startup, automatically migrate relevant config keys from the Electron config file (if present) to the server config file.
2. Support manual import from an arbitrary config file path via environment variable, with optional overwrite.

## Non-goals

- UI-based import (out of scope for this iteration).
- Continuous sync between Electron and server configs.
- Migrating chat history, conversation data, or other non-config storage.

---

## Design

### New file: `src/process/utils/configMigration.ts`

Responsible for:

- Resolving the Electron config file path per platform and environment.
- Reading and decoding the source config file (same base64+JSON encoding as `JsonFileBuilder`).
- Filtering keys against the migratable whitelist.
- Writing allowed keys to the server `configFile`, with skip-or-overwrite control.
- Tracking the one-time auto-migration via a migration flag.

### Changes to `src/process/utils/initStorage.ts`

Call the two migration functions after `migrateLegacyData()` and after `ConfigStorage.interceptor(configFile)`. See "initStorage Call Order" section for details and rationale.

---

## Migratable Key Whitelist

```typescript
const MIGRATABLE_KEYS: (keyof IConfigStorageRefer)[] = [
  'model.config',
  'gemini.config',
  'acp.config',
  'tools.imageGenerationModel',
  'mcp.config', // builtin entries (builtin: true) are skipped — paths are machine-local
  'acp.customAgents',
];
```

Keys intentionally excluded (desktop/UI-only or caches):

- `language`, `theme`, `colorScheme`, `customCss`, `css.themes`, `css.activeThemeId`
- `webui.desktop.*`
- `system.closeToTray`, `system.notificationEnabled`, `system.cronNotificationEnabled`
- `acp.cachedModels` — transient cache, not configuration
- All `migration.*` flags

**Known limitation**: Non-builtin `mcp.config` entries with `stdio` transports may contain absolute paths to locally-installed tools. These are user-managed entries and are migrated as-is; paths may not be valid on the target machine if server and desktop run on different machines.

---

## Electron Config Path Resolution

The Node server cannot import Electron's `app` module. Paths are derived from OS conventions.

**App name**: The Electron app name is `AionUi` in packaged builds and `AionUi-Dev` in development (set via `app.setName("AionUi-Dev")` in `configureChromium.ts` when `!app.isPackaged`).

**Key asymmetry**: The server uses `IS_PACKAGED` env var to know its own packaged state, but that does not necessarily reflect which Electron build the user ran. On macOS, the symlink name encodes the Electron app's packaged state — not the server's. To avoid silent misses, the auto-migration resolver **tries both candidate paths** and uses the first one that exists.

```typescript
// macOS: CLI-safe symlinks created by Electron (try both, use first that exists)
//   ~/.aionui-config/aionui-config.txt          (packaged Electron)
//   ~/.aionui-config-dev/aionui-config.txt      (dev Electron)

// Windows: %APPDATA%\<appName>\config\aionui-config.txt
//   appName = 'AionUi' | 'AionUi-Dev'  (same try-both strategy)

// Linux: ~/.config/<appName>/config/aionui-config.txt
//   appName = 'AionUi' | 'AionUi-Dev'  (same try-both strategy)
```

When `IMPORT_CONFIG_FROM` is provided manually, path resolution is bypassed entirely — the user supplies the exact path.

---

## Entry Points

### 1. Auto-migration (once, on first startup)

```
Function: migrateFromElectronConfig()
```

- Checks migration flag `migration.electronConfigImported` in server configFile.
- If flag is set → skip.
- Resolves Electron config path for current platform + IS_PACKAGED.
- If file does not exist → skip (user may not have the desktop app).
- Reads and decodes source file.
- If decoded result is an empty object `{}` (file missing, corrupted, or truly empty): log a warning, do **not** set the migration flag (so next startup retries), return early.
- For each key in `MIGRATABLE_KEYS`: if key exists in source AND key is absent in server config → write to server config.
- For `mcp.config`: filter out entries where `builtin === true` before writing. Note: `ensureBuiltinMcpServers()` runs later in `initStorage` and would recreate builtin entries regardless; this filter is a belt-and-suspenders measure.
- Sets `migration.electronConfigImported = true`.
- Errors are caught and logged as warnings — never block server startup.
- If the process crashes after some keys are written but before the flag is set: safe — next startup retries, and already-written keys are protected by the skip-if-absent logic.

### 2. Manual import (env var, every startup)

```
Environment variables:
  IMPORT_CONFIG_FROM=/absolute/path/to/aionui-config.txt
  IMPORT_CONFIG_OVERWRITE=true    # optional, default: false
```

```
Function: importConfigFromFile(sourcePath: string, overwrite: boolean)
```

- Runs every startup when `IMPORT_CONFIG_FROM` is set (no migration flag check).
- If `IMPORT_CONFIG_FROM` is a relative path, resolve against `process.cwd()` and log a warning recommending absolute paths.
- Reads and decodes the specified file.
- If decoded result is `{}` (missing, corrupted, or empty): log a warning, skip import.
- For each key in `MIGRATABLE_KEYS`:
  - `overwrite=false`: skip if key already exists in server config.
  - `overwrite=true`: always write.
- For `mcp.config`: filter out `builtin === true` entries regardless of overwrite.
- Errors are caught and logged as warnings — never block server startup.

---

## `initStorage` Call Order

Migration functions must run **after** `migrateLegacyData()` and **after** `ConfigStorage.interceptor(configFile)` is called. Reason: `migrateLegacyData()` copies the entire old temp directory into the config directory, which could overwrite keys written by migration. The `ConfigStorage.interceptor` call makes `configFile` the operative storage; reads before this point would go to uninitialized storage.

```typescript
const initStorage = async () => {
  // 1. Legacy data migration (temp → userData/config)
  await migrateLegacyData();

  // 2. Ensure directories exist
  ensureDirectory(getHomePage());
  ensureDirectory(getDataPath());

  // 3. Initialize storage interceptors
  ConfigStorage.interceptor(configFile);
  ChatStorage.interceptor(chatFile);
  ChatMessageStorage.interceptor(chatMessageFile);
  EnvStorage.interceptor(envFile);

  // 4a. Auto-migrate from Electron config (once, after storage is ready)
  await migrateFromElectronConfig();

  // 4b. Manual import from specified path (if env var present)
  const importFrom = process.env.IMPORT_CONFIG_FROM;
  if (importFrom) {
    const overwrite = process.env.IMPORT_CONFIG_OVERWRITE === 'true';
    await importConfigFromFile(importFrom, overwrite);
  }

  // 5. MCP init, assistant init, database init...
  // ...rest of initStorage unchanged
};
```

---

## Error Handling

All migration/import functions must:

- Wrap the entire body in try/catch.
- On error: `console.warn('[AionUi] Config migration failed:', error)` — never throw.
- Log success with key names at debug level for traceability.

---

## Type System

Add to `IConfigStorageRefer` in `src/common/config/storage.ts`:

```typescript
/** Migration flag: Electron desktop config has been imported to server config */
'migration.electronConfigImported'?: boolean;
```

Without this, `configFile.get('migration.electronConfigImported')` will be a TypeScript type error under strict mode.

---

## Testing

Unit tests in `tests/unit/process/utils/configMigration.test.ts`:

- `getElectronConfigFilePath()` returns correct paths per platform × packaged combination (tries both `AionUi` and `AionUi-Dev` candidates).
- `migrateFromElectronConfig()`:
  - skips when migration flag already set.
  - skips when source file does not exist.
  - does not set migration flag when source file decodes to `{}` (corrupted/empty).
  - migrates only whitelisted keys.
  - does not overwrite existing server config keys.
  - filters `builtin: true` from `mcp.config`.
  - sets migration flag after success.
- `importConfigFromFile()`:
  - skips existing keys when `overwrite=false`.
  - overwrites existing keys when `overwrite=true`.
  - filters `builtin: true` from `mcp.config` regardless of overwrite.
  - handles missing file gracefully (warn, no throw).
  - handles corrupted file gracefully (warn, no throw, no partial write).
  - resolves relative path against `process.cwd()` with a warning.

---

## Future Extensions

- WebUI "Import config" button (calls `importConfigFromFile` via IPC).
- Support JSON format in addition to the existing base64+JSON encoding.
- Per-key selection UI for choosing which keys to import.
