# Custom Themes - Authoring Guide

AionUi ships with **Light** and **Dark** themes, but you can create your own
color themes without touching any code. A custom theme is just a small block of
CSS that overrides a set of documented **theme variables** (CSS custom
properties). This guide shows you exactly what to write and how to apply it.

- [How theming works](#how-theming-works)
- [Add a custom theme (step by step)](#add-a-custom-theme-step-by-step)
- [Writing the CSS](#writing-the-css)
- [Available variables](#available-variables)
- [Full example](#full-example)
- [Tips & troubleshooting](#tips--troubleshooting)

---

## How theming works

Every surface in AionUi reads its colors from a fixed set of **semantic
variables** rather than hardcoded values. For example, the accent color is
always `var(--primary)`, the main background is always `var(--bg-base)`, and so
on. A theme simply supplies new values for those variables.

Your custom theme layers **on top of** the built-in Light or Dark baseline:

- You pick a **base appearance** (`light` or `dark`) when you create the theme.
  That decides the starting point (default neutrals, Arco Design widget styling,
  scrollbars, etc.).
- Your CSS then **overrides only the variables you care about**. Anything you
  don't override keeps its baseline value, so you never have to redefine the
  whole palette.

Two selectors are recognized:

| Selector                    | Applies to        | Use it for                                                 |
| --------------------------- | ----------------- | ---------------------------------------------------------- |
| `:root { … }`               | Always            | Your main palette (matches the base appearance you chose). |
| `[data-theme='dark'] { … }` | Only in dark mode | Optional dark-mode-specific overrides.                     |

> If you only target one appearance, a single `:root { … }` block is enough.

---

## Add a custom theme (step by step)

1. Open **Settings → Appearance**.
2. Under the theme gallery, choose **Add a custom theme**.
3. Fill in the form:
   - **Name** — anything, e.g. `Neo-Brutalism`.
   - **Base appearance** — `Light` or `Dark`. Pick the one closest to your
     target so you override fewer variables.
   - **CSS** — paste your theme CSS (see [below](#writing-the-css)).
4. Watch the **live preview** update as you type.
5. **Save**. Your theme now appears in the gallery; click it to activate.

Custom themes are stored in your local config and are applied across all app
windows. You can edit or delete them any time from the same screen.

---

## Writing the CSS

Rules of the road:

- **Only override the documented variables** in the
  [Available variables](#available-variables) table. Unknown / misspelled
  variables are ignored.
- **Always include the `--` prefix**, e.g. `--primary: #ff5c00;`.
- **Keep enough contrast.** Text variables must stay readable on their matching
  backgrounds. Aim for a WCAG AA contrast ratio (≥ 4.5:1 for body text).
- **`!important` is handled for you.** The app sandboxes your CSS and raises its
  specificity automatically, so you don't need to add `!important` yourself.

A minimal theme looks like this:

```css
:root {
  --primary: #ff5c00;
  --bg-base: #fffdf5;
  --text-primary: #111111;
}
```

To also tweak dark mode, add a second block:

```css
:root {
  --primary: #ff5c00;
}
[data-theme='dark'] {
  --primary: #ffa562;
}
```

---

## Available variables

These are the variables a theme may override, grouped by purpose. Values shown
are the **Light** baseline, for reference.

### Backgrounds

| Variable      | Baseline (Light) | Meaning                        |
| ------------- | ---------------- | ------------------------------ |
| `--bg-base`   | `#ffffff`        | Primary app background         |
| `--bg-1`      | `#f9fafb`        | Secondary background           |
| `--bg-2`      | `#f2f3f5`        | Tertiary background            |
| `--bg-3`      | `#e5e6eb`        | Border / divider background    |
| `--bg-6`      | `#86909c`        | Disabled / secondary icon fill |
| `--bg-hover`  | `#f3f4f6`        | Hover background               |
| `--bg-active` | —                | Active / pressed background    |

### Text

| Variable           | Meaning                                  |
| ------------------ | ---------------------------------------- |
| `--text-primary`   | Primary text                             |
| `--text-secondary` | Secondary text                           |
| `--text-disabled`  | Disabled text                            |
| `--text-white`     | Always-white text (same in light & dark) |

### Borders

| Variable           | Meaning             |
| ------------------ | ------------------- |
| `--border-base`    | Base border         |
| `--border-light`   | Light border        |
| `--border-special` | Special-case border |

### Semantic colors

| Variable    | Meaning                |
| ----------- | ---------------------- |
| `--primary` | Primary / accent color |
| `--success` | Success color          |
| `--warning` | Warning color          |
| `--danger`  | Danger / error color   |
| `--info`    | Info color             |

### Brand

| Variable        | Meaning                |
| --------------- | ---------------------- |
| `--brand`       | Brand color            |
| `--brand-light` | Brand light background |
| `--brand-hover` | Brand hover color      |

### Components

| Variable             | Meaning                                                      |
| -------------------- | ------------------------------------------------------------ |
| `--message-user-bg`  | User message bubble background                               |
| `--message-tips-bg`  | Tips message background                                      |
| `--workspace-btn-bg` | Workspace button background                                  |
| `--thought-gradient` | Thinking panel background (accepts a `linear-gradient(...)`) |

### Special

| Variable          | Meaning                |
| ----------------- | ---------------------- |
| `--fill`          | Generic fill           |
| `--fill-0`        | Fill 0                 |
| `--dialog-fill-0` | Dialog fill            |
| `--inverse`       | Inverse (always white) |

> The authoritative list lives in
> [`packages/desktop/src/common/theme/tokenContract.ts`](../../packages/desktop/src/common/theme/tokenContract.ts).
> Arco Design's internal scales (`--color-*`, `--primary-6`, …) are **not** part
> of this contract and are driven by the base appearance instead.

---

## Full example

A complete, readable starter theme. Copy it into the CSS field, choose **Light**
as the base appearance, and save.

```css
:root {
  --primary: #4f46e5;
  --info: #4f46e5;
  --brand: #4f46e5;
  --brand-hover: #6366f1;
  --brand-light: #eef2ff;

  --bg-base: #fbfbfe;
  --bg-1: #f4f4fb;
  --bg-2: #ececf7;

  --text-primary: #1a1a2e;
  --text-secondary: #4b4b63;

  --message-user-bg: #eef2ff;
  --message-tips-bg: #f5f3ff;
}
```

For a ready-made, high-contrast theme, see the Neo-Brutalism theme in
[`docs/theming/examples/neo-brutalism.css`](../theming/examples/neo-brutalism.css).

---

## Tips & troubleshooting

- **Nothing changed after saving.** Make sure you activated the theme (click its
  card in the gallery), and that you overrode a variable that's actually visible
  on screen — e.g. `--primary` shows on buttons/links, `--bg-base` is the whole
  background.
- **My variable is ignored.** Check the exact name against the
  [Available variables](#available-variables) table (including the `--` prefix).
  Unknown variables are silently dropped.
- **Text is hard to read.** You probably changed a background without updating
  the matching text color. Adjust `--text-primary` / `--text-secondary` to keep
  contrast.
- **Dark mode looks off.** Add a `[data-theme='dark'] { … }` block with
  dark-appropriate values; light values rarely translate directly to dark.
- **I want to share my theme.** Just share the CSS block — anyone can paste it
  into their own **Add a custom theme** form.
