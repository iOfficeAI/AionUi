# File & Directory Structure

Rules for organizing files and directories across the entire Electron project.

## Repository Root

### Root Directory Rules

- **README translations** belong in `docs/readme/`, not at root. Only the main `readme.md` stays at root (GitHub convention)
- **Guide documents** (deployment, testing, WebUI, CDP, etc.) belong in `docs/guides/`
- **Contributor documentation** (dev setup, code style, file structure, PR workflow) belongs in `docs/contributing/`
- **Architecture documentation** belongs in `docs/architecture/` (research notes under `docs/architecture/research/`)
- **Feature specs / PRDs / design drafts** belong in `docs/specs/` (or `docs/prds/` for formal PRDs maintained by the product team)
- **Config files** (`tsconfig.json`, `package.json`, etc.) stay at root — Node.js/Electron ecosystem convention
- **New documentation** should be placed under the appropriate `docs/` subdirectory, not at project root

## Project Layout

The repository is a monorepo. The desktop app is one package among several:

```
packages/
├── desktop/           # The Electron app — almost all work happens here
├── web-host/          # Serves the WebUI and proxies to the backend (no Electron)
├── web-cli/           # Standalone web runtime launcher
└── shared-scripts/    # Build scripts shared across packages
```

Inside `packages/desktop/src/` there are three layers plus the entry files:

```
packages/desktop/src/
├── renderer/          # Renderer layer — React UI, no Node.js APIs
├── process/           # Main process layer — Node.js / Electron only
│   ├── bridge/        #   IPC handlers exposed to the renderer
│   ├── services/      #   Desktop-side services (updater, local database, i18n, skills)
│   ├── startup/       #   Launch sequence, backend startup, single-instance gating
│   ├── backend/       #   Locating and launching the aioncore binary
│   ├── pet/           #   Desktop pet windows
│   ├── feedback/      #   Diagnostics and feedback reporting
│   ├── resources/     #   Packaged resource resolution
│   └── utils/         #   Main-process utilities
├── common/            # Shared layer — cross-process types, config, adapters, utilities
├── preload/           # IPC bridge — contextBridge between main ↔ renderer
├── index.ts           # Main process entry point
├── sentry.ts          # Error reporting setup
└── types.d.ts         # Ambient type declarations
```

Note what is **not** in this list: conversations, agents, models, assistants, skills,
MCP servers, scheduled tasks and their persistence all live in **aioncore**, a separate
backend binary that the main process launches on startup. The renderer reaches it over
HTTP, not through IPC. See [`../architecture/overview.md`](../architecture/overview.md)
for how the three runtimes fit together.

This means most feature work touches only `renderer/` — adding a module under
`process/` is for genuine desktop/OS concerns.

## Directory Naming — Two Conventions by Process

This project straddles two ecosystems. Each follows its own convention:

| Scope                                           | Directory naming                         | Reason                                                                      |
| ----------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| **Renderer** (`packages/desktop/src/renderer/`) | **PascalCase** for component/module dirs | React ecosystem — directory name = component name                           |
| **Everything else**                             | **lowercase**                            | Node.js ecosystem                                                           |
| **Categorical dirs** (everywhere)               | **lowercase**                            | `components/`, `hooks/`, `utils/`, `services/` are categories, not entities |
| **Platform dirs** (renderer pages)              | **lowercase**                            | They name a wire protocol, not a component — see the exception below        |

### Quick test

> "Is this directory inside `packages/desktop/src/renderer/` AND does it represent a specific component or feature module (not a category)?"
>
> **YES** → PascalCase. **NO** → lowercase.
>
> **Exception**: Platform directories under `renderer/pages/conversation/platforms/` (`acp/`, `aionrs/`, `gemini/`, `legacy/`) always use lowercase, even inside the renderer. They are named after the protocol the conversation speaks, not after a component.

### Renderer examples

