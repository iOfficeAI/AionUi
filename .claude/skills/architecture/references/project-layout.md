# Project Layout

## Root Directory

### Rules

- **Workspace root stays minimal**: root keeps shared config, scripts, tests, docs, assets, and package manager files.
- **Desktop app source lives under `packages/desktop/`**: do not add new app runtime code back to the root.
- **README translations** → `docs/readme/`, not root. Only main `readme.md` stays at root.
- **Guide documents** (`*_GUIDE.md`, `CODE_STYLE.md`) → `docs/`
- **Build artifacts** (`out/`, `node_modules/`) are gitignored

### Current Root Structure (M1)

```
project-root/
├── packages/
│   └── desktop/            # Electron desktop workspace
├── tests/                  # Shared test suites
├── docs/                   # All documentation
├── scripts/                # Build and tooling scripts
├── resources/              # Static resources (icons, images, installers)
├── public/                 # Shared Vite public assets
├── patches/                # npm/bun patches
├── homebrew/               # Homebrew formula
├── package.json            # Workspace root config
├── tsconfig.json           # Shared TS config
├── vitest.config.ts        # Shared test config
├── AGENTS.md               # Agent conventions
├── CLAUDE.md               # Claude-specific config
└── ...                     # Other root-level tooling config
```

> **Migration rule**: New desktop runtime modules go under `packages/desktop/`, not the repository root.

---

## `packages/desktop/` Layout

### Workspace Structure

```
packages/desktop/
├── src/
│   ├── renderer/          # Renderer layer — React UI, no Node.js APIs
│   ├── process/           # Main process layer — Node.js / Electron business logic
│   ├── common/            # Shared cross-process code
│   ├── preload/           # IPC bridge entrypoints
│   ├── index.ts           # Main process entry
│   └── types.d.ts         # Ambient declarations
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

### `packages/desktop/src/` Structure

```
packages/desktop/src/
├── renderer/              # React UI, browser-only code
├── process/               # Electron main-process and worker code
│   ├── bridge/            # IPC handlers
│   ├── services/          # Business logic
│   ├── agent/             # AI platform connections
│   ├── channels/          # Multi-channel messaging
│   ├── extensions/        # Plugin system
│   ├── webserver/         # WebUI server
│   └── worker/            # Background workers
├── common/                # Shared types, adapters, utilities
├── preload/               # contextBridge / ipcRenderer exposure
├── index.ts               # Main process entry point
└── types.d.ts             # Ambient declarations
```

### Placement Rules

- New Electron runtime code belongs in `packages/desktop/src/**`.
- Root-level scripts and config may reference `packages/desktop/**`, but should not duplicate app source.
- Tests remain under `tests/**` and should reference desktop source through aliases or `packages/desktop/...` paths.
