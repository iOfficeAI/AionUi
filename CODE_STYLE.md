# 代码风格指南

本项目使用 ESLint 和 Prettier 来确保代码质量和一致性。

## 工具配置

### ESLint

- 配置文件：`.eslintrc.json`
- 忽略文件：`.eslintignore`
- 主要规则：
  - TypeScript 支持
  - 导入规则检查
  - 代码长度限制（120字符）
  - 未使用变量检查
  - 类型安全检查

### Prettier

- 配置文件：`.prettierrc.json`
- 忽略文件：`.prettierignore`
- 格式化规则：
  - 单引号
  - 分号
  - 2空格缩进
  - 行长度限制（700字符）

## 可用的脚本命令

### 代码检查

```bash
# 运行 ESLint 检查
npm run lint

# 运行 ESLint 检查并自动修复
npm run lint:fix

# 检查代码格式
npm run format:check

# 自动格式化代码
npm run format
```

### Git Hooks

项目配置了 Git hooks 来确保代码质量：

1. **pre-commit**: 在提交前自动运行 lint-staged
2. **commit-msg**: 检查提交信息格式

### 提交信息格式

提交信息必须遵循以下格式：

```
type(scope): description
```

类型（type）：

- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建过程或辅助工具变动

示例：

```
feat: 添加用户登录功能
fix(login): 修复登录验证问题
docs: 更新API文档
```

## 工作流程

1. **开发时**：
   - 编写代码
   - 运行 `npm run lint` 检查代码质量
   - 运行 `npm run format` 格式化代码

2. **提交前**：
   - Git hooks 会自动运行 lint-staged
   - 自动修复可修复的问题
   - 检查提交信息格式

3. **持续集成**：
   - 可以运行 `npm run lint` 和 `npm run format:check` 来验证代码质量

## 常见问题

### 忽略特定文件的检查

在 `.eslintignore` 或 `.prettierignore` 中添加文件路径。

### 禁用特定行的检查

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = getData();
```

### 自定义规则

在 `.eslintrc.json` 中修改规则配置。

## IDE 集成

### VS Code

推荐安装以下扩展：

- ESLint
- Prettier - Code formatter

配置 `settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### 其他编辑器

请参考相应编辑器的 ESLint 和 Prettier 插件配置。
