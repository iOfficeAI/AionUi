# Theme System 主题系统

## Architecture Overview 架构概览

The theme system separates light/dark mode from color schemes for better extensibility.
主题系统将明暗模式与配色方案分离，以提供更好的扩展性。

### Two Dimensions 两个维度

1. **Light/Dark Mode 明暗模式** (`theme`)
   - Controlled by `useTheme` hook
   - Values: `'light'` | `'dark'`
   - Controls: `[data-theme]` attribute on `<html>` and `arco-theme` attribute on `<body>`
   - 由 `useTheme` Hook 控制
   - 取值：`'light'` | `'dark'`
   - 控制：`<html>` 的 `[data-theme]` 属性和 `<body>` 的 `arco-theme` 属性

2. **Color Scheme 配色方案** (`colorScheme`)
   - Controlled by `useColorScheme` hook
   - Values: `'default'`
   - Controls: `[data-color-scheme]` attribute on `<html>`
   - 由 `useColorScheme` Hook 控制
   - 取值：`'default'`
   - 控制：`<html>` 的 `[data-color-scheme]` 属性

### File Structure 文件结构

```
styles/themes/
├── index.css                 # Entry point 入口文件
├── base.css                  # Theme-independent base styles 主题无关的基础样式
└── color-schemes/            # Color scheme definitions 配色方案定义
    └── default.css           # Default color scheme (AOU brand) 默认配色方案
```

## How to Add a New Color Scheme 如何添加新配色方案

When you need to add a new color scheme in the future, follow these steps:
当需要添加新配色方案时，请遵循以下步骤：

1. Create a new CSS file in `color-schemes/` directory (e.g., `blue.css`)
   在 `color-schemes/` 目录下创建新的 CSS 文件（如 `blue.css`）

2. Define CSS variables for both light and dark modes, following the structure in `default.css`
   定义明暗两种模式的 CSS 变量，参考 `default.css` 的结构

3. Import the new file in `index.css`
   在 `index.css` 中导入新文件

4. Update the `ColorScheme` type in `hooks/useColorScheme.ts`
   更新 `hooks/useColorScheme.ts` 中的 `ColorScheme` 类型

5. Add UI selector option and translations
   添加 UI 选择器选项和翻译

## CSS Variable Naming Convention CSS 变量命名规范

### Brand Colors 品牌色

- `--aou-1` to `--aou-10`: Brand color palette (1=lightest, 10=darkest)
- `--aou-1` 到 `--aou-10`：品牌色调色板（1=最浅，10=最深）

### Background Colors 背景色

- `--bg-base`: Main background 主背景
- `--bg-1`: Secondary background 次级背景
- `--bg-2`: Tertiary background 三级背景
- `--bg-3`: Border/divider 边框/分隔线
- `--bg-hover`: Hover state 悬停状态
- `--bg-active`: Active/pressed state 激活/按下状态

### Text Colors 文字色

- `--text-primary`: Primary text 主要文字
- `--text-secondary`: Secondary text 次要文字
- `--text-disabled`: Disabled text 禁用文字

### Semantic Colors 语义色

- `--primary`: Primary action color 主要操作色
- `--success`: Success state 成功状态
- `--warning`: Warning state 警告状态
- `--danger`: Danger state 危险状态

### Brand-specific Colors 品牌专用色

- `--brand`: Main brand color 主品牌色
- `--brand-light`: Light brand background 浅色品牌背景
- `--brand-hover`: Brand hover state 品牌悬停状态

### Component-specific Colors 组件专用色

- `--message-user-bg`: User message background 用户消息背景
- `--message-tips-bg`: Tips message background 提示消息背景
- `--workspace-btn-bg`: Workspace button background 工作区按钮背景

## Best Practices 最佳实践

1. **Always define both light and dark variants** for each color scheme
   每个配色方案都要定义浅色和暗色两个变体

2. **Maintain consistent lightness progression** in brand color scales (1→10)
   保持品牌色阶的明度递进一致性（1→10）

3. **Test in both light and dark modes** before finalizing
   在确定前测试浅色和暗色两种模式

4. **Use semantic names** for component-specific colors
   组件专用色使用语义化命名

5. **Keep background colors neutral** (grays) to maintain readability
   保持背景色中性（灰色系）以维持可读性

## Current Status 当前状态

- ✅ Infrastructure ready 基础架构就绪
- ✅ Default color scheme implemented 默认配色方案已实现
- ⏸️ Additional color schemes pending designer input 其他配色方案等待设计师输入
- 💡 UI selector commented out, ready to enable 界面选择器已注释，可随时启用
