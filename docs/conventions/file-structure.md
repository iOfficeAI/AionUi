# File & Directory Structure

Rules for organizing files and directories across the entire Electron project.

## Repository Root

### Root Directory Rules

- **README translations** belong in `docs/readme/`, not at root. Only the main `readme.md` stays at root (GitHub convention)
- **Guide documents** (`*_GUIDE.md`, `CODE_STYLE.md`, etc.) belong in `docs/`
- **Config files** (`tsconfig.json`, `package.json`, etc.) stay at root — Node.js/Electron ecosystem convention
- **New documentation** should be created in `docs/`, not at project root

### Current Root Cleanup Targets

| Action                                     | Files                                                       |
| ------------------------------------------ | ----------------------------------------------------------- |
| Move readme translations to `docs/readme/` | `readme_{ch,es,jp,ko,pt,tr,tw}.md`                          |
| Move guides to `docs/`                     | `CODE_STYLE.md`, `SERVER_DEPLOY_GUIDE.md`, `WEBUI_GUIDE.md` |

## Project Layout (`src/`)

AionUi is a multi-process Electron app with three core layers: **renderer**, **main process**, and **preload/shared**.

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

### Current Structure

All main-process modules now live under `src/process/`. The `src/` root contains only the three core layers (`renderer/`, `process/`, `common/`), the entry files (`index.ts`, `preload.ts`), and the ambient type declaration (`types.d.ts`).

## Directory Naming — Two Conventions by Process

This project straddles two ecosystems. Each follows its own convention:

| Scope                              | Directory naming                         | Reason                                                                      |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| **Renderer** (`src/renderer/`)     | **PascalCase** for component/module dirs | React ecosystem — directory name = component name                           |
| **Everything else**                | **lowercase**                            | Node.js ecosystem                                                           |
| **Categorical dirs** (everywhere)  | **lowercase**                            | `components/`, `hooks/`, `utils/`, `services/` are categories, not entities |
| **Platform dirs** (renderer pages) | **lowercase**                            | Mirror `src/process/agent/<platform>/` naming for cross-process consistency |

### Quick test

> "Is this directory inside `src/renderer/` AND does it represent a specific component or feature module (not a category)?"
>
> **YES** → PascalCase. **NO** → lowercase.
>
> **Exception**: Platform directories (`acp/`, `codex/`, `gemini/`, `nanobot/`, `openclaw/`) always use lowercase, even inside renderer, to match `src/process/agent/`.

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

### Non-renderer examples

```
src/process/services/cron/            # lowercase
src/process/agent/acp/               # lowercase
src/process/channels/plugins/dingtalk/  # lowercase
```

## File Naming — Same Everywhere

| Content                   | Convention                      | Examples                              |
| ------------------------- | ------------------------------- | ------------------------------------- |
| React components, classes | PascalCase                      | `SettingsModal.tsx`, `CronService.ts` |
| Hooks                     | camelCase with `use` prefix     | `useTheme.ts`, `useCronJobs.ts`       |
| Utilities, helpers        | camelCase                       | `formatDate.ts`, `cronUtils.ts`       |
| Entry points              | `index.ts` / `index.tsx`        | Required for directory-based modules  |
| Config, types, constants  | camelCase                       | `types.ts`, `constants.ts`            |
| Styles                    | kebab-case or `Name.module.css` | `chat-layout.css`                     |

## Process Boundary Rules

**Violating these causes runtime crashes.**

| Process                            | Can use                       | Cannot use                       |
| ---------------------------------- | ----------------------------- | -------------------------------- |
| **Main** (`src/process/`)          | Node.js, Electron main APIs   | DOM APIs, React                  |
| **Renderer** (`src/renderer/`)     | DOM APIs, React, browser APIs | Node.js APIs, Electron main APIs |
| **Worker** (`src/process/worker/`) | Node.js APIs                  | DOM APIs, Electron APIs          |

Cross-process communication MUST go through:

- Main ↔ Renderer: IPC via `src/preload.ts` + `src/process/bridge/*.ts`
- Main ↔ Worker: fork protocol via `src/process/worker/WorkerProtocol.ts`

## Main Process Naming

| Type       | Pattern               | Examples                          |
| ---------- | --------------------- | --------------------------------- |
| Bridge     | `<domain>Bridge.ts`   | `cronBridge.ts`, `webuiBridge.ts` |
| Service    | `<Name>Service.ts`    | `CronService.ts`, `McpService.ts` |
| Interface  | `I<Name>Service.ts`   | `IConversationService.ts`         |
| Repository | `<Name>Repository.ts` | `SqliteConversationRepository.ts` |

## Service Testability Rules

### Pure Logic vs IO Separation

Services must separate **pure logic** from **IO operations**:

- **Pure logic** (data transformation, validation, formatting) → standalone functions, no `fs`/`db`/`net` imports
- **IO operations** (file read, DB query, HTTP call) → thin wrappers in service class or repository
- Service methods should receive IO results as parameters rather than calling IO internally

### Dependency Injection

Services and bridges that depend on external resources (DB, file system, other services) should accept dependencies as constructor/function parameters:

```typescript
// ❌ Hard to test — must mock the entire module
import { db } from '@process/database';
function getConversation(id: string) {
  return db.query('SELECT * FROM conversations WHERE id = ?', id);
}

// ✅ Easy to test — inject the dependency
function getConversation(repo: IConversationRepository, id: string) {
  return repo.findById(id);
}
```

For existing code using direct imports, `vi.mock()` is acceptable. For new code, prefer parameter injection.

## Test File Mapping

Test files must mirror the source file they test:

| Source                                       | Test                                            |
| -------------------------------------------- | ----------------------------------------------- |
| `src/process/services/CronService.ts`        | `tests/unit/cronService.test.ts`                |
| `src/process/bridge/fsBridge.ts`             | `tests/unit/fsBridge.test.ts`                   |
| `src/renderer/utils/chat/latexDelimiters.ts` | `tests/unit/latexDelimiters.test.ts`            |
| `src/renderer/hooks/ui/useAutoScroll.ts`     | `tests/unit/useAutoScroll.dom.test.ts`          |
| `src/process/extensions/ExtensionLoader.ts`  | `tests/unit/extensions/extensionLoader.test.ts` |

When `tests/unit/` exceeds 10 direct children, group into subdirectories matching the source structure (e.g., `tests/unit/extensions/`). New source files with logic should be added to `vitest.config.ts` → `coverage.include`.

## Directory Size Limit

A single directory must not contain more than **10** direct children (files + subdirectories). When a directory approaches this limit, split its contents into subdirectories grouped by responsibility.

## UI Library & Icon Standards

- **Component library**: `@arco-design/web-react`. All new UI must use Arco components first.
- **Icon library**: `@icon-park/react`. All icons must come from this library.
- **No raw HTML for interactive elements**: Do not use native `<button>`, `<input>`, `<select>`, `<textarea>`, `<modal>`, etc. Use the corresponding Arco component (`Button`, `Input`, `Select`, `Modal`, etc.).
- **Layout tags are fine**: `<div>`, `<span>`, `<section>`, `<nav>`, `<main>`, and other pure layout/semantic tags may be used freely.

## CSS Conventions

- **Prefer UnoCSS utility classes**: Use atomic classes for simple styles (`flex items-center gap-8px`).
- **Complex/reusable styles**: Must use **CSS Modules** (`ComponentName.module.css`). Plain `.css` files are not allowed for component styles.
- **Semantic color tokens only**: Use colors from `uno.config.ts` (e.g., `text-t-primary`, `bg-base`, `border-b-base`) or CSS variables. **Hardcoded color values are forbidden** (e.g., `#86909C`, `rgb(0,0,0)`). Exception: theme preset files under `src/renderer/pages/settings/CssThemeSettings/presets/` may use hardcoded values since they define the theme tokens themselves.
- **No inline styles**: Do not use `style={{}}` except for dynamically computed values (e.g., calculated widths, positions).
- **Arco style overrides**: Co-locate in the component's CSS Module using `:global(.arco-xxx)`. Do not use a global override file.
- **Global styles**: Only allowed in `src/renderer/styles/` (themes, reset, layout base). No CSS files directly in `src/renderer/` root.

## Renderer Root Directory — Standard Layout

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

## Renderer Component Rules

- **Single file** when self-contained; **directory** when it has sub-components/hooks
- Directory-based components must have `index.tsx` entry point
- **Single-file directory rule**: A directory containing only 1 file should be merged into its parent or a related directory
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

### `src/renderer/hooks/` — Grouping by Business Domain

When `hooks/` exceeds 10 direct children, group hooks into business domain subdirectories. Generic hooks with no clear domain stay at the root. The root must stay ≤ 10 direct children.

```
hooks/
├── agent/          # Agent/model related
├── chat/           # Chat/message input
├── file/           # File/workspace
├── mcp/            # MCP related
├── ui/             # Generic UI interaction
├── system/         # System-level (deep link, notification, theme, etc.)
└── index.ts        # Public re-exports (optional)
```

> Domain names are recommendations. Create new domains as needed following the same pattern.

### `src/renderer/utils/` — Grouping by Business Domain

Same principle as `hooks/`. When `utils/` exceeds 10 direct children, group into domain subdirectories. The root must stay ≤ 10 direct children.

```
utils/
├── file/           # File handling
├── workspace/      # Workspace utilities
├── chat/           # Chat/message utilities
├── model/          # Model/agent utilities
├── theme/          # Theme/style utilities
├── ui/             # Generic UI utilities
└── ...             # Ungrouped utilities at root
```

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

### Page-Level Directory Naming

Inside a page module (e.g., `pages/conversation/`), three types of subdirectories exist:

| Type                                                  | Convention | Examples                                             |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------- |
| **Categorical** (standard role)                       | lowercase  | `components/`, `hooks/`, `context/`, `utils/`        |
| **Feature module** (business feature)                 | PascalCase | `GroupedHistory/`, `Workspace/`, `Preview/`          |
| **Platform directory** (mirrors `src/process/agent/`) | lowercase  | `acp/`, `codex/`, `gemini/`, `nanobot/`, `openclaw/` |

Platform directories are an exception to PascalCase. They use lowercase for cross-process naming consistency with `src/process/agent/<platform>/`.
