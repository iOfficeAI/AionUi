# 主题系统迁移指南

## 概述

本指南说明如何从当前的主题系统迁移到新的模块化、标准化主题包系统。新系统提供了更好的可维护性、更灵活的主题包管理和更强的UnoCSS集成。

## 主要改进

### 1. 模块化CSS架构
```
src/renderer/styles/
├── base/
│   ├── variables.css     # 主题变量定义
│   └── reset.css        # 基础重置样式
├── components/
│   ├── button.css       # 按钮组件样式
│   ├── form.css         # 表单组件样式
│   ├── dropdown.css     # 下拉组件样式
│   └── modal.css        # 模态框组件样式
├── index.css            # 样式入口文件
└── unocss-integration.ts # UnoCSS集成
```

### 2. 标准化主题包格式
- JSON格式的主题包定义
- 支持导入/导出功能
- 包含元信息、变量、组件样式等完整信息

### 3. 增强的UnoCSS集成
- 主题感知的工具类
- 自动生成的CSS变量规则
- 主题模式变体支持

## 迁移步骤

### Step 1: 更新项目结构

1. **创建新的样式目录结构**：
```bash
mkdir -p src/renderer/styles/{base,components}
```

2. **移动现有的CSS文件内容**到对应的模块文件中

3. **更新主入口文件**：
```typescript
// src/renderer/index.tsx
import './styles/index.css'; // 替代原有的 index.css
```

### Step 2: 更新主题提供者

1. **集成主题包管理器**：
```typescript
import { ThemePackageManager } from './themes/themePackage';

// 在ThemeProvider中集成
const themeManager = ThemePackageManager.getInstance();
```

2. **添加主题包管理UI组件**：
```typescript
import { ThemePackageManagerComponent } from './components/ThemePackageManager';
```

### Step 3: 更新UnoCSS配置

替换 `uno.config.ts` 文件，使其支持主题感知的工具类。

### Step 4: 迁移现有组件

#### 旧方式：
```tsx
<div className="bg-white dark:bg-gray-800 border border-gray-200">
  <button className="bg-blue-500 text-white px-4 py-2 rounded">
    Click me
  </button>
</div>
```

#### 新方式：
```tsx
<div className="card-base">
  <button className="btn-primary">
    Click me
  </button>
</div>
```

### Step 5: 主题包创建和使用

#### 创建主题包：
```typescript
const themeManager = ThemePackageManager.getInstance();
const packageData = await themeManager.exportThemePackage('current-theme', 'My Custom Theme');
```

#### 导入主题包：
```typescript
await themeManager.importThemePackage(packageData);
```

## 新功能使用指南

### 1. 主题包管理

```typescript
// 获取已安装的主题包
const packages = await themeManager.getInstalledThemePackages();

// 应用主题包
await themeManager.importThemePackage(packageData);

// 删除主题包
await themeManager.removeThemePackage(themeId);
```

### 2. UnoCSS主题工具类

```html
<!-- 按钮样式 -->
<button class="btn-primary">主要按钮</button>
<button class="btn-secondary">次要按钮</button>
<button class="btn-danger">危险按钮</button>

<!-- 输入框样式 -->
<input class="input-base" placeholder="输入内容" />
<textarea class="textarea-base"></textarea>

<!-- 卡片样式 -->
<div class="card-base">
  <div class="card-header">
    <h3>卡片标题</h3>
  </div>
  <div class="card-body">
    <p class="text-primary">卡片内容</p>
  </div>
</div>

<!-- 模态框样式 -->
<div class="modal-overlay">
  <div class="modal-base">
    <div class="card-header">
      <h2>模态框标题</h2>
    </div>
    <div class="card-body">
      <p>模态框内容</p>
    </div>
  </div>
</div>
```

### 3. 主题模式变体

```html
<!-- 主题模式特定的样式 -->
<div class="theme-light:bg-white theme-dark:bg-gray-900">
  内容区域
</div>
```

### 4. CSS变量直接使用

```css
.custom-component {
  background-color: var(--theme-surface);
  border: 1px solid var(--theme-border);
  color: var(--theme-text-primary);
  border-radius: var(--theme-input-radius);
  padding: var(--theme-spacing-md);
}
```

## 兼容性考虑

### 1. 渐进式迁移
- 新旧系统可以并存
- 逐步迁移组件到新的工具类
- 保持现有功能的稳定性

### 2. 性能优化
- CSS文件按需加载
- 模块化减少样式冲突
- UnoCSS按需生成减少包体积

### 3. 开发体验
- 更好的类型提示
- 标准化的命名规范
- 更容易的主题定制

## 最佳实践

### 1. 主题包开发
- 使用语义化的变量名
- 提供完整的组件样式覆盖
- 包含详细的主题包信息

### 2. 样式组织
- 按功能模块组织CSS
- 使用统一的变量命名规范
- 避免深层嵌套选择器

### 3. UnoCSS使用
- 优先使用主题工具类
- 自定义样式使用CSS变量
- 合理利用变体功能

## 故障排除

### 常见问题

1. **样式不生效**：
   - 检查CSS文件导入顺序
   - 确认主题变量已正确定义
   - 验证UnoCSS配置

2. **主题包导入失败**：
   - 检查JSON格式是否正确
   - 确认必要字段是否完整
   - 查看浏览器控制台错误信息

3. **UnoCSS工具类无效**：
   - 检查safelist配置
   - 确认规则定义正确
   - 重新构建项目

### 调试技巧

1. 使用浏览器开发者工具检查CSS变量值
2. 查看生成的UnoCSS样式
3. 检查主题数据属性设置

## 总结

新的主题系统提供了：
- ✅ 更好的可维护性
- ✅ 标准化的主题包格式
- ✅ 强大的导入导出功能
- ✅ 与UnoCSS的深度集成
- ✅ 模块化的CSS架构
- ✅ 更灵活的主题定制能力

通过渐进式迁移，您可以逐步享受新系统带来的优势，同时保持现有功能的稳定性。