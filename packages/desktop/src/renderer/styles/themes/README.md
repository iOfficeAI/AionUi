# Theme System 主题系统

## Architecture Overview 架构概览

The theme system separates light/dark mode, the color-scheme override, and the
selectable CSS theme preset. They combine via attributes on `<html>`.
主题系统将明暗模式、配色方案覆盖和可选 CSS 主题预设分离，通过 `<html>` 的属性组合在一起。

### Three Axes 三个维度

1. **Light/Dark Mode 明暗模式** (`theme`)
   - Controlled by `useTheme` hook
   - Values: `'light'` | `'dark'`
   - Controls: `[data-theme]` on `<html>` and `arco-theme` on `<body>`

2. **Color Scheme 配色方案** (`colorScheme`)
   - Controlled by `useColorScheme` hook
   - Values: `'chisl'` | `'theme'`
   - Controls: `[data-color-scheme]` on `<html>`
   - `'chisl'` applies the Chisl brand palette and overrides the active CSS theme preset.
   - `'theme'` removes the override so the active CSS theme preset (Catppuccin by
     default) drives variables directly.

3. **CSS Theme Preset CSS 主题预设**
   - Controlled by `CssThemeSettings` / `Layout` (loads the active preset/extension/user theme into a `<style>` tag).
   - Only one preset ships built-in: Catppuccin (`pages/settings/DisplaySettings/presets/catppuccin.css`).
   - Preset CSS targets `[data-color-scheme='theme']`, so it only paints variables when the Chisl override is off.

### File Structure 文件结构

```
styles/themes/
├── index.css              # Entry point 入口文件 (imports base + chisl color scheme)
├── base.css               # Theme-independent base styles 主题无关的基础样式
└── chisl-color-scheme.css # Chisl color scheme (overrides preset variables) Chisl 配色方案

pages/settings/DisplaySettings/presets/
└── catppuccin.css         # The single built-in CSS theme preset 内置的唯一 CSS 主题预设
```

## How to Add a New Color Scheme 如何添加新配色方案

1. Create `<name>-color-scheme.css` next to `chisl-color-scheme.css`, scoped to
   `[data-color-scheme='<name>']` and `[data-color-scheme='<name>'][data-theme='dark']`.
2. Import it from `index.css`.
3. Add `'<name>'` to the `ColorScheme` type and `VALID_COLOR_SCHEMES` in
   `hooks/ui/useColorScheme.ts`.
4. Add the option (with i18n key) to `components/settings/ColorSchemeSwitcher.tsx`.

## How to Add Another Built-in CSS Theme Preset 如何添加 CSS 主题预设

1. Drop `<name>.css` in `pages/settings/DisplaySettings/presets/`, scoped to
   `[data-color-scheme='theme']` (and its `[data-theme='dark']` variant).
2. Add a cover SVG to `assets/themes/` and export it from `themeCovers.ts`.
3. Append an entry to `PRESET_THEMES` in `presets.ts`.

## CSS Variable Naming Convention CSS 变量命名规范

### Brand Colors 品牌色

- `--aou-1` to `--aou-10`: Brand color palette (1=lightest, 10=darkest)

### Background Colors 背景色

- `--bg-base`, `--bg-1`, `--bg-2`, `--bg-3`, `--bg-4`, `--bg-5`, `--bg-6`,
  `--bg-8`, `--bg-9`, `--bg-10`
- `--bg-hover`, `--bg-active`

### Text Colors 文字色

- `--text-primary`, `--text-secondary`, `--text-disabled`

### Semantic Colors 语义色

- `--primary`, `--success`, `--warning`, `--danger`, `--info`

### Brand-specific Colors 品牌专用色

- `--brand`, `--brand-light`, `--brand-hover`

### Component-specific Colors 组件专用色

- `--message-user-bg`, `--message-tips-bg`, `--workspace-btn-bg`

## Best Practices 最佳实践

1. **Define both light and dark variants** for every color scheme and preset.
2. **Keep lightness progression consistent** in brand color scales (1→10).
3. **Test in both light and dark modes** before finalizing.
4. **Use semantic names** for component-specific colors.
5. **Keep background colors neutral** to maintain readability.

## Current Status 当前状态

- ✅ Chisl color scheme (default override)
- ✅ Catppuccin built-in CSS theme preset (visible when scheme is `'theme'`)
- ⏸️ Additional color schemes or presets pending designer input
