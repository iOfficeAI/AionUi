# Theme System 主题系统

## Architecture Overview 架构概览

A theme is described by a single unified model, `Theme`
(`common/theme/types.ts`). Every theme carries an `appearance` (`'light'` | `'dark'`) plus two optional, layered override channels:

- **`tokens`** — a structured, validated map of CSS custom properties. This is the preferred way to re-tint the app. Only keys in the token contract (`common/theme/tokenContract.ts`) are honored.
- **`css`** — a raw CSS escape hatch for decorative / user themes. It is sandboxed by `customCssProcessor.ts` (auto-`!important`, scoped) before being injected.

一个主题由统一模型 `Theme`（`common/theme/types.ts`）描述。每个主题都带有 `appearance`（`'light'` | `'dark'`），并可选地携带两条分层覆盖通道：结构化的 `tokens`（推荐）与原始 `css`（转义出口，经 `customCssProcessor.ts` 沙箱化）。

### Runtime dimensions 运行时维度

Applying a theme (`utils/theme/applyTheme.ts`) drives two DOM attributes and appends up to two `<style>` elements, kept last in `<head>`:

| Dimension         | Attribute                       | Set on   | Source                                           |
| ----------------- | ------------------------------- | -------- | ------------------------------------------------ |
| Appearance 明暗   | `[data-theme]`                  | `<html>` | `theme.appearance` (System resolves via OS)      |
| Arco Design       | `arco-theme`                    | `<body>` | mirrors appearance                               |
| Color scheme 配色 | `[data-color-scheme='default']` | `<html>` | baseline variables in `default-color-scheme.css` |
| Token overrides   | `<style id="theme-tokens">`     | `<head>` | `theme.tokens` → `tokensToCss.ts`                |
| Decoration        | `<style id="theme-decoration">` | `<head>` | `theme.css` (sandboxed)                          |

Baseline colors live in `default-color-scheme.css`. A theme's `tokens` / `css` are layered on top of that baseline; they override, they do not replace it.

## File structure 文件结构

```
common/theme/
├── types.ts            # Theme / ThemeTokens / TokenMap models 主题模型
├── constants.ts        # Built-in theme ids (light/dark/system) 内置主题 id
├── tokenContract.ts    # Authoritative overridable token list 可覆盖 token 契约
└── resolveTheme.ts     # activeId → concrete Theme 解析激活主题

renderer/
├── theme/builtinThemes.ts             # BUILTIN_THEMES (Light / Dark)
├── utils/theme/applyTheme.ts          # Apply a Theme to the DOM 应用主题
├── utils/theme/tokensToCss.ts         # tokens → scoped CSS 结构化 token 转 CSS
├── utils/theme/customCssProcessor.ts  # Sandbox raw css 沙箱化原始 css
└── styles/themes/
    ├── index.css                       # Entry point 入口
    ├── base.css                        # Appearance-independent base 基础样式
    └── default-color-scheme.css        # Baseline variables 基线变量
```

## The token contract 主题 token 契约

`common/theme/tokenContract.ts` is the single source of truth for which CSS custom properties a theme may override. `tokensToCss` silently drops any key not in the contract, so unknown / typo'd variables never leak into the DOM.

`tokenContract.ts` 是"哪些 CSS 变量可被主题覆盖"的唯一事实来源；不在契约中的 key 会被 `tokensToCss` 静默丢弃。

Each token declares a `scope`:

- **`appearance-invariant`** — same value in light and dark. Put it under `tokens.root`; it is emitted at `:root`.
- **`appearance-scoped`** — different per mode. Put it under `tokens.light` / `tokens.dark`; it is emitted under `:root[data-theme='light' | 'dark']`.

> ⚠️ Appearance selectors deliberately use `:root[data-theme='…']` (specificity `0,2,0`) so they can win against the baseline dark block (`[data-color-scheme='default'][data-theme='dark']`, also `0,2,0`). A bare `[data-theme='dark']` would silently lose in dark mode.

### Overridable tokens 可覆盖 token 一览

Grouped as in `tokenContract.ts` (`i` = appearance-invariant, otherwise appearance-scoped):

- **Background**: `--bg-base` `--bg-1` `--bg-2` `--bg-3` `--bg-6` `--bg-hover` `--bg-active`
- **Text**: `--text-primary` `--text-secondary` `--text-disabled` `--text-white` (i)
- **Border**: `--border-base` `--border-light` `--border-special`
- **Semantic**: `--primary` `--success` `--warning` `--danger` `--info`
- **Brand**: `--brand` `--brand-light` `--brand-hover`
- **Component**: `--message-user-bg` `--message-tips-bg` `--workspace-btn-bg` `--thought-gradient`
- **Special**: `--fill` `--fill-0` `--dialog-fill-0` `--inverse` (i)

Arco Design's own scales (`--color-*`, `--primary-6`, …) are intentionally **not** part of the contract — they are driven by the `arco-theme` attribute, not by user themes.

## How to add a built-in theme 如何新增内置主题

Prefer the `tokens` channel over raw CSS: keep the Light/Dark neutrals and only
re-tint what you need, split per appearance.

优先使用 `tokens` 通道而非裸 CSS：保留明暗中性色，只按需重新着色，并按明暗分层。

1. Add an id constant in `common/theme/constants.ts`.
2. Append a `Theme` to `BUILTIN_THEMES` in `renderer/theme/builtinThemes.ts`, filling `tokens.light` / `tokens.dark` (and `tokens.root` for invariant keys).
3. Only use keys from the token contract; add a new key to `tokenContract.ts` **and** `default-color-scheme.css` first if you genuinely need one.
4. Test both light and dark before finalizing.

## How to add a custom (user) theme 如何添加自定义主题

End users create themes without touching code, via
**Settings → Appearance → add a custom theme**. That flow uses the raw **`css`**
channel: pick a name + light/dark, then paste CSS overriding the contract
variables under `:root { … }` and (optionally) `[data-theme='dark'] { … }`.

终端用户无需改代码，通过 **设置 → 外观 → 添加自定义主题** 创建；该入口走 `css`
通道。完整步骤与示例见 [`docs/guides/custom-theme.md`](../../../../../../docs/guides/custom-theme.md)。

## Best practices 最佳实践

1. Reach for **`tokens`** first; use raw **`css`** only for decoration that the contract cannot express. 优先 `tokens`，`css` 仅用于契约无法表达的装饰。
2. For appearance-scoped tokens, **always provide both light and dark values**. 随明暗变化的 token 必须同时给出明暗两套值。
3. **Never hardcode colors in components** — use semantic tokens / variables so custom themes take effect. 组件内禁止硬编码颜色。
4. Keep background colors neutral for readability. 背景色保持中性以维持可读性。

## Current status 当前状态

- ✅ Unified `Theme` model with structured `tokens` + sandboxed `css` channels
- ✅ Token contract enforced by `tokensToCss` (unknown keys dropped)
- ✅ Built-in themes: Light / Dark (+ System sentinel)
- ✅ Per-appearance token layering (`:root` / `:root[data-theme]`)
