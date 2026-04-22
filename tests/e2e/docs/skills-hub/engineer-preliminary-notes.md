# SkillsHub E2E 工程师预备笔记

**作者**: skills-engineer-2  
**日期**: 2026-04-21  
**状态**: 预备阶段(门 1)

---

## 一、已掌握材料

### 1.1 E2E 基础设施
- ✅ `tests/e2e/README.md` — 架构、launch 模式、编写规范
- ✅ `tests/e2e/fixtures.ts` — Electron 启动、singleton 管理
- ✅ `tests/e2e/helpers/` 全部模块:
  - `bridge.ts` — invokeBridge 协议
  - `navigation.ts` — navigateTo、goToSettings
  - `selectors.ts` — CSS 选择器常量
  - `conversation.ts` — 对话生命周期
  - `assertions.ts` — 断言辅助
  - `assistantSettings.ts` — Assistant CRUD helper(参考模板)
  - `extensions.ts` — 扩展快照
  - `screenshots.ts` — 手动截图

### 1.2 SkillsHubSettings 源码
- ✅ `src/renderer/pages/settings/SkillsHubSettings.tsx` (765 行)
- ✅ `src/common/adapter/ipcBridge.ts` — skill 相关 bridge key

---

## 二、ipcBridge Skill 端点清单

| Bridge Key | 参数 | 返回 | 用途 |
|------------|------|------|------|
| `fs.listAvailableSkills` | 无 | `SkillInfo[]` | 列出已安装 skill(My Skills + Extension Skills) |
| `fs.listBuiltinAutoSkills` | 无 | `{ name, description }[]` | 列出内置自动注入 skill |
| `fs.detectAndCountExternalSkills` | 无 | `{ success, data: ExternalSource[] }` | 检测外部 skill 源(Claude Code CLI/etc) |
| `fs.getSkillPaths` | 无 | `{ userSkillsDir, builtinSkillsDir }` | 获取 skill 存储路径 |
| `fs.importSkillWithSymlink` | `{ skillPath }` | `IBridgeResponse<{ skillName }>` | 导入外部 skill(符号链接) |
| `fs.deleteSkill` | `{ skillName }` | `IBridgeResponse` | 删除自定义 skill |
| `fs.exportSkillWithSymlink` | `{ skillPath, targetDir }` | `IBridgeResponse` | 导出 skill 到外部目录 |
| `fs.addCustomExternalPath` | `{ name, path }` | `IBridgeResponse` | 添加自定义外部 skill 路径 |

**E2E 使用原则**(来自 README):
- ✅ **Setup/Assert/Cleanup** — 读取初始状态、验证后端状态、清理测试数据
- ❌ **Trigger operations** — 操作必须通过 UI 交互触发(不能直接调 bridge 替代点击)

---

## 三、UI 现状分析

### 3.1 关键问题: **整页无 data-testid**

当前 SkillsHubSettings.tsx **完全没有** `data-testid` 属性,所有元素依赖:
- CSS class 匹配(`.bg-base`、`.rd-12px` 等 UnoCSS 原子类,不稳定)
- 文本内容匹配(i18n key,双语问题)
- DOM 结构匹配(易因 layout 调整而失效)

### 3.2 需要 data-testid 的元素清单

#### 外部 Skills 区域
- `[data-testid="external-skills-section"]` — 整个外部 skill 区域
- `[data-testid="btn-refresh-external"]` — 刷新按钮
- `[data-testid="input-search-external"]` — 搜索框
- `[data-testid="external-source-tab-{source}"]` — 每个源标签按钮(Claude Code、Custom 等)
- `[data-testid="btn-add-custom-source"]` — 添加自定义源按钮
- `[data-testid="external-skill-card-{skillName}"]` — 每个外部 skill 卡片
- `[data-testid="btn-import-{skillName}"]` — 单个 skill 导入按钮
- `[data-testid="btn-import-all"]` — 导入全部按钮

#### My Skills 区域
- `[data-testid="my-skills-section"]` — 整个我的 skill 区域
- `[data-testid="btn-refresh-my-skills"]` — 刷新按钮
- `[data-testid="input-search-my-skills"]` — 搜索框
- `[data-testid="btn-manual-import"]` — 从文件夹导入按钮
- `[data-testid="my-skill-card-{skillName}"]` — 每个 skill 卡片
- `[data-testid="btn-export-{skillName}"]` — 导出按钮(Dropdown trigger)
- `[data-testid="btn-delete-{skillName}"]` — 删除按钮(仅 custom skill)
- `[data-testid="skill-badge-{skillName}"]` — Built-in/Custom 标签

#### Extension Skills 区域
- `[data-testid="extension-skills-section"]` — 整个扩展 skill 区域
- `[data-testid="extension-skill-card-{skillName}"]` — 每个扩展 skill 卡片

#### Builtin Auto-injected Skills 区域
- `[data-testid="auto-skills-section"]` — 整个自动注入 skill 区域
- `[data-testid="auto-skill-card-{skillName}"]` — 每个自动注入 skill 卡片

#### Modal: Add Custom Path
- `[data-testid="modal-add-custom-path"]` — Modal 容器
- `[data-testid="input-custom-path-name"]` — 名称输入框
- `[data-testid="input-custom-path-value"]` — 路径输入框
- `[data-testid="btn-browse-custom-path"]` — 浏览按钮
- `[data-testid="btn-confirm-add-path"]` — 确认按钮(Modal okButton)
- `[data-testid="btn-cancel-add-path"]` — 取消按钮(Modal cancelButton)

