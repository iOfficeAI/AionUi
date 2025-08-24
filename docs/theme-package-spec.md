# AionUI 主题包规范

## 主题包结构

```
theme-package/
├── manifest.json          # 主题包元信息
├── variables.css          # CSS变量定义
├── components/            # 组件样式模块
│   ├── button.css
│   ├── input.css
│   ├── modal.css
│   └── ...
├── layouts/               # 布局样式
│   ├── sidebar.css
│   └── main.css
├── utilities/             # 工具类样式
│   ├── colors.css
│   └── spacing.css
└── overrides.css          # 第三方库覆盖样式

```

## manifest.json 格式

```json
{
  "name": "主题包名称",
  "id": "theme-unique-id",
  "version": "1.0.0",
  "author": "作者名",
  "description": "主题描述",
  "mode": "light|dark",
  "baseTheme": "default-light", // 基础主题
  "variables": {
    "primary": "#1677ff",
    "background": "#ffffff"
  },
  "modules": {
    "components": ["button", "input", "modal"],
    "layouts": ["sidebar", "main"],
    "overrides": true
  },
  "unocss": {
    "safelist": ["theme-*"],
    "shortcuts": {
      "btn-primary": "bg-primary text-white"
    }
  }
}
```

## CSS 模块化组织

### variables.css
```css
:root[data-theme="theme-id"] {
  /* 核心变量 */
  --theme-primary: #1677ff;
  --theme-background: #ffffff;
  
  /* 语义化变量 */
  --theme-surface-primary: var(--theme-background);
  --theme-text-primary: #1f2937;
}
```

### components/button.css
```css
[data-theme="theme-id"] .aion-button {
  background-color: var(--theme-primary);
  color: var(--theme-text-on-primary);
  border: 1px solid var(--theme-border-primary);
}

[data-theme="theme-id"] .aion-button:hover {
  background-color: var(--theme-primary-hover);
}
```