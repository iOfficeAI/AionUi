# SkillsHub E2E 测试策略

**文档版本**: v1.0  
**作者**: skills-engineer-2  
**日期**: 2026-04-21  
**状态**: Gate 2 - 测试策略

---

## 1. 概述

本文档定义 SkillsHubSettings 模块的 E2E 测试实施策略,包括环境配置、数据构造、Bridge 断言模式、data-testid 补充清单、不可测项替代方案等实施细节。

**与需求文档的关系**:

- `requirements.zh.md` — 描述功能、数据模型、边界约束(门 1,已完成)
- `test-strategy.zh.md` — 描述如何测试这些功能(门 2,本文档)
- `test-cases.zh.md` — 具体测试用例设计(门 2,由 Designer 主导)

---

## 2. E2E 测试环境配置

### 2.1 基础配置

**已由 E2E 框架自动配置**(`tests/e2e/fixtures.ts`):

- ✅ Electron app 单实例启动(`workers: 1`)
- ✅ 用户数据目录隔离(`userData: tmpDir`)
- ✅ SQLite 数据库独立(`aionui.db`)
- ✅ 扩展路径指向示例目录(`AIONUI_EXTENSIONS_PATH=examples/`)

### 2.2 Skills 模块特定配置

**需要的路径**:

```typescript
const skillPaths = await invokeBridge(page, 'fs.getSkillPaths');
// Returns:
// {
//   userSkillsDir: '~/.aionui/skills/',     // My Skills 存储目录
//   builtinSkillsDir: 'resources/_builtin/' // Builtin Skills 目录
// }
```

**预定义外部源路径**(由 `fsBridge.ts` 硬编码):

- `~/.claude/skills` — Claude Code CLI
- `~/.gemini/skills` — Gemini CLI
- `~/.copilot/skills` — Copilot CLI
- `/usr/local/share/aion-skills` — 系统级共享路径
- **自定义路径**: 通过 `fs.addCustomExternalPath` 动态添加

---

## 3. 测试数据构造策略

### 3.1 数据隔离原则

**命名规范**:

- 所有测试 skill 名称前缀: `E2E-Test-`
- 示例: `E2E-Test-Import-Basic`, `E2E-Test-Special:Char`

**清理策略**:

```typescript
// 测试后批量清理
const skills = await invokeBridge(page, 'fs.listAvailableSkills');
for (const skill of skills) {
  if (skill.name.startsWith('E2E-Test-')) {
    await invokeBridge(page, 'fs.deleteSkill', { skillName: skill.name });
  }
}
```

### 3.2 外部 Skill 源构造

**方案 A: 动态创建临时目录**(推荐)

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

// 创建临时外部源
const tempExternal = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-external-'));

// 创建测试 skill(直接 skill)
fs.mkdirSync(path.join(tempExternal, 'E2E-Test-External-1'));
fs.writeFileSync(
  path.join(tempExternal, 'E2E-Test-External-1/SKILL.md'),
  `---
name: E2E-Test-External-1
description: "Test external skill for E2E"
---
# Test Skill
This is a test skill.
`
);

// 创建测试 skill pack(嵌套 skills/)
fs.mkdirSync(path.join(tempExternal, 'test-pack/skills'), { recursive: true });
fs.mkdirSync(path.join(tempExternal, 'test-pack/skills/E2E-Test-Pack-Skill-1'));
fs.writeFileSync(
  path.join(tempExternal, 'test-pack/skills/E2E-Test-Pack-Skill-1/SKILL.md'),
  `---
name: E2E-Test-Pack-Skill-1
description: "Test skill from pack"
---
# Pack Skill
`
);

// 添加到自定义外部路径
await invokeBridge(page, 'fs.addCustomExternalPath', {
  name: 'E2E Test Source',
  path: tempExternal,
});

// 验证外部源出现
const sources = await invokeBridge(page, 'fs.detectAndCountExternalSkills');
expect(sources.data.some((s) => s.name === 'E2E Test Source')).toBe(true);

// 清理(测试后)
await invokeBridge(page, 'fs.removeCustomExternalPath', { path: tempExternal });
fs.rmSync(tempExternal, { recursive: true, force: true });
```

**方案 B: 预置固定测试目录**(CI 环境)

如果 CI 环境可以预置目录,在 `~/.claude/skills` 放置测试 skill:

```bash
mkdir -p ~/.claude/skills/E2E-Test-Preset
echo "---\nname: E2E-Test-Preset\n---\n# Test" > ~/.claude/skills/E2E-Test-Preset/SKILL.md
```

**选择建议**:

- 本地开发: 方案 A(临时目录,自动清理)
- CI 环境: 方案 B(预置目录,减少 I/O)

### 3.3 My Skills 数据预置

**导入测试 skill**:

```typescript
// 使用 3.2 创建的临时 skill 路径
await invokeBridge(page, 'fs.importSkillWithSymlink', {
  skillPath: path.join(tempExternal, 'E2E-Test-External-1'),
});