#### 删除确认 Modal
- `[data-testid="modal-delete-skill"]` — Modal 容器(wrapClassName)
- `[data-testid="btn-confirm-delete"]` — 确认删除按钮

---

## 四、现有 Helper 能力与缺口

### 4.1 可直接复用
- ✅ `invokeBridge(page, key, data)` — 调用上述所有 bridge endpoint
- ✅ `navigateTo(page, hash)` — 需在 `navigation.ts` 的 `ROUTES.settings` 对象增加 `skills: '#/settings/skills'`
- ✅ `takeScreenshot(page, name)` — 手动截图

### 4.2 需新建 helper 文件
参考 `assistantSettings.ts` 结构,新建 `tests/e2e/helpers/skillsHubSettings.ts`:

**导航类**
```typescript
export async function goToSkillsHub(page: Page): Promise<void> {
  await navigateTo(page, '#/settings/skills');
}
```

**断言类**
```typescript
export async function getMySkills(page: Page): Promise<SkillInfo[]> {
  return invokeBridge(page, 'fs.listAvailableSkills');
}

export async function getExternalSources(page: Page): Promise<ExternalSource[]> {
  const result = await invokeBridge(page, 'fs.detectAndCountExternalSkills');
  return result.success ? result.data : [];
}
```

**操作类**(基于 data-testid,待源码补充后实现)
```typescript
export async function searchExternalSkills(page: Page, query: string): Promise<void>;
export async function importSkill(page: Page, skillName: string): Promise<void>;
export async function deleteSkill(page: Page, skillName: string): Promise<void>;
export async function exportSkill(page: Page, skillName: string, targetSource: string): Promise<void>;
// ... 等等
```

### 4.3 需在 selectors.ts 增加常量
```typescript
// Skills Hub
export function skillCardById(skillName: string): string {
  return `[data-testid="my-skill-card-${skillName}"]`;
}
export const BTN_IMPORT_SKILL = '[data-testid^="btn-import-"]';
export const BTN_DELETE_SKILL = '[data-testid^="btn-delete-"]';
// ... 等等
```

---

## 五、E2E 可测试性待补充项

### 5.1 阻塞项(门 1 必须解决)
- ❌ **所有交互元素无 data-testid** — 无法稳定定位元素
- ❌ **列表项无唯一标识** — 无法精准操作特定 skill(依赖文本匹配易受 i18n 影响)
- ❌ **Modal 无 testid** — 无法区分不同 Modal(删除 vs 添加路径)

### 5.2 数据构造方案
**前置条件构造**:
1. **外部 skill 源存在** — 需测试环境预置 Claude Code CLI skill 目录,或通过 `fs.addCustomExternalPath` 动态添加
2. **My Skills 有数据** — 测试前通过 `fs.importSkillWithSymlink` 导入测试 skill,测试后通过 `fs.deleteSkill` 清理
3. **Extension Skills 存在** — 依赖 E2E 的 `AIONUI_EXTENSIONS_PATH` 环境变量指向 `examples/` 目录

**数据隔离**:
- 所有测试 skill 名称前缀 `E2E-Test-`,清理时批量删除
- 自定义外部路径使用临时目录(`fs.mkdtempSync`),测试后清理

### 5.3 不可直接 E2E 的需求及替代方案

| 需求 | 原因 | 替代方案 |
|------|------|----------|
| 导入后 skill 文件内容正确 | E2E 不读文件系统 | 导入后 `invokeBridge('fs.readSkillInfo')` 验证元信息 |
| 符号链接创建成功 | E2E 不验证 symlink | 导入后 bridge 查路径包含源路径关键字 |
| 删除操作不影响源文件 | E2E 不访问外部路径 | 仅验证 UI 消失 + bridge 确认 skill 列表不含该项 |
| 导出超时处理 | 超时难复现 | 单测覆盖,E2E 仅验证正常流程 |

---

## 六、对 Analyst 的输入建议

### 6.1 需求文档应单独列出"测试依赖项"章节
包含:
- 所有需要补充的 data-testid 清单(见"三、3.2"节)
- 前置数据构造方案(见"五、5.2"节)
- 测试环境配置要求(外部 skill 源路径、Extension 路径)

### 6.2 每条需求需标注"可测方式"
- **UI 交互**: 点击、输入、断言 DOM 可见性
- **Bridge 断言**: 操作后调 `invokeBridge` 验证后端状态
- **截图验证**: 复杂 UI 状态(搜索结果、筛选后列表)

### 6.3 边界条件需明确测试策略
- 空列表状态(无外部源、无 My Skills)
- 搜索无结果
- 删除最后一个 custom skill
- 导入已存在 skill(冲突处理)
- Modal 取消操作

---

## 七、待 Analyst 通知后执行 Review

收到 `requirements.zh.md` 初稿通知后,将从以下维度 review:
1. **完整性** — 是否覆盖所有 UI 区域(4 个 section + 2 个 Modal)
2. **可测性** — 每条需求能否通过 UI 交互 + bridge 断言验证
3. **数据依赖** — 前置条件是否可构造、清理策略是否明确
4. **testid 充足性** — 对照"三、3.2"节检查遗漏项
5. **替代方案** — 不可测项是否有 bridge 断言或单测兜底

Review 意见追加到 `tests/e2e/docs/skills-hub/discussion-log.zh.md`,通过 SendMessage 通知 skills-analyst-2。

---

**状态**: ✅ 预备完成,等待 analyst 通知初稿就位
