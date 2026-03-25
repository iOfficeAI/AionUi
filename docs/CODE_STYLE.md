# 代码风格指南

本项目使用 [Oxlint](https://oxc.rs/docs/guide/usage/linter) 和 [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) 来确保代码质量和一致性。两者都是 [oxc-project](https://github.com/oxc-project/oxc) 生态的高性能工具，基于 Rust 构建。

## 工具配置

### Oxlint（代码检查）

- 配置文件：`.oxlintrc.json`
- NPM 包：`oxlint`
- 主要规则：
  - TypeScript 支持（含类型感知 linting）
  - 导入规则检查
  - 未使用变量检查（`_` 前缀豁免）
  - 一致的 type imports
  - no-floating-promises / no-await-thenable
- 性能：比 ESLint 快 50–100 倍

### Oxfmt（代码格式化）

- 配置文件：`.oxfmtrc.json`
- NPM 包：`oxfmt`
- 格式化规则（Prettier 兼容）：
  - 单引号
  - 分号
  - 2 空格缩进
  - 行宽限制（120 字符）
  - 尾逗号 `es5`
- 性能：比 Prettier 快 30 倍
- 内置功能：import 排序、Tailwind CSS 类名排序、package.json 字段排序

## 可用的脚本命令

### 代码检查

```bash
# 运行 Oxlint 检查
bun run lint

# 运行 Oxlint 检查并自动修复
bun run lint:fix

# 检查代码格式
bun run format:check

# 自动格式化代码
bun run format
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
   - 运行 `bun run lint` 检查代码质量
   - 运行 `bun run format` 格式化代码

2. **提交前**：
   - Git hooks 会自动运行 lint-staged
   - 自动修复可修复的问题
   - 检查提交信息格式

3. **持续集成**：
   - 可以运行 `bun run lint` 和 `bun run format:check` 来验证代码质量

## 常见问题

### 忽略特定文件的检查

在 `.oxlintrc.json` 的 `ignorePatterns` 中添加文件路径。

### 禁用特定行的检查

Oxlint 支持与 ESLint 相同的行内注释：

```typescript
// eslint-disable-next-line no-explicit-any
const data: any = getData();
```

### 自定义规则

在 `.oxlintrc.json` 中修改 `rules` 配置。

## IDE 集成

### VS Code / Cursor

推荐安装以下扩展：

- [oxc](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode) — Oxlint + Oxfmt 集成扩展

配置 `settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": true
  }
}
```

### 其他编辑器

请参考 [oxc 官方文档](https://oxc.rs) 获取其他编辑器的插件配置。
