# AionUi UI Context

This document is the canonical UI context for AionUi contributors and agents.

## TL;DR — 7 Hard Rules

If you only read this section, follow these rules and you will not embarrass
yourself:

1. **No hard-coded visual values.** Colors, radius, shadow, and spacing must
   come from AOU tokens, CSS variables, or the spacing rhythm — all defined in
   the AOU section below.
2. **Light + dark themes are both required.** Anything that only looks correct
   in one theme is broken.
3. **Mobile is not optional.** Consider mobile layout from the start, not after
   the desktop version is "done".
4. **All user-facing copy uses i18n keys** and must tolerate longer
   translations without breaking layout.
5. **Reuse before building.** Order of preference:
   `src/renderer/components/base/Aion*` → Arco primitives → thin shared wrapper
   → new pattern (last resort, must be justified).
6. **States must be complete:** `default`, `hover`, `focus`, `active`,
   `disabled`, `loading`, `error`, `empty` — whichever apply.
7. **PRs touching `src/renderer/` must cite ≥2 existing AionUi reference
   components** and explain what was reused / extended / created and why.

The rest of this document expands on these rules with concrete patterns,
references, and decision trees.

## AionUi Design System (AOU)

AionUi has a design token system named **AOU**, based on Figma design tokens. It currently covers **colors, themes, and typography via Arco**; spacing is governed by an explicit rhythm convention (see Spacing below) rather than dedicated tokens.

### Colors & Themes

**Before writing any styles, read these in order:**

1. [`src/renderer/styles/MIGRATION.md`](../../src/renderer/styles/MIGRATION.md) — **Start here.** Token usage guide with the full color mapping table, UnoCSS atomic classes (`bg-base`, `bg-1`, `bg-aou-1~10`, `text-t-primary`, `border-b-base`, etc.), inline `var(--...)` syntax, and before/after migration examples.
2. [`src/renderer/styles/themes/README.md`](../../src/renderer/styles/themes/README.md) — Theme architecture: how `light/dark mode` and `color scheme` are separated, which `data-*` attributes drive switching, file layout.
3. [`src/renderer/styles/colors.ts`](../../src/renderer/styles/colors.ts) — TypeScript constants and types for every CSS variable, useful when you need token names from TS code.
4. [`src/renderer/styles/themes/base.css`](../../src/renderer/styles/themes/base.css) and [`default-color-scheme.css`](../../src/renderer/styles/themes/default-color-scheme.css) — The actual CSS variable definitions and default values.

**Quick reference:**

- Backgrounds: `bg-base`, `bg-1`, `bg-2`, `bg-3`
- Text: `text-t-primary`, `text-t-secondary`, `text-t-disabled`
- Borders: `border-b-base`, `border-b-light`
- Brand: `bg-brand`, `bg-brand-light`, `bg-brand-hover`
- Status: `bg-primary`, `bg-success`, `bg-warning`, `bg-danger`
- AOU palette: `bg-aou-1` ~ `bg-aou-10`

This document does **not** duplicate the token table — `MIGRATION.md` is the single source of truth. If a token is missing from `MIGRATION.md`, fix it there, not here.

### Spacing

AionUi does not currently expose dedicated spacing tokens (no `--space-*` variables). Use the following 6-value rhythm with the default Tailwind/UnoCSS spacing utilities (`gap-*`, `p-*`, `m-*`, `space-*`):

```
4 · 8 · 12 · 16 · 24 · 32
```

- `4` — micro gaps inside dense controls
- `8` — default gap between adjacent controls
- `12` — grouped controls inside a section
- `16` — between sections inside a panel
- `24` — between major panels
- `32` — page-level container padding

Any other value (e.g. `6`, `10`, `14`, `20`, `28`) is **out-of-rhythm** and must be justified in code with a comment, otherwise reviewers will request changes.

## Scope

Read this document before implementing non-trivial UI changes.

Use it together with:

- `.claude/skills/architecture/SKILL.md` for file placement, structure, and shared-vs-private decisions
- `AGENTS.md` for repo-wide engineering rules
- `docs/conventions/file-structure.md` for renderer naming, CSS, and module layout rules

This document covers AionUi-specific UI decisions:

- reuse strategy
- component selection
- visual consistency
- theme behavior
- mobile adaptation
- PR evidence and review expectations

## Design Goals

- Product tone: practical, precise, restrained
- Target experience: high information density with low cognitive noise
- Priority order: consistency, maintainability, reusability

## Component Baseline

> Design tokens (colors, themes, spacing) live in the **AionUi Design System (AOU)** section above. This section only lists component-level entry points.

**Authoritative entry:** [`src/renderer/components/base/index.ts`](../../src/renderer/components/base/index.ts) — the canonical export of all `Aion*` shared wrappers. **Always treat this file as the source of truth**; do not assume the list below is exhaustive.

Components are organised by responsibility under `src/renderer/components/`:

