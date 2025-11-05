# Theme Color Migration Guide

## 🎨 使用方式

### 1. UnoCSS 原子类（推荐）✨

```tsx
// ✅ 背景色 - 简洁直观
<div className="bg-base">     // 主背景 (白色/黑色)
<div className="bg-1">        // 次级背景 (#F7F8FA)
<div className="bg-2">        // 三级背景 (#F2F3F5)
<div className="bg-brand">    // 品牌色背景 (#7583B2)

// ✅ 文本色 - 语义化
<div className="text-t-primary">    // 主要文字 (#1D2129)
<div className="text-t-secondary">  // 次要文字 (#86909C)
<div className="text-brand">        // 品牌色文字

// ✅ 边框色
<div className="border-b-base">     // 基础边框 (#E5E6EB)
<div className="border-b-light">    // 浅色边框

// ✅ 品牌色系列
<div className="bg-aou-1">           // AOU 色板 1-10
<div className="hover:bg-brand-hover"> // 品牌色悬停
```

### 2. 内联样式（CSS 变量）

```tsx
<div style={{ backgroundColor: 'var(--bg-base)' }}>
<div style={{ color: 'var(--text-primary)' }}>
<div style={{ borderColor: 'var(--border-base)' }}>
<div style={{ backgroundColor: 'var(--brand)' }}>
```

## 📋 常见颜色映射表

| 旧值 (Hex) | UnoCSS 类                     | CSS 变量                | 说明            |
| ---------- | ----------------------------- | ----------------------- | --------------- |
| `#FFFFFF`  | `bg-base`                     | `var(--bg-base)`        | 主背景          |
| `#F7F8FA`  | `bg-1`                        | `var(--bg-1)`           | 次级背景/填充色 |
| `#F2F3F5`  | `bg-2`                        | `var(--bg-2)`           | 三级背景        |
| `#E5E6EB`  | `bg-3` 或 `border-b-base`     | `var(--border-base)`    | 边框/分隔线     |
| `#7583B2`  | `bg-brand` / `text-brand`     | `var(--brand)`          | 品牌色          |
| `#EFF0F6`  | `bg-aou-1` / `bg-brand-light` | `var(--aou-1)`          | 品牌浅色背景    |
| `#E5E7F0`  | `bg-aou-2`                    | `var(--aou-2)`          | AOU 色板 2      |
| `#1D2129`  | `text-t-primary`              | `var(--text-primary)`   | 主要文字        |
| `#86909C`  | `text-t-secondary` / `bg-6`   | `var(--text-secondary)` | 次要文字        |
| `#165DFF`  | `bg-primary` / `text-primary` | `var(--primary)`        | 主色调          |

## 🔄 迁移步骤

1. **搜索**硬编码颜色：`bg-#`, `text-#`, `color-#`, `border-#`
2. **查表**对应的主题变量
3. **替换**为 UnoCSS 类
4. **测试**明暗主题切换

## 💡 迁移示例

### Before (硬编码):

```tsx
<div className='bg-#EFF0F6 hover:bg-#E5E7F0'>
  <span className='text-#1D2129'>文本</span>
  <div className='border border-#E5E6EB'></div>
</div>
```

### After (主题变量):

```tsx
<div className='bg-aou-1 hover:bg-aou-2'>
  <span className='text-t-primary'>文本</span>
  <div className='border border-b-base'></div>
</div>
```

### 常见模式:

```tsx
// ❌ 不推荐
<div className="bg-#F7F8FA text-#86909C border-#E5E6EB">

// ✅ 推荐
<div className="bg-1 text-t-secondary border-b-base">
```

## 🎯 快速参考

- **背景**: `bg-base`, `bg-1`, `bg-2`, `bg-3`
- **文字**: `text-t-primary`, `text-t-secondary`, `text-t-disabled`
- **边框**: `border-b-base`, `border-b-light`
- **品牌**: `bg-brand`, `bg-brand-light`, `bg-brand-hover`
- **状态**: `bg-primary`, `bg-success`, `bg-warning`, `bg-danger`
- **AOU色板**: `bg-aou-1` ~ `bg-aou-10`
