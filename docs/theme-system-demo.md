# 新主题系统使用示例

## 快速开始

### 1. 使用新的主题工具类

```tsx
// 旧方式 - 使用复杂的 Tailwind/UnoCSS 组合
<div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
  <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors">
    点击按钮
  </button>
</div>

// 新方式 - 使用主题感知的工具类
<div className="card-base">
  <button className="btn-primary">
    点击按钮
  </button>
</div>
```

### 2. 导入样式系统

```tsx
// src/renderer/index.tsx
import './styles/index.css'; // 新的模块化样式入口
```

### 3. 使用主题包管理器

```tsx
import { ThemePackageManagerComponent } from './components/ThemePackageManager';

function SettingsPage() {
  const [showThemeManager, setShowThemeManager] = useState(false);
  
  return (
    <div>
      <button onClick={() => setShowThemeManager(true)}>
        管理主题包
      </button>
      
      <ThemePackageManagerComponent 
        visible={showThemeManager}
        onClose={() => setShowThemeManager(false)}
      />
    </div>
  );
}
```

## 可用的主题工具类

### 按钮类
- `btn-primary` - 主要按钮
- `btn-secondary` - 次要按钮  
- `btn-danger` - 危险按钮

### 表单类
- `input-base` - 基础输入框
- `textarea-base` - 基础文本域

### 布局类
- `card-base` - 基础卡片
- `card-header` - 卡片头部
- `card-body` - 卡片内容
- `modal-base` - 模态框
- `modal-overlay` - 模态框遮罩

### 侧边栏类  
- `sidebar-base` - 侧边栏容器
- `sidebar-item` - 侧边栏项目
- `sidebar-item-active` - 激活状态

### 下拉菜单类
- `dropdown-base` - 下拉菜单容器
- `dropdown-item` - 下拉菜单项
- `dropdown-item-selected` - 选中状态

### 文本类
- `text-primary` - 主要文本色
- `text-secondary` - 次要文本色
- `text-tertiary` - 三级文本色
- `text-disabled` - 禁用文本色

### 表面类
- `surface-primary` - 主要表面色
- `surface-secondary` - 次要表面色
- `surface-selected` - 选中表面色

### 边框类
- `border-primary` - 主要边框色
- `border-hover` - 悬停边框色
- `border-active` - 激活边框色

## 主题包操作

### 导出主题包

```typescript
import { ThemePackageManager } from './themes/themePackage';

const themeManager = ThemePackageManager.getInstance();

// 导出当前主题
const packageData = await themeManager.exportThemePackage(
  'current-theme-id', 
  'My Custom Theme'
);

// 保存为文件
const blob = new Blob([packageData], { type: 'application/json' });
const url = URL.createObjectURL(blob);
// ... 下载逻辑
```

### 导入主题包

```typescript
// 从文件读取
const fileContent = await file.text();

// 导入主题包
await themeManager.importThemePackage(fileContent);

// 保存到本地
const themePackage = JSON.parse(fileContent);
await themeManager.saveThemePackage(themePackage);
```

### 管理主题包

```typescript
// 获取已安装的主题包
const packages = await themeManager.getInstalledThemePackages();

// 删除主题包
await themeManager.removeThemePackage('theme-id');
```

## 主题包格式

```json
{
  "manifest": {
    "name": "深蓝主题",
    "id": "deep-blue-theme-1234567890",
    "version": "1.0.0",
    "author": "AionUI User",
    "description": "深蓝色调的专业主题",
    "mode": "dark",
    "variables": {
      "primary": "#1e40af",
      "background": "#0f172a",
      "surface": "#1e293b",
      "textPrimary": "#f8fafc"
    },
    "modules": {
      "components": ["button", "form", "dropdown", "modal"],
      "layouts": ["sidebar", "main"],
      "overrides": true
    }
  },
  "styles": {
    "variables": ":root[data-theme-id=\"deep-blue-theme-1234567890\"] { --theme-primary: #1e40af; }",
    "components": {
      "button": "[data-theme-id=\"deep-blue-theme-1234567890\"] .btn-primary { ... }",
      "form": "[data-theme-id=\"deep-blue-theme-1234567890\"] .input-base { ... }"
    }
  }
}
```

## CSS变量直接使用

```css
.custom-component {
  background-color: var(--theme-surface);
  border: 1px solid var(--theme-border);
  color: var(--theme-text-primary);
  border-radius: var(--theme-input-radius);
  padding: var(--theme-spacing-md);
  box-shadow: var(--theme-shadow-sm);
  transition: all 0.2s ease;
}

.custom-component:hover {
  background-color: var(--theme-surface-hover);
  border-color: var(--theme-border-hover);
}
```

## 主题模式变体

```html
<!-- 根据主题模式显示不同样式 -->
<div class="theme-light:bg-white theme-dark:bg-gray-900">
  自适应背景色
</div>

<!-- 特定主题ID的样式 -->
<div class="theme-id-deep-blue:text-blue-300">
  深蓝主题专用文本色
</div>
```

## 迁移现有组件

### Before (旧方式)
```tsx
function MyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
      <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">卡片标题</h2>
      </div>
      <div className="text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </div>
  );
}
```

### After (新方式)
```tsx
function MyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-base">
      <div className="card-header">
        <h2 className="text-primary font-semibold">卡片标题</h2>
      </div>
      <div className="card-body text-primary">
        {children}
      </div>
    </div>
  );
}
```

## 优势对比

| 特性 | 旧方式 | 新方式 |
|------|--------|--------|
| **CSS 行数** | 1133行单文件 | 模块化多文件 |
| **主题切换** | JS代码修改 | JSON配置文件 |
| **样式冲突** | 大量!important | 优雅的选择器 |
| **导入导出** | 不支持 | 完整支持 |
| **可维护性** | 困难 | 简单 |
| **开发体验** | 复杂的类名组合 | 语义化工具类 |

## 总结

新的主题系统提供了更好的：
- 🎨 **主题包管理** - 完整的导入导出功能
- 🛠️ **开发体验** - 语义化的工具类
- 📦 **模块化** - 清晰的代码组织
- 🔧 **可维护性** - 标准化的配置格式
- ⚡ **性能** - 按需加载的CSS模块