# Renderer Layer (`src/renderer/`)

## Root Directory — Standard Layout

At most 3 entry files + 7 directories = 10 items:

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

**Does NOT belong at renderer root:**

- CSS files → `styles/`
- Component files (`.tsx`) → `components/` or `pages/`
- Single-file directories → merge into a related directory

## UI Library & Icon Standards

- **Components**: `@arco-design/web-react` — use Arco components first
- **Icons**: `@icon-park/react` — all icons from this library
- **No raw HTML** for interactive elements (`<button>`, `<input>`, `<select>`, etc.) — use Arco equivalents
- **Layout tags** (`<div>`, `<span>`, `<section>`, etc.) may be used freely

## CSS Conventions

- **Prefer UnoCSS** utility classes (`flex items-center gap-8px`)
- **Complex/reusable styles**: CSS Modules (`ComponentName.module.css`). No plain `.css` for components
- **Semantic color tokens only**: Use `uno.config.ts` tokens (`text-t-primary`, `bg-base`, `border-b-base`) or CSS variables. No hardcoded colors. Exception: `CssThemeSettings/presets/`
- **No inline styles** except dynamically computed values
- **Arco overrides**: In component's CSS Module via `:global(.arco-xxx)`. No global override files
- **Global styles**: Only in `src/renderer/styles/`

## `components/` — Layered Structure

Two layers:

**Fixed layer:**

- `base/` — Generic UI primitives (Modal, Select, ScrollArea). No business logic, no app-specific context

**Business layer:**

- Subdirectories by business domain (lowercase). Create when ≥ 2 shared components belong to the same domain
- Single component may stay at `components/` root until a second same-domain component appears

**Constraints:**

- Root ≤ 10 direct children
- `base/` must not depend on business logic
- Single-page components → `pages/<PageName>/components/`

```
src/renderer/components/
├── base/           # UI primitives
├── chat/           # Conversation/message domain
├── agent/          # Agent selection/configuration
├── settings/       # Settings domain
├── layout/         # Window frame and layout
├── media/          # File preview, image viewer
└── ...             # New domains as needed
```

## `hooks/` — Grouping by Business Domain

Group into subdirectories when exceeding 10 children. Generic hooks stay at root.

```
hooks/
├── agent/          # Agent/model — useModelProviderList, useAgentReadinessCheck
├── chat/           # Chat/message — useAutoTitle, useSendBoxDraft, useSlashCommands
├── file/           # File/workspace — useDragUpload, useOpenFileSelector
├── mcp/            # MCP related
├── ui/             # Generic UI — useAutoScroll, useDebounce, useResizableSplit
├── system/         # System-level — useDeepLink, useTheme, usePwaMode
└── index.ts        # Public re-exports (optional)
```

## `utils/` — Grouping by Business Domain

Same principle as hooks. Group when exceeding 10 children.

```
utils/
├── file/           # File handling — base64, fileType, download
├── workspace/      # Workspace — workspace, workspaceEvents, workspaceFs
├── chat/           # Chat/message — chatMinimapEvents, diffUtils, latexDelimiters
├── model/          # Model/agent — agentLogo, modelCapabilities, modelContextLimits
├── theme/          # Theme/style — customCssProcessor, themeCssSync
├── ui/             # Generic UI — clipboard, focus, siderTooltip, HOC
├── common.ts       # Misc utilities
├── emitter.ts
└── platform.ts
```

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

| Type                            | Convention | Examples                                           |
| ------------------------------- | ---------- | -------------------------------------------------- |
| **Categorical** (standard role) | lowercase  | `components/`, `hooks/`, `context/`, `utils/`      |
| **Feature module** (business)   | PascalCase | `GroupedHistory/`, `Workspace/`, `Preview/`        |
| **Platform directory**          | lowercase  | `acp/`, `codex/`, `gemini/` (mirrors `src/agent/`) |

### Example

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
│       ├── acp/             # platform dir → lowercase
│       └── components/      # categorical → lowercase
└── hooks/                   # categorical → lowercase
```

## Shared vs Page-Private Code

| Scope                      | Location                                          |
| -------------------------- | ------------------------------------------------- |
| Used by **one** page       | `pages/<PageName>/components/`, `hooks/`, etc.    |
| Used by **multiple** pages | `src/renderer/components/`, `src/renderer/hooks/` |

**Promotion rule**: Start page-private. Move to shared only when a second consumer appears.

## Component Entry Points

- Directory-based components **must** have `index.tsx` as the public entry point
- Do not import internal files from outside the directory