| Directory   | What lives here                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base/`     | All `Aion*` shared wrappers (Modal, ScrollArea, Collapse, Select, Steps, FileChangesPanel, ModalWrapper, StepsWrapper, …). Start here when you need a primitive.                 |
| `layout/`   | App shell: `Layout`, `Router`, `Sider/`, `Titlebar/`, `WindowControls`, `FlexFullContainer`, `AppLoader`, `PwaPullToRefresh`.                                                    |
| `chat/`     | Chat surfaces: `sendbox`, `SlashCommandMenu`, `EmojiPicker`, `SpeechInputButton`, `ThoughtDisplay`, `CommandQueuePanel`, `CollapsibleContent`, `BtwOverlay/`.                    |
| `settings/` | Settings flows. Entry: [`settings/SettingsModal/index.tsx`](../../src/renderer/components/settings/SettingsModal/index.tsx) — read it before introducing any new dialog pattern. |
| `agent/`    | Agent display + selection (`AgentSetupCard`, `AgentModeSelector`, `AcpModelSelector`, `MarqueePillLabel`, `ContextUsageIndicator`, …).                                           |
| `media/`    | File / media surfaces (`FilePreview`, `LocalImageView`, `Diff2Html`, `HorizontalFileList`, `UploadProgressBar`, `WebviewHost`).                                                  |
| `Markdown/` | Markdown rendering.                                                                                                                                                              |

**Before creating a new component**, scan the relevant directory above (and its `index.ts` if present) — most needs are already covered. Lists are intentionally written to age gracefully; if you find a gap or stale entry, fix it in the same PR.

## Style Preferences

- Corner radius within the same feature must be consistent — pick one and stick to it
- Do not mix sharp (`rounded-none`) and pronounced (`rounded-xl`+) surfaces in the same view
- When wrapping an Arco primitive, match the radius of nearby AionUi surfaces rather than reverting to Arco defaults

## Library Strategy

- The only allowed UI stack is **Aion base wrappers + Arco**
- Do not introduce a second component library (shadcn/ui, MUI, Mantine, etc.) — there is no token adapter, no precedent, and no review path for it
- If you believe a second library is genuinely necessary, raise it as a separate proposal before writing any code; do not sneak it in as part of a feature PR

## Reuse Priority

1. Reuse an existing component directly
2. Reuse the closest component with light extension
3. Compose with Aion base + Arco + AOU design tokens (see AOU section)
4. Create a new visual pattern only when steps 1-3 cannot satisfy the requirement

## When To Wrap An Arco Primitive

The selection order itself is covered by **Reuse Priority** above. Beyond reuse, the question is: when does an ad-hoc style pattern deserve to be promoted into a shared `Aion*` wrapper? Wrap an Arco primitive into an Aion wrapper when any 2 of these are true:

- The same className combination appears in **≥3 files**
- The same token combination appears in **≥3 files**
- The component needs custom light/dark handling beyond what Arco provides out of the box
- The component has accessibility behavior (focus trap, keyboard nav, ARIA) that needs to stay consistent across uses

## Decision Tree

Use this order when making UI choices:

1. Can an existing Aion component be used as-is?
2. Can the closest existing component be extended without introducing a new visual language?
3. Can this be composed from Aion base wrappers, Arco primitives, and AOU tokens?
4. If not, should a thin shared wrapper be extracted because the pattern will repeat?
5. Only then introduce a new pattern, and document why reuse was insufficient

## AI UI Workflow

Every non-trivial UI change should pass these four mental stages. The same four words appear in the PR template's UI Self-check section, so use them consistently.

These four names also happen to match four optional community skills (`normalize`, `adapt`, `harden`, `polish`). **They are not bundled with this repository** — if you have them installed in your personal `~/.claude/skills/`, you can run them as slash commands; otherwise, just treat the four stages as a checklist.

1. `normalize` — Align structure, naming, and placement with repo conventions
2. `adapt` — Fit the feature into existing AionUi patterns, wrappers, and theme behavior
3. `harden` — Cover responsive behavior, long text, states, and accessibility basics
4. `polish` — Tighten spacing, alignment, surface treatment, and reduce visual noise

## Reference Surfaces

Match new work against at least 2 existing surfaces with real file references.

> **Maintenance note:** if any of the files below has been moved, renamed, or
> deleted, update this section in the same PR that discovers the breakage. A
> stale reference list is worse than no list at all.

General input and send flow:

- `src/renderer/components/chat/sendbox.tsx`
- `src/renderer/pages/guid/components/QuickActionButtons.tsx`

Dialogs and settings:

- `src/renderer/components/settings/SettingsModal/index.tsx`
- `src/renderer/pages/settings/WebuiSettings.tsx`

Homepage and assistant selection:

- `src/renderer/pages/guid/GuidPage.tsx`
- `src/renderer/pages/guid/components/AgentPillBar.tsx`
- `src/renderer/pages/guid/components/AssistantSelectionArea.tsx`

Dense content and search surfaces:

- `src/renderer/pages/conversation/GroupedHistory/index.tsx`
- `src/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover.tsx`
- `src/renderer/pages/conversation/workspace/index.tsx`

## PR Expectations For UI Changes

The PR body for any change touching `src/renderer/` must fill in the **UI CHANGES** block in [`.github/pull_request_template.md`](../../.github/pull_request_template.md). That block already contains the required fields (Reference Components, Reuse Rationale, screenshots, self-check) — do not duplicate the schema here.

## UI Review Rejection Triggers

The `pr-review` skill (and human reviewers) will request changes when any of the
following conditions is met. The rules being enforced are defined in the **TL;DR
— 7 Hard Rules** section above; this list only describes the _trigger
conditions_, not new rules.

- Any of the 7 Hard Rules is violated
- PR body is missing `Reference Components` (≥2) or `Reuse Rationale`
- PR body is missing desktop + mobile, light + dark screenshots
- A second UI library (shadcn/ui, MUI, Mantine, etc.) is introduced without a separate prior proposal
- Spacing falls outside the 6-value rhythm without an inline justification comment

---

> **Maintenance:** Last reviewed 2026-04-07. Owner: @ringringlin. To propose
> changes, open a PR with the `docs(ui):` commit prefix and tag the owner for
> review. If you find a stale file reference, fix it in the same PR.