```
packages/desktop/src/renderer/
├── components/              # categorical → lowercase
│   ├── Markdown/            # component → PascalCase
│   └── chat/                # categorical → lowercase
├── pages/                   # categorical → lowercase
│   ├── settings/            # top-level page → lowercase (route segment)
│   │   ├── AgentSettings/      # feature module → PascalCase
│   │   └── SkillsSettings/     # feature module → PascalCase
│   └── conversation/        # top-level page → lowercase
│       ├── GroupedHistory/  # feature module → PascalCase
│       ├── Preview/         # feature module → PascalCase
│       ├── platforms/       # categorical → lowercase
│       │   └── acp/         # platform dir → lowercase (protocol name)
│       └── components/      # categorical → lowercase
└── hooks/                   # categorical → lowercase
```

### Non-renderer examples

```
packages/desktop/src/process/services/database/   # lowercase
packages/desktop/src/process/bridge/              # lowercase
packages/desktop/src/process/startup/             # lowercase
```

## File Naming — Same Everywhere

| Content                   | Convention                      | Examples                                   |
| ------------------------- | ------------------------------- | ------------------------------------------ |
| React components, classes | PascalCase                      | `CssThemeModal.tsx`, `ApiKeyManager.ts`    |
| Hooks                     | camelCase with `use` prefix     | `useDebounce.ts`, `useCompositionInput.ts` |
| Utilities, helpers        | camelCase                       | `backgroundUtils.ts`, `latexDelimiters.ts` |
| Entry points              | `index.ts` / `index.tsx`        | Required for directory-based modules       |
| Config, types, constants  | camelCase                       | `types.ts`, `constants.ts`                 |
| Styles                    | kebab-case or `Name.module.css` | `chat-layout.css`                          |

## Process Boundary Rules

**Violating these causes runtime crashes.**

| Process                                         | Can use                       | Cannot use                       |
| ----------------------------------------------- | ----------------------------- | -------------------------------- |
| **Main** (`packages/desktop/src/process/`)      | Node.js, Electron main APIs   | DOM APIs, React                  |
| **Renderer** (`packages/desktop/src/renderer/`) | DOM APIs, React, browser APIs | Node.js APIs, Electron main APIs |

Cross-process communication MUST go through:

- Main ↔ Renderer: IPC via `packages/desktop/src/preload/main.ts` + `packages/desktop/src/process/bridge/*.ts`
- Renderer ↔ backend: HTTP via `packages/desktop/src/common/adapter/httpBridge.ts` (not IPC)

## Main Process Naming

| Type       | Pattern                | Examples                                                                        |
| ---------- | ---------------------- | ------------------------------------------------------------------------------- |
| Bridge     | `<domain>Bridge.ts`    | `webuiBridge.ts`, `dialogBridge.ts`                                             |
| Service    | `<Name>Service.ts`     | `autoUpdaterService.ts`                                                         |
| Interface  | `I<Name>Repository.ts` | `IConversationRepository.ts`                                                    |
| Repository | `<Name>Repository.ts`  | `IConversationRepository.ts` implementations under `services/database/drivers/` |

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

