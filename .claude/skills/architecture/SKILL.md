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

## Project Layout

AionUi is a multi-process Electron app. Code is organized by **process boundary**:

```
src/
├── process/       # Main process — Electron APIs, IPC, DB, services
├── renderer/      # Renderer process — React UI, no Node.js APIs
├── worker/        # Worker processes — background agent execution
├── preload.ts     # IPC bridge — contextBridge between main ↔ renderer
├── common/        # Shared across processes — types, adapters, utilities
├── agent/         # Agent implementations — platform-specific AI connections
├── channels/      # Multi-channel messaging — Lark, DingTalk, Telegram
├── extensions/    # Extension system — plugin loading, resolvers, sandbox
├── webserver/     # Express + WebSocket — WebUI server
├── adapter/       # Platform adapters — browser vs main environment
├── shared/        # Minimal shared config (i18n-config.json)
├── types/         # Global type declarations
├── utils/         # App-level utilities (menu, chromium config)
└── index.ts       # Main process entry point
```

## Directory Naming — Two Conventions by Process

This project straddles two ecosystems. Each follows its own convention:

| Scope | Directory naming | Reason |
|-------|-----------------|--------|
| **Renderer** (`src/renderer/`) | **PascalCase** for component/module dirs | React ecosystem convention — directory name = component name |
| **Everything else** (process, worker, agent, common, etc.) | **lowercase** | Node.js ecosystem convention |
| **Categorical directories** (everywhere) | **lowercase** | `components/`, `hooks/`, `utils/`, `services/`, `bridge/` are categories, not entities |

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
│       └── components/      # categorical → lowercase
└── hooks/                   # categorical → lowercase
```

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

### Quick test

> "Is this directory inside `src/renderer/` AND does it represent a specific component or feature module (not a category)?"
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

## Main Process (`src/process/`)

### Structure

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

### Naming Conventions

| Type | Pattern | Examples |
|------|---------|----------|
| Bridge | `<domain>Bridge.ts` (camelCase) | `cronBridge.ts`, `webuiBridge.ts` |
| Service | `<Name>Service.ts` (PascalCase) | `CronService.ts`, `McpService.ts` |
| Service interface | `I<Name>Service.ts` | `IConversationService.ts` |
| Repository | `<Name>Repository.ts` | `SqliteConversationRepository.ts` |
| Agent Manager | `<Platform>AgentManager.ts` | `AcpAgentManager.ts` |

### Adding a New IPC Bridge

1. Create `src/process/bridge/<domain>Bridge.ts`
2. Register it in `src/process/bridge/index.ts`
3. Expose the channel in `src/preload.ts`
4. Add renderer-side types if needed

### Adding a New Service

- Simple service → single file in `src/process/services/`
- Complex service (multiple files) → subdirectory: `src/process/services/<name>/`

---

## Directory Size Limit

A single directory must not contain more than **10** direct children (files + subdirectories). When approaching this limit, split contents into subdirectories grouped by responsibility.

---

## Renderer Process (`src/renderer/`)

### Structure

```
src/renderer/
├── assets/        # Static assets — Vite resolves to hashed URLs
├── components/    # Shared UI components (used across multiple pages)
├── hooks/         # Shared hooks (generic, reusable across pages)
├── i18n/          # Internationalization
├── pages/         # Page-level modules (business code goes here)
├── services/      # Client-side services
├── context/       # Global React contexts
├── styles/        # Global styles
├── theme/         # Theme configuration
├── utils/         # Pure utility functions
└── types/         # Type definitions
```

### Single File vs Directory

Single file → self-contained, no sub-components. Directory → has internal structure, must have `index.tsx`.

**Rule**: If a component needs even one private sub-component or hook, convert to a directory.

### `src/renderer/components/` — Layered Structure

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

### Page Module Structure

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

### Shared vs Page-Private Code

| Scope | Location |
|-------|----------|
| Used by **one** page | `pages/<PageName>/components/`, `hooks/`, etc. |
| Used by **multiple** pages | `src/renderer/components/`, `src/renderer/hooks/` |

**Promotion rule**: Start page-private. Move to shared only when a second consumer appears.

### Component Entry Points

- Directory-based components **must** have `index.tsx` as the public entry point
- Do not import internal files from outside the directory

---

## Worker Process (`src/worker/`)

```
src/worker/
├── fork/              # Fork management
├── <platform>.ts      # One file per agent platform (lowercase)
├── WorkerProtocol.ts  # Protocol definition (PascalCase — it's a class)
└── index.ts
```

---

## Shared Code (`src/common/`)

Code imported by **both** main and renderer processes.

**Belongs here**: shared types, API adapters, protocol converters, storage keys.
**Does NOT belong here**: React components → `renderer/`, Node.js-specific code → `process/`.

---

## Agent Implementations (`src/agent/`)

One directory per AI platform (lowercase): `acp/`, `codex/`, `gemini/`, `nanobot/`, `openclaw/`. Each has its own `index.ts` entry.

---

## Quick Checklist

Before submitting code with new files:

- [ ] Code is in the correct process directory (no cross-process imports)
- [ ] Renderer code does not use Node.js APIs
- [ ] Main process code does not use DOM APIs
- [ ] New IPC channels are bridged through `preload.ts`
- [ ] Renderer component/module dirs use PascalCase; categorical dirs use lowercase
- [ ] Non-renderer dirs use lowercase
- [ ] Directory-based modules have `index.tsx` / `index.ts` entry point
- [ ] Page-private code is under `pages/<PageName>/`, not in shared dirs