// 验证导入成功
const mySkills = await invokeBridge(page, 'fs.listAvailableSkills');
expect(mySkills.some((s) => s.name === 'E2E-Test-External-1')).toBe(true);
```

**预置多个 skill**:

```typescript
const testSkills = ['E2E-Test-Skill-1', 'E2E-Test-Skill-2', 'E2E-Test-Special:Char'];
for (const skillName of testSkills) {
  // 创建 skill 目录和 SKILL.md
  const skillPath = path.join(tempExternal, skillName);
  fs.mkdirSync(skillPath);
  fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `---\nname: ${skillName}\ndescription: "Test skill"\n---\n# Test`);

  // 导入
  await invokeBridge(page, 'fs.importSkillWithSymlink', { skillPath });
}
```

### 3.4 Extension Skills 数据来源

**依赖配置**:

- E2E 框架已设置 `AIONUI_EXTENSIONS_PATH=examples/`(`fixtures.ts:112`)

**验证 examples/ 中是否有扩展贡献 skill**:

```bash
# 需在项目根目录执行
find examples/ -name "skills" -type d
# 如果输出为空,则 Extension Skills 板块在 E2E 中不可见
```

**处理策略**:

- **如果 examples/ 有扩展 skill**: 正常测试 Extension Skills 板块
- **如果 examples/ 无扩展 skill**: E2E 测试跳过 Extension Skills 板块,标注为"依赖外部扩展"

**创建测试扩展(可选)**:
如果需要 E2E 覆盖 Extension Skills,可在 `examples/test-extension/` 添加测试扩展:

```typescript
// examples/test-extension/manifest.json
{
  "id": "e2e-test-extension",
  "name": "E2E Test Extension",
  "version": "1.0.0",
  "skills": ["skills/e2e-test-skill"]
}

// examples/test-extension/skills/e2e-test-skill/SKILL.md
---
name: E2E-Extension-Skill
description: "Test skill from extension"
---
# Extension Skill
```

### 3.5 测试数据清理

**清理时机**:

- 每个测试用例的 `afterEach` hook
- 或测试套件的 `afterAll` hook(如果测试间数据可共享)

**完整清理脚本**:

```typescript
async function cleanupTestSkills(page: Page) {
  // 1. 清理 My Skills
  const mySkills = await invokeBridge(page, 'fs.listAvailableSkills');
  for (const skill of mySkills) {
    if (skill.name.startsWith('E2E-Test-')) {
      await invokeBridge(page, 'fs.deleteSkill', { skillName: skill.name });
    }
  }

  // 2. 清理自定义外部路径
  const sources = await invokeBridge(page, 'fs.detectAndCountExternalSkills');
  for (const source of sources.data) {
    if (source.name.startsWith('E2E Test')) {
      await invokeBridge(page, 'fs.removeCustomExternalPath', {
        path: source.source,
      });
    }
  }

  // 3. 清理临时文件系统目录(在 Node.js 测试代码中)
  // fs.rmSync(tempExternal, { recursive: true, force: true });
}
```

---

## 4. Bridge 断言策略

### 4.1 Setup / Assert / Cleanup 原则

**来自 `tests/e2e/README.md`**:

- ✅ **Setup**: 测试前通过 bridge 构造前置数据
- ✅ **Assert**: 操作后通过 bridge 验证后端状态
- ✅ **Cleanup**: 测试后通过 bridge 清理测试数据
- ❌ **Trigger**: 操作必须通过 UI 交互触发,不能直接调 bridge 替代点击

### 4.2 使用的 Bridge Keys

| Bridge Key                        | 用途                    | 使用场景                                                   |
| --------------------------------- | ----------------------- | ---------------------------------------------------------- |
| `fs.listAvailableSkills`          | 获取 My Skills 列表     | Setup: 验证初始状态<br>Assert: 导入/删除后验证列表变化     |
| `fs.listBuiltinAutoSkills`        | 获取自动注入 skill 列表 | Assert: 验证 Auto Skills 板块内容                          |
| `fs.detectAndCountExternalSkills` | 获取外部源列表          | Setup: 验证外部源存在<br>Assert: 添加自定义路径后验证      |
| `fs.getSkillPaths`                | 获取 skill 目录路径     | Setup: 确认目录存在                                        |
| `fs.importSkillWithSymlink`       | 导入 skill              | Setup: 预置 My Skills 数据<br>❌ 不用于替代 UI 导入操作    |
| `fs.deleteSkill`                  | 删除 skill              | Cleanup: 清理测试数据<br>❌ 不用于替代 UI 删除操作         |
| `fs.exportSkillWithSymlink`       | 导出 skill              | ❌ 不用于 E2E(UI 触发,不验证文件)                          |
| `fs.addCustomExternalPath`        | 添加自定义外部路径      | Setup: 动态创建测试外部源<br>❌ 不用于替代 UI 添加路径操作 |
| `fs.removeCustomExternalPath`     | 删除自定义外部路径      | Cleanup: 清理测试外部源                                    |
| `fs.getCustomExternalPaths`       | 获取自定义外部路径列表  | Assert: 验证添加自定义路径后列表包含新路径                 |

### 4.3 典型场景的断言模式

#### 场景 1: 导入外部 skill

```typescript
// Setup: 创建外部源(见 3.2)
const tempExternal = createTempExternalSource();
await invokeBridge(page, 'fs.addCustomExternalPath', {
  name: 'E2E Test Source',
  path: tempExternal,
});