| Source                                                            | Test                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/desktop/src/renderer/utils/ui/clipboard.ts`             | `tests/unit/renderer/utils/clipboard.dom.test.ts`             |
| `packages/desktop/src/process/backend/binaryResolver.ts`          | `packages/desktop/src/process/backend/binaryResolver.test.ts` |
| `packages/desktop/src/renderer/utils/chat/latexDelimiters.ts`     | `tests/unit/renderer/utils/latexDelimiters.test.ts`           |
| `packages/desktop/src/renderer/hooks/chat/useCompositionInput.ts` | `tests/unit/renderer/useCompositionInput.dom.test.ts`         |

When `tests/unit/` exceeds 10 direct children, group into subdirectories matching the source structure (e.g., `tests/unit/renderer/`, `tests/unit/adapter/`). New source files with logic should be added to `vitest.config.ts` → `coverage.include`.

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
- **Semantic color tokens only**: Use colors from `uno.config.ts` (e.g., `text-t-primary`, `bg-base`, `border-b-base`) or CSS variables. **Hardcoded color values are forbidden** (e.g., `#86909C`, `rgb(0,0,0)`). Exception: theme preset files (`packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets.ts`, `packages/desktop/src/renderer/theme/builtinThemes.ts`) may use hardcoded values since they define the theme tokens themselves.
- **No inline styles**: Do not use `style={{}}` except for dynamically computed values (e.g., calculated widths, positions).
- **Arco style overrides**: Co-locate in the component's CSS Module using `:global(.arco-xxx)`. Do not use a global override file.
- **Global styles**: Only allowed in `packages/desktop/src/renderer/styles/` (themes, reset, layout base). No CSS files directly in `packages/desktop/src/renderer/` root.

## Renderer Root Directory — Standard Layout

The renderer root must contain **at most 3 entry files + 7 directories = 10 items**.

```
packages/desktop/src/renderer/
├── index.html      # Vite HTML entry
├── main.tsx        # React mount + app bootstrap
├── types.d.ts      # Ambient type declarations
├── pages/          # Page-level modules (business code goes here)
├── components/     # Shared UI components (used across multiple pages)
├── hooks/          # Shared React hooks (supports business domain subdirs)
├── api/            # HTTP client for the aioncore backend
├── services/       # Client-side services + i18n
├── utils/          # Utility functions + types + constants
├── styles/         # Global styles + theme configuration
├── theme/          # Theme definitions and tokens
├── pet/            # Desktop pet renderer entry
└── assets/         # Static assets — Vite resolves to hashed URLs
```

The renderer root currently holds 3 entry files + 10 directories = **13 items**, which
is over the limit above. Reducing it is a known cleanup target: `theme/` and `styles/`
overlap, and `pet/` exists only because the pet windows render separately.

**What does NOT belong at the renderer root:**

- CSS files → move to `styles/`
- Component files (`.tsx`) → move to `components/` or `pages/`
- Single-file directories (only 1 file inside) → merge into a related directory

## Renderer Component Rules

- **Single file** when self-contained; **directory** when it has sub-components/hooks
- Directory-based components must have `index.tsx` entry point
- **Single-file directory rule**: A directory containing only 1 file should be merged into its parent or a related directory
- Page-private code stays under `pages/<PageName>/`; move to shared only when a second consumer appears

### `packages/desktop/src/renderer/components/` Structure

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
packages/desktop/src/renderer/components/
├── base/           # UI primitives — AionModal, AionSelect, FlexFullContainer, etc.
├── chat/           # Conversation/message domain (example, not exhaustive)
├── agent/          # Agent selection/configuration domain
├── settings/       # Settings domain
├── layout/         # Window frame and layout
├── media/          # File preview, image viewer
└── index.ts        # Public re-exports (optional)
```

> The business subdirectory list above is illustrative. New domains are created as needed following the same rules.

### `packages/desktop/src/renderer/hooks/` — Grouping by Business Domain

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

### `packages/desktop/src/renderer/utils/` — Grouping by Business Domain

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

| Type                                            | Convention | Examples                                      |
| ----------------------------------------------- | ---------- | --------------------------------------------- |
| **Categorical** (standard role)                 | lowercase  | `components/`, `hooks/`, `context/`, `utils/` |
| **Feature module** (business feature)           | PascalCase | `GroupedHistory/`, `Workspace/`, `Preview/`   |
| **Platform directory** (conversation protocols) | lowercase  | `acp/`, `aionrs/`, `gemini/`, `legacy/`       |

Platform directories are an exception to PascalCase. They are named after the protocol a conversation speaks, not after a component, and live under `packages/desktop/src/renderer/pages/conversation/platforms/`.
