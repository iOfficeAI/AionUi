# Project Layout

## Root Directory

### Rules

- **README translations** → `docs/readme/`, not root. Only main `readme.md` at root
- **Guide documents** (`*_GUIDE.md`, `CODE_STYLE.md`) → `docs/`
- **Config files** (`tsconfig.json`, `package.json`, etc.) stay at root (ecosystem convention)
- **Build artifacts** (`out/`, `node_modules/`) are gitignored

### Target Root Structure

```
project-root/
├── src/                    # Source code
├── tests/                  # Tests
├── docs/                   # All documentation
├── scripts/                # Build and tooling scripts
├── skills/                 # Built-in skill templates (app feature)
├── assistant/              # Built-in assistant presets (app feature)
├── examples/               # Extension development examples
├── resources/              # Static resources (icons, images, installers)
├── public/                 # Vite public assets
├── patches/                # npm patches
├── homebrew/               # Homebrew formula
├── readme.md               # Main README
├── AGENTS.md               # AI agent conventions
├── CLAUDE.md               # Claude-specific config
├── LICENSE
└── ...                     # Build config files
```

### Cleanup Targets

| Action                                     | Files                                                       | Effect             |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------ |
| Move readme translations to `docs/readme/` | `readme_{ch,es,jp,ko,pt,tr,tw}.md`                          | -7 files from root |
| Move guides to `docs/`                     | `CODE_STYLE.md`, `SERVER_DEPLOY_GUIDE.md`, `WEBUI_GUIDE.md` | -3 files from root |

> **Migration rule**: New documentation files → `docs/`, not project root.

---

## `src/` Layout

### Target Structure

```
src/
├── renderer/          # Renderer layer — React UI, no Node.js APIs
├── process/           # Main process layer — all Node.js / Electron business
│   ├── bridge/        #   IPC handlers
│   ├── services/      #   Business logic
│   ├── database/      #   SQLite
│   ├── task/          #   Agent/task management
│   ├── agent/         #   AI platform connections
│   ├── channels/      #   Multi-channel messaging
│   ├── extensions/    #   Plugin system
│   ├── webserver/     #   WebUI server
│   ├── worker/        #   Background workers (fork)
│   └── i18n/          #   Main-process i18n
├── common/            # Shared layer — cross-process types, adapters, utilities
├── preload.ts         # IPC bridge — contextBridge between main ↔ renderer
└── index.ts           # Main process entry point
```

### Current Structure (transitional)

Some main-process modules still live at `src/` root:

```
src/
│ ── Renderer Layer ──────────────────────────────
├── renderer/      # React UI — no Node.js APIs
│
│ ── Main Process Layer ──────────────────────────
├── process/       # Electron APIs, IPC handlers, DB, services
├── agent/         # AI platform connections — TARGET: process/agent/
├── channels/      # Multi-channel messaging — TARGET: process/channels/
├── extensions/    # Extension system — TARGET: process/extensions/
├── webserver/     # Express + WebSocket — TARGET: process/webserver/
├── worker/        # Background workers — TARGET: process/worker/
│
│ ── Middle / Shared Layer ───────────────────────
├── preload.ts     # IPC bridge
├── common/        # Shared across processes
├── adapter/       # Platform adapters — TARGET: common/adapters/
├── shared/        # Minimal config — TARGET: common/
│
│ ── App Entry & Global ──────────────────────────
├── index.ts       # Main process entry point
├── types/         # Global type declarations — TARGET: common/types/
└── utils/         # App-level utilities — TARGET: common/utils/
```

> **Migration rule**: New modules → **target** location. Existing modules migrate incrementally.
