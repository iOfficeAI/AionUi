---
name: architecture
description: |
  Project architecture and file structure conventions for all process types.
  Use when: (1) Creating new files or modules, (2) Deciding where code should go,
  (3) Converting single-file components to directories, (4) Reviewing code for structure compliance,
  (5) Adding new bridges, services, agents, or workers.
---

# Architecture Skill

Guide for file placement and structure decisions across the entire Electron project.

**Announce at start:** "I'm using architecture skill to determine the correct location and structure."

## Trigger Conditions

- Creating a new file, component, module, service, bridge, or agent
- Unsure which top-level directory code belongs in
- Adding code that crosses process boundaries
- Reviewing PR for structural consistency

---

# Part 1 — Global Rules

Rules that apply across **all** process layers.

## Repository Root

The project root directory contains source code, configuration, documentation, and application assets. Keep it organized by category.

### Root Directory Rules

- **README translations** belong in `docs/readme/`, not at root. Only the main `readme.md` stays at root (GitHub convention)
- **Guide documents** (`*_GUIDE.md`, `CODE_STYLE.md`, etc.) belong in `docs/`
- **Config files** (`tsconfig.json`, `package.json`, `electron-builder.yml`, etc.) stay at root — this is Node.js/Electron ecosystem convention and unavoidable
- **Build artifacts** (`out/`, `node_modules/`) are gitignored or ephemeral, not counted toward structure

### Target Root Structure

```
项目根/
├── src/                    # Source code
├── tests/                  # Tests
├── docs/                   # All documentation (readme translations, guides, conventions, plans)
├── scripts/                # Build and tooling scripts
├── skills/                 # Built-in skill templates (app feature)
├── assistant/              # Built-in assistant presets (app feature)
├── examples/               # Extension development examples
├── resources/              # Static resources (icons, images, installers)
├── public/                 # Vite public assets
├── patches/                # npm patches
├── homebrew/               # Homebrew formula
├── readme.md               # Main README (GitHub convention)
├── AGENTS.md               # AI agent conventions (all agents)
├── CLAUDE.md               # Claude-specific config
├── LICENSE                 # License
└── ...                     # Build config files (package.json, tsconfig.json, etc.)
```

### Current Root Cleanup Targets

| Action | Files | Effect |
|--------|-------|--------|
| Move readme translations to `docs/readme/` | `readme_{ch,es,jp,ko,pt,tr,tw}.md` | -7 files from root |
| Move guides to `docs/` | `CODE_STYLE.md`, `SERVER_DEPLOY_GUIDE.md`, `WEBUI_GUIDE.md` | -3 files from root |
| Remove build artifacts | `${env.ELECTRON_CACHE}` | -1 file from root |

> **Migration rule**: New documentation files should be created in `docs/`, not at project root.

---

## Project Layout (`src/`)

AionUi is a multi-process Electron app with three core layers: **renderer**, **main process**, and **preload/shared**.

### Target Structure

The long-term goal is a clean three-layer layout with minimal `src/` root items:

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

The codebase is migrating toward the target. Currently, some main-process modules still live at `src/` root:

```
src/
│
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

> **Migration rule**: New modules should be created in the **target** location when possible. Existing modules will be migrated incrementally.

## Process Boundary Rules

**These are hard rules — violating them causes runtime crashes.**

| Process | Can use | Cannot use |
|---------|---------|------------|
| **Main** (`src/process/`) | Node.js, Electron main APIs, `fs`, `path`, `child_process` | DOM APIs (`document`, `window`, React) |
| **Renderer** (`src/renderer/`) | DOM APIs, React, browser APIs | Node.js APIs (`fs`, `path`, `child_process`), Electron main APIs |
| **Worker** (`src/worker/`) | Node.js APIs | DOM APIs, Electron APIs |
| **Preload** (`src/preload.ts`) | `contextBridge`, `ipcRenderer` | DOM manipulation, Node.js `fs` |

**Cross-process communication MUST go through:**
- Main ↔ Renderer: IPC via `src/preload.ts` + `src/process/bridge/*.ts`
- Main ↔ Worker: fork protocol via `src/worker/WorkerProtocol.ts`

```typescript
// NEVER do this in renderer
import { something } from '@process/services/foo';  // crashes at runtime

// Use IPC instead
const result = await window.api.someMethod();       // goes through preload
```

## Directory Size Limit

A single directory must not contain more than **10** direct children (files + subdirectories). When approaching this limit, split contents into subdirectories grouped by responsibility.

**Single-file directory rule**: A directory containing only 1 file should be merged into its parent or a related directory. Do not create a directory for a single file.

## Directory Naming — Two Conventions by Process

| Scope | Directory naming | Reason |
|-------|-----------------|--------|
| **Renderer** (`src/renderer/`) | **PascalCase** for component/module dirs | React ecosystem convention — directory name = component name |
| **Everything else** (process, worker, agent, common, etc.) | **lowercase** | Node.js ecosystem convention |
| **Categorical directories** (everywhere) | **lowercase** | `components/`, `hooks/`, `utils/`, `services/`, `bridge/` are categories, not entities |
| **Platform directories** (everywhere) | **lowercase** | `acp/`, `codex/`, `gemini/` etc. always lowercase for cross-process consistency |

### Quick test

> "Is this directory inside `src/renderer/` AND does it represent a specific component or feature module (not a category or platform)?"
>
> **YES** → PascalCase. **NO** → lowercase.

## File Naming — Same Everywhere

File naming follows content type, regardless of process:

| Content | Convention | Examples |
|---------|-----------|----------|
| React components, classes | PascalCase | `SettingsModal.tsx`, `CronService.ts` |
| Hooks | camelCase with `use` prefix | `useTheme.ts`, `useCronJobs.ts` |
| Utilities, helpers | camelCase | `formatDate.ts`, `cronUtils.ts` |
| Entry points | `index.ts` / `index.tsx` | Required for directory-based modules |
| Config, types, constants | camelCase | `types.ts`, `constants.ts` |
| Styles | kebab-case or `Name.module.css` | `chat-layout.css` |

## Top-Level Directory Decision Tree

```
Where does my new code go?

Is it UI (React components, hooks, pages)?
  └── YES → src/renderer/

Is it an IPC handler responding to renderer calls?
  └── YES → src/process/bridge/

Is it business logic running in the main process?
  └── YES → src/process/services/

Is it an AI platform connection (API client, message protocol)?
  └── YES → src/agent/<platform>/

Is it a background task that runs in a worker thread?
  └── YES → src/worker/

Is it used by BOTH main and renderer processes?
  └── YES → src/common/

Is it an HTTP/WebSocket endpoint?
  └── YES → src/webserver/

Is it a plugin/extension resolver or loader?
  └── YES → src/extensions/

Is it a messaging channel (Lark, DingTalk, Telegram)?
  └── YES → src/channels/
```

---

# Part 2 — Renderer Layer (`src/renderer/`)

## Root Directory — Standard Layout

The renderer root must contain **at most 3 entry files + 7 directories = 10 items**.

```
src/renderer/
├── index.html      # Vite HTML entry
├── main.tsx        # React mount + app bootstrap
├── types.d.ts      # Ambient type declarations
├── pages/          # Page-level modules (business code goes here)
├── components/     # Shared UI components (used across multiple pages)
├── hooks/          # Shared React hooks (supports business domain subdirs)
├── context/        # Global React contexts
├── services/       # Client-side services + i18n
├── utils/          # Utility functions + types + constants
├── styles/         # Global styles + theme configuration
└── assets/         # Static assets — Vite resolves to hashed URLs
```

**What does NOT belong at the renderer root:**
- CSS files → move to `styles/`
- Component files (`.tsx`) → move to `components/` or `pages/`
- Single-file directories (only 1 file inside) → merge into a related directory

## UI Library & Icon Standards

- **Component library**: `@arco-design/web-react` — all new UI must use Arco components first
- **Icon library**: `@icon-park/react` — all icons must come from this library
- **No raw HTML for interactive elements**: Do not use `<button>`, `<input>`, `<select>`, `<textarea>`, `<modal>`, etc. Use Arco equivalents (`Button`, `Input`, `Select`, `Modal`, etc.)
- **Layout tags are fine**: `<div>`, `<span>`, `<section>`, `<nav>`, `<main>` may be used freely

## CSS Conventions

- **Prefer UnoCSS utility classes** for simple styles (`flex items-center gap-8px`)
- **Complex/reusable styles**: Must use **CSS Modules** (`ComponentName.module.css`). Plain `.css` files are not allowed for component styles
- **Semantic color tokens only**: Use `uno.config.ts` semantic colors (`text-t-primary`, `bg-base`, `border-b-base`) or CSS variables. Hardcoded color values (`#86909C`, `rgb(...)`) are forbidden. Exception: theme presets under `CssThemeSettings/presets/`
- **No inline styles** except for dynamically computed values
- **Arco style overrides**: Co-locate in the component's CSS Module via `:global(.arco-xxx)`. No global override files
- **Global styles**: Only in `src/renderer/styles/` (themes, reset, layout base). No CSS files directly in `src/renderer/` root

## Single File vs Directory

Single file → self-contained, no sub-components. Directory → has internal structure, must have `index.tsx`.

**Rule**: If a component needs even one private sub-component or hook, convert to a directory.

## `src/renderer/components/` — Layered Structure

`components/` holds shared components used across multiple pages. It is organized in two layers:

**Fixed layer:**
- `base/` — Generic UI primitives (Modal, Select, ScrollArea, etc.). No business logic, no app-specific context dependencies. This is the only fixed subdirectory.

**Business layer:**
- Create subdirectories by **business domain**, using lowercase naming (categorical directory rule)
- Create a domain subdirectory when **≥ 2** shared components belong to the same domain
- A single component may stay at the `components/` root until a second same-domain component appears

**Constraints:**
- The `components/` root must not exceed **10** direct children
- `base/` components must not depend on business logic or app-specific context
- Components used by only **one** page belong in `pages/<PageName>/components/`, not here

```
src/renderer/components/
├── base/           # UI primitives — AionModal, FlexFullContainer, etc.
├── chat/           # Conversation/message domain (example)
├── agent/          # Agent selection/configuration domain
├── settings/       # Settings domain
├── layout/         # Window frame and layout
├── media/          # File preview, image viewer
└── ...             # New domains added as needed
```

> Business subdirectories above are illustrative, not exhaustive. New domains follow the same rules.

## `src/renderer/hooks/` — Grouping by Business Domain

When `hooks/` exceeds 10 direct children, group hooks into business domain subdirectories. Each subdirectory holds hooks related to that domain. Generic hooks with no clear domain stay at the root.

**Recommended domain subdirectories:**

```
hooks/
├── agent/          # Agent/model related — useModelProviderList, useAgentReadinessCheck, etc.
├── chat/           # Chat/message input — useAutoTitle, useSendBoxDraft, useSlashCommands, etc.
├── file/           # File/workspace — useDragUpload, useOpenFileSelector, useWorkspaceSelector, etc.
├── mcp/            # MCP related (already exists)
├── ui/             # Generic UI interaction — useAutoScroll, useDebounce, useResizableSplit, etc.
├── system/         # System-level — useDeepLink, useNotificationClick, useTheme, usePwaMode, etc.
└── index.ts        # Public re-exports (optional)
```

> Domain names are recommendations. Create new domains as needed following the same pattern. The root must stay ≤ 10 direct children.

## `src/renderer/utils/` — Grouping by Business Domain

Same principle as `hooks/`. When `utils/` exceeds 10 direct children, group into domain subdirectories. Pure utility functions with no clear domain stay at the root.

**Recommended domain subdirectories:**

```
utils/
├── file/           # File handling — base64, fileSelection, fileType, download, etc.
├── workspace/      # Workspace — workspace, workspaceEvents, workspaceFs, workspaceHistory
├── chat/           # Chat/message — chatMinimapEvents, diffUtils, latexDelimiters, thinkTagFilter, etc.
├── model/          # Model/agent — agentLogo, agentUiDisplay, modelCapabilities, modelContextLimits
├── theme/          # Theme/style — customCssProcessor, themeCssSync
├── ui/             # Generic UI — clipboard, focus, siderTooltip, HOC, ModalHOC, createContext
├── common.ts       # Misc utilities that don't fit a domain
├── emitter.ts
└── platform.ts
```

> The root must stay ≤ 10 direct children.

## Page Module Structure

```
PageName/                  # PascalCase
├── index.tsx              # Entry point (required)
├── components/            # Page-private components (lowercase categorical dir)
│   ├── FeatureA.tsx       # Simple sub-component
│   └── FeatureB/          # Complex sub-component (PascalCase)
│       └── index.tsx
├── hooks/                 # Page-private hooks
├── contexts/              # Page-private React contexts
├── utils/                 # Page-private utilities
├── types.ts
└── constants.ts
```

Only create sub-directories you need. Use these exact names.

## Page-Level Directory Naming

Inside a page module (e.g., `pages/conversation/`), three types of subdirectories exist:

| Type | Convention | Examples |
|------|-----------|----------|
| **Categorical** (standard role) | lowercase | `components/`, `hooks/`, `context/`, `utils/` |
| **Feature module** (business feature) | PascalCase | `GroupedHistory/`, `Workspace/`, `Preview/` |
| **Platform directory** (mirrors `src/agent/`) | lowercase | `acp/`, `codex/`, `gemini/`, `nanobot/`, `openclaw/` |

Platform directories are an exception to the PascalCase rule for feature modules. They use lowercase to maintain cross-process naming consistency with `src/agent/<platform>/`.

### Renderer examples

```
src/renderer/
├── components/              # categorical → lowercase
│   ├── SettingsModal/       # component → PascalCase
│   └── EmojiPicker/         # component → PascalCase
├── pages/                   # categorical → lowercase
│   ├── settings/            # top-level page → lowercase (route segment)
│   │   ├── CssThemeSettings/   # feature module → PascalCase
│   │   └── McpManagement/      # feature module → PascalCase
│   └── conversation/        # top-level page → lowercase
│       ├── GroupedHistory/  # feature module → PascalCase
│       ├── Workspace/       # feature module → PascalCase
│       ├── acp/             # platform dir → lowercase (mirrors src/agent/acp/)
│       └── components/      # categorical → lowercase
└── hooks/                   # categorical → lowercase
```

## Shared vs Page-Private Code

| Scope | Location |
|-------|----------|
| Used by **one** page | `pages/<PageName>/components/`, `hooks/`, etc. |
| Used by **multiple** pages | `src/renderer/components/`, `src/renderer/hooks/` |

**Promotion rule**: Start page-private. Move to shared only when a second consumer appears.

## Component Entry Points

- Directory-based components **must** have `index.tsx` as the public entry point
- Do not import internal files from outside the directory

---

# Part 3 — Main Process Layer (`src/process/`)

## Structure

```
src/process/
├── bridge/        # IPC handlers — one file per domain
│   ├── index.ts   # Registers all bridges
│   └── *Bridge.ts # Individual bridge files
├── services/      # Business logic services
│   ├── cron/      # Complex service → subdirectory
│   └── mcp-services/
├── database/      # SQLite layer — schema, migrations, repositories
├── task/          # Agent/task management — managers, factories
├── utils/         # Main-process-only utilities
└── i18n/          # Main-process i18n
```

## Naming Conventions

| Type | Pattern | Examples |
|------|---------|----------|
| Bridge | `<domain>Bridge.ts` (camelCase) | `cronBridge.ts`, `webuiBridge.ts` |
| Service | `<Name>Service.ts` (PascalCase) | `CronService.ts`, `McpService.ts` |
| Service interface | `I<Name>Service.ts` | `IConversationService.ts` |
| Repository | `<Name>Repository.ts` | `SqliteConversationRepository.ts` |
| Agent Manager | `<Platform>AgentManager.ts` | `AcpAgentManager.ts` |

### Non-renderer examples

```
src/process/
├── bridge/           # lowercase
├── services/         # lowercase
│   ├── cron/         # lowercase
│   └── mcp-services/ # lowercase (kebab-case for multi-word)
├── database/         # lowercase
└── task/             # lowercase

src/agent/
├── acp/              # lowercase
├── gemini/           # lowercase
└── openclaw/         # lowercase
```

## Adding a New IPC Bridge

1. Create `src/process/bridge/<domain>Bridge.ts`
2. Register it in `src/process/bridge/index.ts`
3. Expose the channel in `src/preload.ts`
4. Add renderer-side types if needed

## Adding a New Service

- Simple service → single file in `src/process/services/`
- Complex service (multiple files) → subdirectory: `src/process/services/<name>/`

---

# Part 4 — Middle / Shared Layer

## Preload (`src/preload.ts`)

The IPC bridge between main and renderer processes. Uses `contextBridge` to expose safe APIs to the renderer.

- All main ↔ renderer communication goes through this file
- Only `contextBridge` and `ipcRenderer` APIs allowed here
- No DOM manipulation, no Node.js `fs`

## Shared Code (`src/common/`)

Code imported by **both** main and renderer processes.

**Belongs here**: shared types, API adapters, protocol converters, storage keys.
**Does NOT belong here**: React components → `renderer/`, Node.js-specific code → `process/`.

## Agent Implementations (`src/agent/`)

One directory per AI platform (lowercase): `acp/`, `codex/`, `gemini/`, `nanobot/`, `openclaw/`. Each has its own `index.ts` entry. Agent code runs in the main process or worker process.

## Worker Process (`src/worker/`)

```
src/worker/
├── fork/              # Fork management
├── <platform>.ts      # One file per agent platform (lowercase)
├── WorkerProtocol.ts  # Protocol definition (PascalCase — it's a class)
└── index.ts
```

## Other Main Process Modules

| Module | Location | Purpose |
|--------|----------|---------|
| Channels | `src/channels/` | Multi-channel messaging (Lark, DingTalk, Telegram) |
| Extensions | `src/extensions/` | Plugin loading, resolvers, sandbox |
| WebServer | `src/webserver/` | Express + WebSocket for WebUI |
| Adapter | `src/adapter/` | Platform adapters (browser vs main environment) |

---

# Quick Checklist

Before submitting code with new files:

- [ ] Code is in the correct process directory (no cross-process imports)
- [ ] Renderer code does not use Node.js APIs
- [ ] Main process code does not use DOM APIs
- [ ] New IPC channels are bridged through `preload.ts`
- [ ] Renderer component/module dirs use PascalCase; categorical dirs use lowercase
- [ ] Platform dirs (acp, codex, gemini, etc.) use lowercase everywhere
- [ ] Non-renderer dirs use lowercase
- [ ] Directory-based modules have `index.tsx` / `index.ts` entry point
- [ ] Page-private code is under `pages/<PageName>/`, not in shared dirs
- [ ] No single-file directories — merge into parent or related directory
- [ ] `renderer/` root has at most 3 files + 7 directories
- [ ] `hooks/` and `utils/` are grouped by business domain when exceeding 10 children
- [ ] No CSS files at `renderer/` root — global styles go in `styles/`