// Trigger: UI 点击导入按钮
await page.locator('[data-testid="btn-import-E2E-Test-External-1"]').click();

// Assert UI: 验证成功 Message
await expect(page.locator('.arco-message-success')).toContainText('Import successful');

// Assert Bridge: 验证后端状态
const mySkills = await invokeBridge(page, 'fs.listAvailableSkills');
expect(mySkills.some((s) => s.name === 'E2E-Test-External-1')).toBe(true);

// Cleanup
await invokeBridge(page, 'fs.deleteSkill', { skillName: 'E2E-Test-External-1' });
await invokeBridge(page, 'fs.removeCustomExternalPath', { path: tempExternal });
```

#### 场景 2: 删除 custom skill

```typescript
// Setup: 预置一个 custom skill
await invokeBridge(page, 'fs.importSkillWithSymlink', {
  skillPath: testSkillPath,
});

// Trigger: UI 点击删除按钮 + 确认 Modal
await page.locator('[data-testid="btn-delete-E2E-Test-Skill-1"]').click();
await page.locator('[data-testid="btn-confirm-delete"]').click();

// Assert UI: 卡片消失
await expect(page.locator('[data-testid="my-skill-card-E2E-Test-Skill-1"]')).not.toBeVisible();

// Assert Bridge: 列表不包含该 skill
const mySkills = await invokeBridge(page, 'fs.listAvailableSkills');
expect(mySkills.every((s) => s.name !== 'E2E-Test-Skill-1')).toBe(true);
```

#### 场景 3: 搜索 skill

```typescript
// Setup: 预置多个 skill
await setupMultipleSkills(['E2E-Test-Alpha', 'E2E-Test-Beta', 'E2E-Test-Gamma']);

// Trigger: UI 输入搜索关键词
await page.locator('[data-testid="input-search-my-skills"]').fill('Beta');

// Assert UI: 仅匹配卡片可见
await expect(page.locator('[data-testid="my-skill-card-E2E-Test-Beta"]')).toBeVisible();
await expect(page.locator('[data-testid="my-skill-card-E2E-Test-Alpha"]')).not.toBeVisible();
await expect(page.locator('[data-testid="my-skill-card-E2E-Test-Gamma"]')).not.toBeVisible();

// ❌ 不需要 Bridge 断言(搜索仅影响前端显示)
```

#### 场景 4: 添加自定义外部路径

```typescript
// Setup: 创建临时目录
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-custom-'));

// Trigger: UI 填写 Modal + 确认
await page.locator('[data-testid="btn-add-custom-source"]').click();
await page.locator('[data-testid="input-custom-path-name"]').fill('My Custom Source');
await page.locator('[data-testid="input-custom-path-value"]').fill(tempDir);
await page.locator('[data-testid="btn-confirm-add-path"]').click();

// Assert UI: 新 Tab 出现
await expect(page.locator('[data-testid="external-source-tab-My-Custom-Source"]')).toBeVisible();

// Assert Bridge: 外部源列表包含新路径
const sources = await invokeBridge(page, 'fs.detectAndCountExternalSkills');
expect(sources.data.some((s) => s.name === 'My Custom Source')).toBe(true);

// Cleanup
await invokeBridge(page, 'fs.removeCustomExternalPath', { path: tempDir });
fs.rmSync(tempDir, { recursive: true, force: true });
```

#### 场景 5: 导出 skill

```typescript
// Setup: 预置 skill + 外部源
await invokeBridge(page, 'fs.importSkillWithSymlink', { skillPath: testSkillPath });
await invokeBridge(page, 'fs.addCustomExternalPath', {
  name: 'Export Target',
  path: tempExportDir,
});

// Trigger: UI 点击导出 Dropdown + 选择目标源
await page.locator('[data-testid="btn-export-E2E-Test-Skill-1"]').click();
await page.locator('.arco-dropdown-option').filter({ hasText: 'Export Target' }).click();

// Assert UI: 成功 Message
await expect(page.locator('.arco-message-success')).toContainText('Export successful');

// Assert UI: My Skills 列表仍包含该 skill(导出不删除源)
await expect(page.locator('[data-testid="my-skill-card-E2E-Test-Skill-1"]')).toBeVisible();

