# File & Directory Structure

Rules for organizing files and directories across the entire Electron project.

## Project Layout

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
└── index.ts       # Main process entry point
```

## Directory Naming — Two Conventions by Process

This project straddles two ecosystems. Each follows its own convention:

| Scope | Directory naming | Reason |
|-------|-----------------|--------|
| **Renderer** (`src/renderer/`) | **PascalCase** for component/module dirs | React ecosystem — directory name = component name |
| **Everything else** | **lowercase** | Node.js ecosystem |
| **Categorical dirs** (everywhere) | **lowercase** | `components/`, `hooks/`, `utils/`, `services/` are categories, not entities |

### Quick test

> "Is this directory inside `src/renderer/` AND does it represent a specific component or feature module (not a category)?"
>
> **YES** → PascalCase. **NO** → lowercase.

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
│   └── conversation/
│       └── GroupedHistory/  # feature module → PascalCase
└── hooks/                   # categorical → lowercase
```

### Non-renderer examples

```
src/process/services/cron/       # lowercase
src/agent/acp/                   # lowercase
src/channels/plugins/dingtalk/   # lowercase
```

## File Naming — Same Everywhere

| Content | Convention | Examples |
|---------|-----------|----------|
| React components, classes | PascalCase | `SettingsModal.tsx`, `CronService.ts` |
| Hooks | camelCase with `use` prefix | `useTheme.ts`, `useCronJobs.ts` |
| Utilities, helpers | camelCase | `formatDate.ts`, `cronUtils.ts` |
| Entry points | `index.ts` / `index.tsx` | Required for directory-based modules |
| Config, types, constants | camelCase | `types.ts`, `constants.ts` |
| Styles | kebab-case or `Name.module.css` | `chat-layout.css` |

## Process Boundary Rules

**Violating these causes runtime crashes.**

| Process | Can use | Cannot use |
|---------|---------|------------|
| **Main** (`src/process/`) | Node.js, Electron main APIs | DOM APIs, React |
| **Renderer** (`src/renderer/`) | DOM APIs, React, browser APIs | Node.js APIs, Electron main APIs |
| **Worker** (`src/worker/`) | Node.js APIs | DOM APIs, Electron APIs |

Cross-process communication MUST go through:
- Main ↔ Renderer: IPC via `src/preload.ts` + `src/process/bridge/*.ts`
- Main ↔ Worker: fork protocol via `src/worker/WorkerProtocol.ts`

## Main Process Naming

| Type | Pattern | Examples |
|------|---------|----------|
| Bridge | `<domain>Bridge.ts` | `cronBridge.ts`, `webuiBridge.ts` |
| Service | `<Name>Service.ts` | `CronService.ts`, `McpService.ts` |
| Interface | `I<Name>Service.ts` | `IConversationService.ts` |
| Repository | `<Name>Repository.ts` | `SqliteConversationRepository.ts` |

## Directory Size Limit

A single directory must not contain more than **10** direct children (files + subdirectories). When a directory approaches this limit, split its contents into subdirectories grouped by responsibility.

## Renderer Component Rules

- **Single file** when self-contained; **directory** when it has sub-components/hooks
- Directory-based components must have `index.tsx` entry point
- Page-private code stays under `pages/<PageName>/`; move to shared only when a second consumer appears

### `src/renderer/components/` Structure

`components/` is for shared components used across multiple pages. It has two layers:

**Fixed layer:**
- `base/` — Generic UI primitives with no business logic. The only fixed subdirectory. Components here must not depend on app-specific context or domain logic.

**Business layer:**
- Create subdirectories by **business domain**, using lowercase naming (categorical directory rule)
- Create a domain subdirectory when **≥ 2** shared components belong to the same domain
- A single component may stay at the `components/` root temporarily until a second component in the same domain appears

**Constraints:**
- The `components/` root must not exceed **10** direct children (files + directories)
- Components used by only **one** page must live in `pages/<PageName>/components/`, not here

```
src/renderer/components/
├── base/           # UI primitives — AionModal, AionSelect, FlexFullContainer, etc.
├── chat/           # Conversation/message domain (example, not exhaustive)
├── agent/          # Agent selection/configuration domain
├── settings/       # Settings domain
├── layout/         # Window frame and layout
├── media/          # File preview, image viewer
└── index.ts        # Public re-exports (optional)
```

> The business subdirectory list above is illustrative. New domains are created as needed following the same rules.

### Page Module Structure

```
PageName/                  # PascalCase
├── index.tsx              # Entry point (required)
├── components/            # lowercase (categorical)
├── hooks/                 # lowercase (categorical)
├── contexts/              # lowercase (categorical)
├── utils/                 # lowercase (categorical)
├── types.ts
└── constants.ts
```
