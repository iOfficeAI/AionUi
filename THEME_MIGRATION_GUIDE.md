# 主题系统迁移指南

## 🎯 迁移完成状态

✅ **已完成的工作**

- 删除旧主题文件 (`light.ts`, `dark.ts`, `darkGreen.ts`, `external.ts`)
- 重构 `ThemeProvider` 使用新的主题包格式
- 创建 `ThemePackageManager` 管理主题包
- 创建 `ThemeSelector` 现代化主题选择界面
- 创建 `ThemeTest` 测试页面
- 创建 `themeAdapter` 统一主题访问接口
- 更新所有 hooks 使用新格式

## 🚀 新主题系统特性

### **主题包格式**

```typescript
interface ThemePackageFile {
  manifest: {
    name: string;
    id: string;
    version: string;
    mode: 'light' | 'dark';
    variables: Record<string, string>;
    // ...其他配置
  };
  styles: {
    variables?: string;
    components?: Record<string, string>;
    layouts?: Record<string, string>;
    overrides?: string;
  };
}
```

### **使用方式**

#### 1. 在组件中使用主题

```typescript
import { useTheme } from '@/themes/ThemeProvider';

const MyComponent = () => {
  const { currentTheme, setTheme, availableThemes } = useTheme();

  // 切换主题
  const handleThemeChange = (themeId: string) => {
    setTheme(themeId);
  };

  return (
    <div>
      <h1>{currentTheme?.manifest.name}</h1>
      {availableThemes.map(theme => (
        <button
          key={theme.manifest.id}
          onClick={() => handleThemeChange(theme.manifest.id)}
        >
          {theme.manifest.name}
        </button>
      ))}
    </div>
  );
};
```

#### 2. 使用主题颜色

```typescript
import { useThemeColors } from '@/themes/hooks';

const MyComponent = () => {
  const themeColors = useThemeColors();

  return (
    <div style={{
      backgroundColor: themeColors.background,
      color: themeColors.textPrimary
    }}>
      主题内容
    </div>
  );
};
```

#### 3. 主题选择器

```typescript
import { ThemeSelector } from '@/components/ThemeSelector';

const SettingsPage = () => {
  const [themeSelectorVisible, setThemeSelectorVisible] = useState(false);

  return (
    <div>
      <button onClick={() => setThemeSelectorVisible(true)}>
        打开主题选择器
      </button>

      <ThemeSelector
        visible={themeSelectorVisible}
        onClose={() => setThemeSelectorVisible(false)}
      />
    </div>
  );
};
```

#### 4. 安装自定义主题包

```typescript
import { useTheme } from '@/themes/ThemeProvider';

const MyComponent = () => {
  const { installThemePackage } = useTheme();

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      const themePackage = JSON.parse(text);
      installThemePackage(themePackage);
    } catch (error) {
      console.error('安装失败:', error);
    }
  };

  // ...
};
```

## 📋 内置主题

系统内置了两个经典主题：

1. **Default Light** (`default-light-modernized`)
   - 清新简洁的浅色主题
   - 适合日间使用

2. **IDEA Dark** (`idea-dark-modernized`)
   - IDEA风格的暗色主题
   - 适合开发者和夜间使用

## 🎨 创建自定义主题包

1. **基于现有主题导出**

   ```typescript
   const { exportTheme } = useTheme();
   exportTheme('default-light-modernized'); // 导出为JSON文件
   ```

2. **手动创建主题包**
   ```json
   {
     "manifest": {
       "name": "我的自定义主题",
       "id": "my-custom-theme",
       "version": "1.0.0",
       "author": "Your Name",
       "description": "我的个性化主题",
       "mode": "light",
       "variables": {
         "primary": "#ff6b35",
         "background": "#ffffff"
         // ...更多颜色变量
       },
       "modules": {
         "components": ["button", "form", "modal"],
         "layouts": ["sidebar", "main"],
         "overrides": true
       }
     },
     "styles": {
       "variables": "/* CSS变量定义 */",
       "components": {
         "button": "/* 按钮样式 */"
       },
       "layouts": {
         "sidebar": "/* 侧边栏样式 */"
       },
       "overrides": "/* 第三方组件覆盖样式 */"
     }
   }
   ```

## 🔧 开发模式

开发时可以使用测试页面来验证主题效果：

```typescript
import { ThemeTest } from '@/pages/ThemeTest';

// 在路由中添加测试页面
<Route path="/theme-test" component={ThemeTest} />
```

## 🎯 主要优势

- **模块化**：CSS样式按组件模块化管理
- **可扩展**：支持动态安装卸载主题包
- **类型安全**：完整的TypeScript支持
- **向后兼容**：保持现有配置格式
- **易用性**：简洁的API和可视化管理界面

## ⚡ 性能优化

- 主题包按需加载和应用
- CSS变量实时更新，无需页面刷新
- LocalStorage缓存已安装的主题包
- 内置主题直接嵌入，无网络请求

## 🐛 故障排除

### 1. 主题切换不生效

- 检查主题包格式是否正确
- 确认CSS变量是否正确应用
- 查看浏览器控制台错误信息

### 2. 自定义主题包安装失败

- 验证JSON格式是否正确
- 确认必需字段是否完整
- 检查主题ID是否唯一

### 3. 样式覆盖问题

- 确认CSS选择器优先级
- 检查主题包的overrides配置
- 验证data-theme-id属性设置

---

**新主题系统提供了更强大、更灵活的主题管理能力，让用户可以轻松创建和分享个性化主题！** 🎨✨