// ❌ 不验证目标目录的 symlink(E2E 职责外,单测覆盖)
```

---

## 5. data-testid 补充清单

### 5.1 补充原则

**规则**(来自 `requirements.zh.md` 第 7.3 节):

- 技能名称中的特殊字符需转义: `normalizeTestId(name) => name.replace(/[:\/\s<>"'|?*]/g, '-')`
- 示例: `my:skill/test` → `my-skill-card-my-skill-test`

**实现位置**:

- 在 `SkillsHubSettings.tsx` 中添加工具函数:
  ```typescript
  const normalizeTestId = (name: string) => name.replace(/[:\/\s<>"'|?*]/g, '-');
  ```
- 所有动态 testid 使用 `${normalizeTestId(skill.name)}`

### 5.2 需补充的 testid(按优先级)

#### P0 - 阻塞级(必须补充,否则无法定位核心元素)

**文件**: `src/renderer/pages/settings/SkillsHubSettings.tsx`

| testid                                               | 元素描述               | 源码位置(估算)                                  | 示例值                              |
| ---------------------------------------------------- | ---------------------- | ----------------------------------------------- | ----------------------------------- |
| `my-skills-section`                                  | 我的技能板块容器       | line ~580 `<div className="my-skills">`         | -                                   |
| `external-skills-section`                            | 发现外部技能板块容器   | line ~240 `<div className="external-skills">`   | -                                   |
| `my-skill-card-${normalizeTestId(skill.name)}`       | 我的技能卡片           | line ~620 `<div className="skill-card">`        | `my-skill-card-test-skill`          |
| `external-skill-card-${normalizeTestId(skill.name)}` | 外部技能卡片           | line ~340 `<div className="skill-card">`        | `external-skill-card-test-external` |
| `btn-import-${normalizeTestId(skill.name)}`          | 导入按钮(外部技能卡片) | line ~350 `<Button>Import</Button>`             | `btn-import-test-external`          |
| `btn-delete-${normalizeTestId(skill.name)}`          | 删除按钮(我的技能卡片) | line ~650 `<Button icon={<Delete />}>`          | `btn-delete-test-skill`             |
| `btn-export-${normalizeTestId(skill.name)}`          | 导出 Dropdown trigger  | line ~640 `<Dropdown>`                          | `btn-export-test-skill`             |
| `btn-import-all`                                     | 导入全部按钮           | line ~280 `<Button>Import All</Button>`         | -                                   |
| `btn-manual-import`                                  | 从文件夹导入按钮       | line ~590 `<Button>Import from Folder</Button>` | -                                   |

#### P1 - 高优先级(影响测试稳定性)

| testid                    | 元素描述             | 源码位置(估算)                          | 示例值 |
| ------------------------- | -------------------- | --------------------------------------- | ------ |
| `input-search-my-skills`  | 我的技能搜索框       | line ~595 `<Input.Search>`              | -      |
| `input-search-external`   | 外部技能搜索框       | line ~250 `<Input.Search>`              | -      |
| `btn-refresh-my-skills`   | 我的技能刷新按钮     | line ~585 `<Button icon={<Refresh />}>` | -      |
| `btn-refresh-external`    | 外部技能刷新按钮     | line ~245 `<Button icon={<Refresh />}>` | -      |
| `modal-add-custom-path`   | 添加自定义路径 Modal | line ~720 `<Modal wrapClassName={...}>` | -      |
| `input-custom-path-name`  | 自定义路径名称输入框 | line ~730 `<Input placeholder="Name">`  | -      |
| `input-custom-path-value` | 自定义路径值输入框   | line ~740 `<Input placeholder="Path">`  | -      |
| `btn-browse-custom-path`  | 浏览按钮(路径选择)   | line ~745 `<Button>Browse</Button>`     | -      |
| `modal-delete-skill`      | 删除确认 Modal       | line ~680 `<Modal wrapClassName={...}>` | -      |
| `btn-confirm-delete`      | 删除确认按钮         | line ~690 `<Button status="danger">`    | -      |

#### P2 - 中优先级(提升测试可读性)

| testid                                                | 元素描述                    | 源码位置(估算)                                  | 示例值                                |
| ----------------------------------------------------- | --------------------------- | ----------------------------------------------- | ------------------------------------- |
| `external-source-tab-${normalizeTestId(source.name)}` | 外部源 Tab 按钮             | line ~290 `<Button key={source.source}>`        | `external-source-tab-Claude-Code`     |
| `btn-add-custom-source`                               | 添加自定义源按钮(Plus icon) | line ~310 `<Button icon={<Plus />}>`            | -                                     |
| `extension-skills-section`                            | 扩展技能板块容器            | line ~440 `<div className="extension-skills">`  | -                                     |
| `extension-skill-card-${normalizeTestId(skill.name)}` | 扩展技能卡片                | line ~460 `<div className="skill-card">`        | `extension-skill-card-test-extension` |
| `auto-skills-section`                                 | 自动注入技能板块容器        | line ~500 `<div className="auto-skills">`       | -                                     |
| `auto-skill-card-${normalizeTestId(skill.name)}`      | 自动注入技能卡片            | line ~520 `<div className="skill-card">`        | `auto-skill-card-aionui-skills`       |
| `my-skills-empty-state`                               | 我的技能空状态容器          | line ~585 `<div>No skills found</div>`          | -                                     |
| `external-skills-no-results`                          | 外部技能搜索无结果提示      | line ~380 `<div>No matching skills found</div>` | -                                     |

### 5.3 实施建议

**步骤 1: 添加工具函数**(文件顶部)

```typescript
// src/renderer/pages/settings/SkillsHubSettings.tsx
const normalizeTestId = (name: string): string => {
  return name.replace(/[:\/\s<>"'|?*]/g, '-');
};
```

**步骤 2: 补充 P0 testid**(约 10 处,核心交互元素)

- 优先补充板块容器、卡片、操作按钮
- 预计修改行数: ~20 行(每个 testid 1-2 行)

**步骤 3: 补充 P1 testid**(约 10 处,搜索/刷新/Modal)

- 完成后可覆盖 90% 测试场景

**步骤 4: 补充 P2 testid**(可选,约 8 处)

- 提升测试可读性,非阻塞

---

## 6. 不可测项与替代方案

### 6.1 文件系统相关

| 需求                           | 原因               | E2E 替代方案                                                                   | 单测覆盖              |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------ | --------------------- |
| 验证导入后 skill 文件内容正确  | E2E 不读文件系统   | Bridge 断言: `listAvailableSkills` 包含该 skill,验证 `name`/`description` 正确 | ✅ `fsBridge.test.ts` |
| 验证符号链接创建成功           | E2E 不验证 symlink | Bridge 断言: `listAvailableSkills` 返回 skill,`location` 路径包含源路径关键字  | ✅ `fsBridge.test.ts` |
| 验证删除操作不影响源文件       | E2E 不访问外部路径 | UI 断言: 卡片消失<br>Bridge 断言: 列表不含该 skill                             | ✅ `fsBridge.test.ts` |
| 验证导出后目标目录创建 symlink | E2E 不读外部路径   | UI 断言: 成功 Message<br>UI 断言: My Skills 列表仍包含该 skill                 | ✅ `fsBridge.test.ts` |

### 6.2 系统原生 Dialog

| 需求                           | 原因                               | E2E 替代方案                                                                                                                    | 单测覆盖              |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 从文件夹导入 skill(文件选择器) | `dialog.showOpenDialog` 无法自动化 | **方案 A**: Mock `dialog.showOpenDialog` 返回预设路径<br>**方案 B**: 跳过 UI 点击,直接 bridge 构造前置数据,仅测试导入后列表验证 | ✅ `fsBridge.test.ts` |
| 添加自定义路径(目录选择器)     | `dialog.showOpenDialog` 无法自动化 | **方案 A**: Mock dialog<br>**方案 B**: 手动输入路径到 Input(如果 UI 支持)                                                       | ✅ `fsBridge.test.ts` |

**Mock Dialog 示例**(方案 A,推荐):

```typescript
// 在测试开始时注入 mock
await electronApp.evaluate(async ({ dialog }, targetPath) => {
  dialog.showOpenDialog = () =>
    Promise.resolve({
      canceled: false,
      filePaths: [targetPath],
    });
}, testSkillPath);

// 然后点击 Import from Folder 按钮
await page.locator('[data-testid="btn-manual-import"]').click();
```

### 6.3 性能与超时

| 需求                        | 原因                  | E2E 替代方案                         | 单测覆盖                                     |
| --------------------------- | --------------------- | ------------------------------------ | -------------------------------------------- |
| 导出超时(8 秒)              | 难以稳定复现          | 跳过 E2E,仅测试正常流程              | ✅ `fsBridge.test.ts` 用 `Promise.race` mock |
| 大规模 skill 列表性能(100+) | E2E 成本高,数据构造慢 | 仅测试 50 skill 场景,100+ 由压测覆盖 | ⚠️ 可选:性能测试套件                         |
| 搜索防抖                    | 当前 UI 未实现防抖    | 标注为已知限制,不测试                | N/A                                          |

### 6.4 安全与边界

| 需求             | 原因                | E2E 替代方案                                   | 单测覆盖              |
| ---------------- | ------------------- | ---------------------------------------------- | --------------------- |
| 路径穿越攻击防护 | 安全测试,非功能测试 | 跳过 E2E                                       | ✅ `fsBridge.test.ts` |
| Symlink 环形引用 | 底层文件系统行为    | 跳过 E2E                                       | ✅ `fsBridge.test.ts` |
| YAML 解析容错    | 边界输入测试        | 可选: E2E 测试无效 SKILL.md 导入(验证错误提示) | ✅ `fsBridge.test.ts` |

### 6.5 已知 UI 限制(来自 requirements.zh.md 第 9 节)

| 功能               | 原因               | E2E 测试范围                       |
| ------------------ | ------------------ | ---------------------------------- |
| Skills Market      | UI 完全未实现      | ❌ 不测试                          |
| 删除自定义外部路径 | UI 未调用 bridge   | ❌ 不测试(仅 bridge 清理时使用)    |
| 批量导入进度反馈   | UI 无 loading 状态 | ✅ 测试批量导入功能,但不验证进度条 |
| Symlink 目标查看   | UI 无展示          | ❌ 不测试                          |

---

## 7. Helper 函数设计

### 7.1 新建文件: `tests/e2e/helpers/skillsHubSettings.ts`

参考 `assistantSettings.ts` 结构:

```typescript
import { Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { navigateTo } from './navigation';

// ============ 导航 ============

export async function goToSkillsHub(page: Page): Promise<void> {
  await navigateTo(page, '#/settings/skills');
  // 等待主容器加载
  await page.waitForSelector('[data-testid="my-skills-section"]', { timeout: 5000 });
}

// ============ Bridge 断言 ============

export async function getMySkills(page: Page): Promise<SkillInfo[]> {
  return invokeBridge(page, 'fs.listAvailableSkills');
}

export async function getExternalSources(page: Page) {
  const result = await invokeBridge(page, 'fs.detectAndCountExternalSkills');
  return result.success ? result.data : [];
}

export async function getAutoSkills(page: Page) {
  return invokeBridge(page, 'fs.listBuiltinAutoSkills');
}

export async function getSkillPaths(page: Page) {
  return invokeBridge(page, 'fs.getSkillPaths');
}

// ============ 数据构造 ============

export async function importSkillViaBridge(page: Page, skillPath: string) {
  return invokeBridge(page, 'fs.importSkillWithSymlink', { skillPath });
}

export async function deleteSkillViaBridge(page: Page, skillName: string) {
  return invokeBridge(page, 'fs.deleteSkill', { skillName });
}

export async function addCustomExternalPath(page: Page, name: string, path: string) {
  return invokeBridge(page, 'fs.addCustomExternalPath', { name, path });
}

export async function removeCustomExternalPath(page: Page, path: string) {
  return invokeBridge(page, 'fs.removeCustomExternalPath', { path });
}

// ============ UI 操作(基于 data-testid) ============

export async function searchMySkills(page: Page, query: string): Promise<void> {
  await page.locator('[data-testid="input-search-my-skills"]').fill(query);
  // 等待搜索结果更新(无防抖,立即生效)
  await page.waitForTimeout(100);
}

export async function searchExternalSkills(page: Page, query: string): Promise<void> {
  await page.locator('[data-testid="input-search-external"]').fill(query);
  await page.waitForTimeout(100);
}

export async function refreshMySkills(page: Page): Promise<void> {
  await page.locator('[data-testid="btn-refresh-my-skills"]').click();
  // 等待 loading 完成(需观察实际 UI 实现)
  await page.waitForTimeout(500);
}

export async function refreshExternalSkills(page: Page): Promise<void> {
  await page.locator('[data-testid="btn-refresh-external"]').click();
  await page.waitForTimeout(500);
}

export async function importSkillViaUI(page: Page, skillName: string): Promise<void> {
  const normalizedName = normalizeTestId(skillName);
  await page.locator(`[data-testid="btn-import-${normalizedName}"]`).click();
  // 等待成功 Message
  await page.waitForSelector('.arco-message-success', { timeout: 3000 });
}

export async function deleteSkillViaUI(page: Page, skillName: string): Promise<void> {
  const normalizedName = normalizeTestId(skillName);
  await page.locator(`[data-testid="btn-delete-${normalizedName}"]`).click();
  // 确认删除 Modal
  await page.locator('[data-testid="btn-confirm-delete"]').click();
  // 等待成功 Message
  await page.waitForSelector('.arco-message-success', { timeout: 3000 });
}

export async function exportSkillViaUI(page: Page, skillName: string, targetSource: string): Promise<void> {
  const normalizedName = normalizeTestId(skillName);
  // 点击导出 Dropdown trigger
  await page.locator(`[data-testid="btn-export-${normalizedName}"]`).click();
  // 选择目标源
  await page.locator('.arco-dropdown-option').filter({ hasText: targetSource }).click();
  // 等待成功 Message
  await page.waitForSelector('.arco-message-success', { timeout: 8000 }); // 超时 8 秒
}

export async function importAllSkills(page: Page): Promise<void> {
  await page.locator('[data-testid="btn-import-all"]').click();
  // 等待批量导入完成(无进度条,需等待 Message)
  await page.waitForSelector('.arco-message-success', { timeout: 10000 });
}

export async function addCustomPathViaUI(page: Page, name: string, path: string): Promise<void> {
  // 点击添加按钮
  await page.locator('[data-testid="btn-add-custom-source"]').click();
  // 填写 Modal
  await page.locator('[data-testid="input-custom-path-name"]').fill(name);
  await page.locator('[data-testid="input-custom-path-value"]').fill(path);
  // 确认
  await page.locator('[data-testid="btn-confirm-add-path"]').click();
  // 等待 Modal 关闭
  await page.waitForSelector('[data-testid="modal-add-custom-path"]', { state: 'hidden' });
}

// ============ 工具函数 ============

function normalizeTestId(name: string): string {
  return name.replace(/[:\/\s<>"'|?*]/g, '-');
}

// ============ 清理函数 ============

export async function cleanupTestSkills(page: Page): Promise<void> {
  // 清理所有 E2E-Test-* 前缀的 skill
  const skills = await getMySkills(page);
  for (const skill of skills) {
    if (skill.name.startsWith('E2E-Test-')) {
      await deleteSkillViaBridge(page, skill.name);
    }
  }

  // 清理自定义外部路径
  const sources = await getExternalSources(page);
  for (const source of sources) {
    if (source.name.startsWith('E2E Test')) {
      await removeCustomExternalPath(page, source.source);
    }
  }
}
```

### 7.2 更新 `tests/e2e/helpers/selectors.ts`

```typescript
// Skills Hub
export const MY_SKILLS_SECTION = '[data-testid="my-skills-section"]';
export const EXTERNAL_SKILLS_SECTION = '[data-testid="external-skills-section"]';
export const EXTENSION_SKILLS_SECTION = '[data-testid="extension-skills-section"]';
export const AUTO_SKILLS_SECTION = '[data-testid="auto-skills-section"]';

export function mySkillCard(skillName: string): string {
  const normalized = skillName.replace(/[:\/\s<>"'|?*]/g, '-');
  return `[data-testid="my-skill-card-${normalized}"]`;
}

export function externalSkillCard(skillName: string): string {
  const normalized = skillName.replace(/[:\/\s<>"'|?*]/g, '-');
  return `[data-testid="external-skill-card-${normalized}"]`;
}

export function importButton(skillName: string): string {
  const normalized = skillName.replace(/[:\/\s<>"'|?*]/g, '-');
  return `[data-testid="btn-import-${normalized}"]`;
}

export function deleteButton(skillName: string): string {
  const normalized = skillName.replace(/[:\/\s<>"'|?*]/g, '-');
  return `[data-testid="btn-delete-${normalized}"]`;
}

export function exportButton(skillName: string): string {
  const normalized = skillName.replace(/[:\/\s<>"'|?*]/g, '-');
  return `[data-testid="btn-export-${normalized}"]`;
}
```

### 7.3 更新 `tests/e2e/helpers/navigation.ts`

```typescript
// 在 ROUTES 对象中添加
export const ROUTES = {
  // ... 现有路由
  settings: {
    // ... 现有设置页面
    skills: '#/settings/skills',
  },
};
```

---

## 8. E2E 并行执行约束

### 8.1 结论(来自 assistant-engineer-2 调研)

❌ **Assistant E2E 和 Skills E2E 必须顺序执行**

**原因**:

- 所有测试共享单个 Electron app 实例(`workers: 1` 强制)
- 共享同一个 SQLite 数据库(`aionui.db`)
- 并行会导致写锁冲突 + 测试数据污染

### 8.2 对 Skills E2E 的影响

**编写阶段**(门 3):

- ✅ Assistant 和 Skills 测试代码可并行开发(无依赖)

**运行阶段**:

- ❌ 必须顺序执行(所有 `*.e2e.ts` 文件串行)
- ✅ 本地验证可用 `--grep` 先跑单模块:
  ```bash
  bun run test:e2e -- --grep "skills"  # 仅跑 Skills E2E
  ```
- ✅ 提交前必须完整跑:
  ```bash
  bun run test:e2e  # 顺序执行所有 E2E(含 Assistant + Skills)
  ```

### 8.3 测试设计建议

**数据隔离**:

- 所有 Skills E2E 使用 `E2E-Test-*` 前缀
- 所有 Assistant E2E 使用 `E2E-Assistant-*` 前缀(假设)
- 避免依赖对方模块的测试数据或执行顺序

**资源清理**:

- 每个测试套件的 `afterEach` 或 `afterAll` 必须清理测试数据
- 避免残留数据影响后续测试(无论是 Skills 还是 Assistant)

---

## 9. 测试文件结构规划

### 9.1 拆分原则

参考 Assistant E2E 拆分策略(`assistant-settings-crud.e2e.ts`, `assistant-settings-permissions.e2e.ts`, `assistant-settings-skills.e2e.ts`):

**按功能维度拆分**(推荐):

```
tests/e2e/specs/
├── skills-hub-my-skills.e2e.ts           # My Skills 板块(导入/删除/搜索/导出)
├── skills-hub-external-skills.e2e.ts    # 外部技能板块(Tab 切换/批量导入/自定义路径)
├── skills-hub-extension-auto.e2e.ts     # 扩展技能 + 自动注入技能板块
├── skills-hub-edge-cases.e2e.ts         # 边界场景(空状态/特殊字符/大规模列表)
```

### 9.2 每个文件的结构

```typescript
// tests/e2e/specs/skills-hub-my-skills.e2e.ts
import { test, expect } from '@playwright/test';
import { useElectronApp } from '../fixtures';
import {
  goToSkillsHub,
  getMySkills,
  importSkillViaBridge,
  deleteSkillViaUI,
  searchMySkills,
  cleanupTestSkills,
} from '../helpers/skillsHubSettings';

test.describe('SkillsHub - My Skills', () => {
  test.beforeEach(async ({ page }) => {
    await useElectronApp(page);
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  test('should display imported skills', async ({ page }) => {
    // Setup: 预置一个 skill
    await importSkillViaBridge(page, testSkillPath);

    // Assert: UI 显示该 skill
    await expect(page.locator('[data-testid="my-skill-card-E2E-Test-Skill-1"]')).toBeVisible();

    // Assert: Bridge 确认
    const skills = await getMySkills(page);
    expect(skills.some((s) => s.name === 'E2E-Test-Skill-1')).toBe(true);
  });

  test('should delete custom skill via UI', async ({ page }) => {
    // ... (见 4.3 场景 2)
  });

  test('should search skills by name', async ({ page }) => {
    // ... (见 4.3 场景 3)
  });

  // ... 更多用例
});
```

---

## 10. 门 3 实施检查清单

### 10.1 源码修改(由 engineer 执行)

- [ ] 在 `SkillsHubSettings.tsx` 添加 `normalizeTestId` 工具函数
- [ ] 补充 P0 testid(10 处,板块容器/卡片/操作按钮)
- [ ] 补充 P1 testid(10 处,搜索/刷新/Modal)
- [ ] (可选)补充 P2 testid(8 处,Tab/空状态)
- [ ] 验证 testid 正确性(手动检查 Elements 面板)

### 10.2 Helper 函数(由 engineer 执行)

- [ ] 创建 `tests/e2e/helpers/skillsHubSettings.ts`
- [ ] 实现导航函数(`goToSkillsHub`)
- [ ] 实现 Bridge 断言函数(`getMySkills`, `getExternalSources`, etc.)
- [ ] 实现 UI 操作函数(`searchMySkills`, `importSkillViaUI`, etc.)
- [ ] 实现清理函数(`cleanupTestSkills`)
- [ ] 更新 `selectors.ts` 添加 Skills Hub 选择器常量
- [ ] 更新 `navigation.ts` 添加 `settings.skills` 路由

### 10.3 测试数据构造(由 engineer 在测试用例中实现)

- [ ] 创建临时外部源目录(见 3.2)
- [ ] 动态生成测试 SKILL.md(直接 skill + skill pack)
- [ ] 通过 bridge 添加自定义外部路径
- [ ] 预置 My Skills 数据(通过 bridge 导入)
- [ ] 验证 Extension Skills 数据来源(检查 `examples/`)

### 10.4 测试用例编写(由 designer 主导,engineer 协助)

- [ ] `skills-hub-my-skills.e2e.ts`(6-8 个用例)
- [ ] `skills-hub-external-skills.e2e.ts`(6-8 个用例)
- [ ] `skills-hub-extension-auto.e2e.ts`(2-3 个用例)
- [ ] `skills-hub-edge-cases.e2e.ts`(4-5 个用例)
- [ ] 每个用例包含 Setup/Trigger/Assert/Cleanup

### 10.5 本地验证(由 engineer 执行)

- [ ] 单独运行 Skills E2E: `bun run test:e2e -- --grep "skills"`
- [ ] 完整运行所有 E2E: `bun run test:e2e`
- [ ] 验证 Skills E2E 与 Assistant E2E 顺序执行时无冲突
- [ ] 检查测试数据清理完整性(无 `E2E-Test-*` 残留)
- [ ] 截图调试失败用例(如有)

### 10.6 CI 集成(由 team-lead 或 engineer 执行)

- [ ] 确认 CI 环境 `workers: 1` 配置生效
- [ ] 确认 CI 环境 Electron app 可正常启动
- [ ] 确认 CI 环境 Skills E2E 通过率 ≥ 95%
- [ ] 监控 CI 日志中的测试数据清理情况

---

## 11. 总结

### 11.1 关键决策

1. **数据构造**: 动态创建临时目录 + bridge 构造,避免依赖预置固定路径
2. **testid 命名**: 使用 `normalizeTestId` 转义特殊字符,确保选择器稳定
3. **Bridge 断言**: Setup/Assert/Cleanup 允许,Trigger 必须 UI 交互
4. **文件拆分**: 按功能维度拆分为 4 个测试文件,每个文件 4-8 个用例
5. **并行约束**: 编写并行,运行串行(与 Assistant E2E 共享 Electron app)

### 11.2 风险与缓解

| 风险                            | 缓解措施                                        |
| ------------------------------- | ----------------------------------------------- |
| testid 补充不完整               | 分 P0/P1/P2 优先级,P0 必须补充                  |
| 测试数据残留污染                | `E2E-Test-*` 前缀 + afterEach 清理              |
| 文件选择器无法自动化            | Mock `dialog.showOpenDialog` 或跳过 UI 点击     |
| 大规模列表性能测试成本高        | 仅测试 50 skill 场景,100+ 由压测覆盖            |
| Extension Skills 数据来源不确定 | 验证 `examples/`,无则跳过 Extension Skills 板块 |

### 11.3 下一步

1. Designer 起草 `test-cases.zh.md`(具体测试用例设计)
2. Analyst 和 Engineer review `test-cases.zh.md`
3. 三方一致后进入门 3(测试代码编写)
4. Engineer 补充源码 testid + 实现 Helper 函数
5. Designer + Engineer 协同编写测试用例
6. 本地验证 → CI 集成 → 门 3 完成

---

**文档状态**: ✅ 初稿完成,待 skills-analyst-2 和 skills-designer-2 review
