# SkillsHubSettings E2E 测试用例

**文档版本**：v1.3  
**基于需求**：requirements.zh.md v1.2  
**修订日期**：2026-04-21  
**起草者**：skills-designer-2

**修订历史**：

- v1.0（初稿）：26 个测试用例
- v1.1：补充 3 个 P1 测试用例（TC-S-27~29），响应 skills-analyst-2 覆盖度 review
- v1.2：统一 testid 命名（14 个用例），响应 skills-engineer-2 可执行性 review
- v1.3：彻底移除所有 test.skip/限制措辞，TC-S-27/28/29 全部无条件执行（响应 team-lead + analyst 最终复审）

---

## 1. 概述

### 1.1 测试范围

本文档涵盖 SkillsHubSettings 页面的 UI 交互测试用例，聚焦：

- 技能列表展示（4 个板块）
- 技能导入/导出/删除操作
- 搜索与筛选
- 自定义路径管理
- URL 高亮定位

### 1.2 测试用例编号规则

- **前缀**：`TC-S-` (Test Case - Skills)
- **编号**：从 `01` 开始递增
- **示例**：`TC-S-01`, `TC-S-02`

### 1.3 优先级定义

| 优先级 | 定义                   | 执行频率   |
| ------ | ---------------------- | ---------- |
| P0     | 核心功能，阻塞发布     | 每次提交   |
| P1     | 重要功能，影响用户体验 | 每日构建   |
| P2     | 辅助功能，边界场景     | 每周回归   |
| P3     | 极端场景，低频使用     | 发布前回归 |

### 1.4 断言类型

- **UI 断言**：验证页面元素可见性、文本、状态
- **Bridge 断言**：验证 IPC 调用返回的数据正确性
- **混合断言**：同时验证 UI 和 Bridge 状态

---

## 2. 测试用例清单

### 2.1 我的技能（My Skills）板块

#### TC-S-01：渲染我的技能列表（基础场景）

**覆盖需求**：requirements.zh.md § 2.1.1  
**优先级**：P0  
**前置条件**：

- 用户技能目录 `~/.aionui/skills/` 中存在 2 个测试技能：
  - `E2E-Test-Builtin`（builtin 技能）
  - `E2E-Test-Custom`（custom 技能）

**测试步骤**：

1. 导航到 Skills Hub 页面（`#/settings/skills`）
2. 定位"我的技能"板块容器（`my-skills-section`）
3. 验证板块标题显示"My Skills"
4. 验证技能数量标记显示"2"

**预期结果**：

- ✅ 板块容器可见
- ✅ 显示 2 个技能卡片：
  - 卡片 1：名称 `E2E-Test-Builtin`，标签 `Built-in`
  - 卡片 2：名称 `E2E-Test-Custom`，标签 `Custom`
- ✅ 每个卡片包含头像、名称、描述、来源标签

**断言类型**：UI 断言 + Bridge 断言

- UI：验证卡片可见性和文本
- Bridge：`invokeBridge('fs.listAvailableSkills')` 返回包含 2 个技能

---

#### TC-S-02：搜索技能（匹配场景）

**覆盖需求**：requirements.zh.md § 2.5.1  
**优先级**：P0  
**前置条件**：

- 用户技能目录中存在 3 个测试技能：
  - `E2E-Test-Search-Target`（描述：target skill for search test）
  - `E2E-Test-Alpha`
  - `E2E-Test-Beta`

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位搜索框（`input-search-my-skills`）
3. 输入搜索关键词 `"Search"`
4. 等待搜索结果渲染

**预期结果**：

- ✅ 仅显示 1 个技能卡片：`E2E-Test-Search-Target`
- ✅ 其他 2 个卡片不可见
- ✅ 搜索框保持焦点

**断言类型**：UI 断言

- 验证 `my-skill-card-E2E-Test-Search-Target` 可见
- 验证 `my-skill-card-E2E-Test-Alpha` 不可见

---

#### TC-S-03：搜索技能（无匹配场景）

**覆盖需求**：requirements.zh.md § 2.5.1  
**优先级**：P1  
**前置条件**：

- 用户技能目录中存在至少 1 个测试技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位搜索框（`input-search-my-skills`）
3. 输入不存在的关键词 `"NonExistentKeyword"`
4. 等待搜索结果渲染

**预期结果**：

- ✅ 显示空状态提示：`"No skills found. Import some to get started."`
- ✅ 所有技能卡片不可见

**已知问题**：

- 当前实现无法区分"无技能"和"搜索无匹配"场景（requirements.zh.md § 2.1.1 line 64-70）

**断言类型**：UI 断言

---

#### TC-S-04：刷新技能列表

**覆盖需求**：requirements.zh.md § 2.1.1  
**优先级**：P1  
**前置条件**：

- 用户技能目录中存在 1 个测试技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 通过 Bridge 动态添加新技能：
   ```ts
   await invokeBridge(page, 'fs.importSkillWithSymlink', {
     skillPath: '/path/to/E2E-Test-New-Skill',
   });
   ```
3. 点击刷新按钮（`btn-refresh-my-skills`）
4. 等待刷新完成（loading 状态消失）

**预期结果**：

- ✅ 技能数量标记从"1"变为"2"
- ✅ 新技能卡片 `E2E-Test-New-Skill` 出现在列表中
- ✅ 显示成功提示 Message："Refreshed"

**断言类型**：混合断言

- UI：验证新卡片可见
- Bridge：`listAvailableSkills` 返回包含新技能

---

#### TC-S-05：删除自定义技能（成功场景）

**覆盖需求**：requirements.zh.md § 2.4.1  
**优先级**：P0  
**前置条件**：

- 用户技能目录中存在 1 个 custom 技能 `E2E-Test-Delete-Target`

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位目标技能卡片（`my-skill-card-E2E-Test-Delete-Target`）
3. Hover 到卡片上，显示操作按钮
4. 点击删除按钮（`btn-delete-E2E-Test-Delete-Target`）
5. 在确认 Modal 中点击"确认"按钮（`btn-confirm-delete`）
6. 等待删除完成

**预期结果**：

- ✅ 确认 Modal 显示，标题："Delete Skill"
- ✅ Modal 内容：`"Are you sure you want to delete \"E2E-Test-Delete-Target\"?"`
- ✅ 点击确认后 Modal 关闭
- ✅ 显示成功提示 Message："Skill deleted"
- ✅ 目标卡片从列表中消失
- ✅ 技能数量标记减 1

**断言类型**：混合断言

- UI：验证卡片消失、Message 显示
- Bridge：`listAvailableSkills` 不再包含该技能

---

#### TC-S-06：删除 builtin 技能（无删除按钮）

**覆盖需求**：requirements.zh.md § 2.4.1  
**优先级**：P1  
**前置条件**：

- 用户技能目录中存在 1 个 builtin 技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位 builtin 技能卡片
3. Hover 到卡片上

**预期结果**：

- ✅ 操作按钮区仅显示"Export"按钮
- ✅ **无删除按钮**（builtin 技能不可删除）

**断言类型**：UI 断言

---

#### TC-S-07：空状态展示（无技能）

**覆盖需求**：requirements.zh.md § 2.1.1  
**优先级**：P1  
**前置条件**：

- 用户技能目录为空（无任何技能）

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位"我的技能"板块容器

**预期结果**：

- ✅ 板块容器可见
- ✅ 显示空状态提示：`"No skills found. Import some to get started."`
- ✅ 技能数量标记显示"0"
- ✅ 无技能卡片渲染

**断言类型**：UI 断言

---

### 2.2 发现外部技能（Discovered External Skills）板块

#### TC-S-08：渲染外部技能列表（单源场景）

**覆盖需求**：requirements.zh.md § 2.1.2  
**优先级**：P0  
**前置条件**：

- 通过 Bridge 添加自定义外部路径：
  ```ts
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-external-'));
  fs.mkdirSync(path.join(tempDir, 'test-skill'));
  fs.writeFileSync(
    path.join(tempDir, 'test-skill/SKILL.md'),
    '---\nname: E2E-Test-External\ndescription: "Test external skill"\n---\n# Test'
  );
  await invokeBridge(page, 'fs.addCustomExternalPath', {
    name: 'E2E Test Source',
    path: tempDir,
  });
  ```

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位"发现外部技能"板块容器（`external-skills-section`）
3. 验证板块标题显示"Discovered External Skills"
4. 验证外部技能总数标记

**预期结果**：

- ✅ 板块容器可见
- ✅ 显示 1 个 Tab 按钮："E2E Test Source (1)"
- ✅ Tab 处于激活状态
- ✅ 显示 1 个技能卡片：`E2E-Test-External`
- ✅ 显示源路径：`tempDir`

**断言类型**：混合断言

- UI：验证 Tab 和卡片可见性
- Bridge：`detectAndCountExternalSkills` 返回包含 1 个源

---

#### TC-S-09：Tab 切换外部源（多源场景）

**覆盖需求**：requirements.zh.md § 2.1.2  
**优先级**：P0  
**前置条件**：

- 添加 2 个自定义外部路径：
  - `E2E Source A`（包含 2 个技能）
  - `E2E Source B`（包含 3 个技能）

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 验证默认激活的 Tab（第一个源）
3. 点击第二个 Tab 按钮（`external-source-tab-e2e-source-b`）
4. 等待技能列表更新

**预期结果**：

- ✅ 第一个 Tab 变为未激活状态
- ✅ 第二个 Tab 变为激活状态（蓝色背景）
- ✅ 技能列表更新，显示 3 个技能卡片
- ✅ 源路径更新为 `E2E Source B` 的路径

**断言类型**：UI 断言

---

#### TC-S-10：单项导入外部技能（成功场景）

**覆盖需求**：requirements.zh.md § 2.2.1  
**优先级**：P0  
**前置条件**：

- 外部源中存在 1 个技能 `E2E-Test-Import-Single`

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位外部技能卡片（`external-skill-card-E2E-Test-Import-Single`）
3. 点击"Import"按钮（`btn-import-E2E-Test-Import-Single`）
4. 等待导入完成

**预期结果**：

- ✅ 显示成功提示 Message："Skill imported successfully"
- ✅ "我的技能"板块自动刷新，新技能出现
- ✅ 技能数量标记增加 1

**断言类型**：混合断言

- UI：验证 Message 显示、新卡片出现
- Bridge：`listAvailableSkills` 包含新技能

---

#### TC-S-11：批量导入外部技能（部分成功场景）

**覆盖需求**：requirements.zh.md § 2.2.3  
**优先级**：P1  
**前置条件**：

- 外部源中存在 3 个技能：
  - `E2E-Test-Batch-1`（有效）
  - `E2E-Test-Batch-2`（已存在于"我的技能"）
  - `E2E-Test-Batch-3`（有效）

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 点击"Import All"按钮（`btn-import-all`）
3. 等待批量导入完成

**预期结果**：

- ✅ 显示成功提示 Message："2 skills imported"（跳过已存在的）
- ✅ "我的技能"板块自动刷新
- ✅ 新增 2 个技能卡片（`E2E-Test-Batch-1` 和 `E2E-Test-Batch-3`）

**已知限制**：

- 无 loading 状态、无进度反馈、无取消机制（requirements.zh.md § 2.2.3 line 256-265）

**断言类型**：混合断言

---

#### TC-S-12：搜索外部技能（匹配场景）

**覆盖需求**：requirements.zh.md § 2.5.2  
**优先级**：P1  
**前置条件**：

- 外部源中存在 3 个技能：
  - `E2E-Test-External-Alpha`
  - `E2E-Test-External-Beta`
  - `E2E-Test-External-Search-Target`

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位外部技能搜索框（`input-search-external`）
3. 输入搜索关键词 `"Search"`
4. 等待搜索结果渲染

**预期结果**：

- ✅ 仅显示 1 个技能卡片：`E2E-Test-External-Search-Target`
- ✅ 其他 2 个卡片不可见

**断言类型**：UI 断言

---

#### TC-S-13：搜索外部技能（无匹配场景）

**覆盖需求**：requirements.zh.md § 2.5.2  
**优先级**：P1  
**前置条件**：

- 外部源中存在至少 1 个技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位外部技能搜索框（`input-search-external`）
3. 输入不存在的关键词 `"NonExistentKeyword"`
4. 等待搜索结果渲染

**预期结果**：

- ✅ 显示空结果提示：`"No matching skills found"`
- ✅ 所有技能卡片不可见

**断言类型**：UI 断言

---

#### TC-S-14：刷新外部技能列表

**覆盖需求**：requirements.zh.md § 2.1.2  
**优先级**：P1  
**前置条件**：

- 外部源中存在 1 个技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 通过文件系统动态添加新技能到外部源目录：
   ```ts
   fs.mkdirSync(path.join(tempDir, 'new-skill'));
   fs.writeFileSync(path.join(tempDir, 'new-skill/SKILL.md'), '---\nname: E2E-Test-New-External\n---');
   ```
3. 点击外部技能刷新按钮（`btn-refresh-external`）
4. 等待刷新完成

**预期结果**：

- ✅ 外部技能数量标记从"1"变为"2"
- ✅ 新技能卡片 `E2E-Test-New-External` 出现
- ✅ 显示成功提示 Message："Refreshed"
- ✅ 刷新按钮的 icon 显示旋转动画（`animate-spin`）

**断言类型**：混合断言

---

#### TC-S-15：空外部源状态（无外部技能）

**覆盖需求**：requirements.zh.md § 2.1.2  
**优先级**：P2  
**前置条件**：

- 无任何外部源（预定义路径不存在，无自定义路径）

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 检查"发现外部技能"板块是否渲染

**预期结果**：

- ✅ **整个板块不渲染**（`external-skills-section` 不存在）
- ✅ 仅显示"我的技能"板块和其他板块

**断言类型**：UI 断言

---

### 2.3 自定义路径管理

#### TC-S-16：添加自定义外部路径（成功场景）

**覆盖需求**：requirements.zh.md § 2.7.1  
**优先级**：P0  
**前置条件**：

- 创建临时目录并添加测试技能：
  ```ts
  const customPath = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-custom-'));
  fs.mkdirSync(path.join(customPath, 'test-skill'));
  fs.writeFileSync(path.join(customPath, 'test-skill/SKILL.md'), '---\nname: E2E-Test-Custom-Path\n---');
  ```

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 点击添加自定义路径按钮（`btn-add-custom-source`，Plus 图标）
3. 在 Modal 中填写：
   - Name 输入框（`input-custom-path-name`）：`"E2E Custom Source"`
   - Path 输入框（`input-custom-path-value`）：`customPath`
4. 点击"Confirm"按钮
5. 等待添加完成

**预期结果**：

- ✅ Modal 关闭
- ✅ 新增 Tab 按钮："E2E Custom Source (1)"
- ✅ 自动切换到新 Tab
- ✅ 显示技能卡片：`E2E-Test-Custom-Path`

**断言类型**：混合断言

- UI：验证 Tab 和卡片出现
- Bridge：`detectAndCountExternalSkills` 包含新源
- Bridge：`getCustomExternalPaths` 包含新路径

---

#### TC-S-17：添加自定义路径（路径重复场景）

**覆盖需求**：requirements.zh.md § 2.7.1  
**优先级**：P1  
**前置条件**：

- 已存在自定义路径 `/path/to/existing-source`

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 点击添加自定义路径按钮
3. 在 Modal 中填写：
   - Name：`"Duplicate Source"`
   - Path：`/path/to/existing-source`（已存在）
4. 点击"Confirm"按钮

**预期结果**：

- ✅ 显示错误提示 Message："Path already exists"
- ✅ Modal 保持打开状态
- ✅ 无新 Tab 添加

**断言类型**：UI 断言

---

#### TC-S-18：添加自定义路径（必填验证）

**覆盖需求**：requirements.zh.md § 2.7.1  
**优先级**：P1  
**前置条件**：无

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 点击添加自定义路径按钮
3. 保持 Name 和 Path 输入框为空
4. 检查"Confirm"按钮状态

**预期结果**：

- ✅ "Confirm"按钮为禁用状态（`disabled` 属性）
- ✅ 无法点击确认

**测试步骤（填写 Name 后）**：

1. 在 Name 输入框填写 `"Test Source"`
2. Path 输入框保持为空
3. 检查"Confirm"按钮状态

**预期结果**：

- ✅ "Confirm"按钮仍为禁用状态（Path 必填）

**断言类型**：UI 断言

---

### 2.4 技能导出

#### TC-S-19：导出技能到外部源（成功场景）

**覆盖需求**：requirements.zh.md § 2.3.1  
**优先级**：P0  
**前置条件**：

- "我的技能"中存在 1 个技能 `E2E-Test-Export-Source`
- 存在外部源 `E2E Target Source`

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位目标技能卡片（`my-skill-card-E2E-Test-Export-Source`）
3. Hover 到卡片上，显示操作按钮
4. 点击"Export"按钮（`btn-export-E2E-Test-Export-Source`）
5. 在 Dropdown 中选择目标源："E2E Target Source"
6. 等待导出完成

**预期结果**：

- ✅ Dropdown 展开，显示可选外部源列表
- ✅ 显示 Loading Message："Processing..."
- ✅ 导出完成后显示成功提示 Message："Skill exported successfully"
- ✅ Loading Message 隐藏
- ✅ **"我的技能"列表不刷新**（因为列表未变化，requirements.zh.md § 2.1.1 line 58-59）

**断言类型**：UI 断言（E2E 不验证目标目录文件）

---

#### TC-S-20：导出技能（目标已存在场景）

**覆盖需求**：requirements.zh.md § 2.3.1  
**优先级**：P1  
**前置条件**：

- "我的技能"中存在 1 个技能 `E2E-Test-Export-Duplicate`
- 外部源 `E2E Target Source` 中已存在同名技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位目标技能卡片
3. 点击"Export"按钮
4. 在 Dropdown 中选择目标源
5. 等待导出完成

**预期结果**：

- ✅ 显示错误提示 Message："Target already exists: /path/to/target"
- ✅ Loading Message 隐藏

**断言类型**：UI 断言

---

#### TC-S-21：导出技能（无外部源场景）

**覆盖需求**：requirements.zh.md § 2.3.1  
**优先级**：P2  
**前置条件**：

- "我的技能"中存在 1 个技能
- 无任何外部源（`externalSources.length === 0`）

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位目标技能卡片
3. Hover 到卡片上

**预期结果**：

- ✅ **无"Export"按钮显示**（Dropdown 条件渲染，requirements.zh.md line 492）

**断言类型**：UI 断言

---

### 2.5 URL 高亮定位

#### TC-S-22：URL 参数高亮技能（成功场景）

**覆盖需求**：requirements.zh.md § 2.8.1  
**优先级**：P1  
**前置条件**：

- "我的技能"中存在 1 个技能 `E2E-Test-Highlight-Target`

**测试步骤**：

1. 导航到 `#/settings/skills?highlight=E2E-Test-Highlight-Target`
2. 等待页面加载和滚动动画完成
3. 检查目标技能卡片状态

**预期结果**：

- ✅ 页面自动滚动到目标卡片（`scrollIntoView`）
- ✅ 目标卡片应用高亮样式：
  - 边框：`border-primary-5`
  - 背景：`bg-primary-1`
- ✅ 2 秒后高亮样式消失
- ✅ URL 中的 `?highlight` 参数被清除

**断言类型**：UI 断言

- 验证卡片 class 包含高亮样式
- 等待 2 秒后验证高亮样式移除
- 验证 URL 不再包含 `highlight` 参数

---

#### TC-S-23：URL 参数高亮技能（技能不存在场景）

**覆盖需求**：requirements.zh.md § 2.8.1  
**优先级**：P2  
**前置条件**：

- "我的技能"中不存在 `NonExistentSkill`

**测试步骤**：

1. 导航到 `#/settings/skills?highlight=NonExistentSkill`
2. 等待页面加载完成

**预期结果**：

- ✅ 无滚动动画触发
- ✅ 无技能卡片应用高亮样式
- ✅ URL 参数被清除（即使技能不存在）

**断言类型**：UI 断言

---

### 2.6 边界与异常场景

#### TC-S-24：技能名称包含特殊字符（导入场景）

**覆盖需求**：requirements.zh.md § 5.1.4  
**优先级**：P2  
**前置条件**：

- 创建技能名称包含特殊字符的测试技能：
  ```markdown
  ---
  name: E2E:Test/Skill*Name
  ---
  ```

**测试步骤**：

1. 通过 Bridge 导入该技能：
   ```ts
   await invokeBridge(page, 'fs.importSkillWithSymlink', {
     skillPath: '/path/to/special-char-skill',
   });
   ```
2. 检查导入结果

**预期结果**：

- ✅ 导入失败，显示错误提示（依赖文件系统报错）
- 或
- ✅ 导入成功，但 `data-testid` 中的特殊字符被转义为 `-`

**已知限制**：

- 当前实现无特殊字符过滤（requirements.zh.md § 5.1.4）

**断言类型**：混合断言

---

#### TC-S-25：大规模技能列表渲染（性能场景）

**覆盖需求**：requirements.zh.md § 5.5.1  
**优先级**：P3  
**前置条件**：

- 通过 Bridge 批量创建 50 个测试技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 测量"我的技能"板块渲染时间
3. 验证页面响应性

**预期结果**：

- ✅ 渲染时间 < 1 秒
- ✅ 滚动流畅（无明显卡顿）
- ✅ 搜索输入响应延迟 < 100ms

**已知限制**：

- 无虚拟滚动，建议技能数量 ≤ 100（requirements.zh.md § 5.5.1）

**断言类型**：性能断言（使用 Playwright 的 performance API）

---

#### TC-S-26：并发操作（连续快速刷新）

**覆盖需求**：requirements.zh.md § 5.4.1  
**优先级**：P2  
**前置条件**：

- "我的技能"中存在至少 1 个技能

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 快速连续点击刷新按钮 3 次（间隔 < 100ms）
3. 观察刷新行为

**预期结果**：

- ✅ 第二次和第三次点击被阻止（按钮禁用或无响应）
- ✅ 仅触发 1 次刷新请求
- ✅ 刷新完成后显示成功提示

**断言类型**：UI 断言

---

#### TC-S-27：渲染扩展技能板块

**覆盖需求**：requirements.zh.md § 2.1.3  
**优先级**：P1  
**前置条件**：

- 无（不依赖实际扩展数据）

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位"扩展技能"板块容器（`extension-skills-section`）
3. 验证板块标题显示"Extension Skills"
4. 验证板块容器渲染正确

**预期结果**：

- ✅ 板块容器可见且结构正确
- ✅ 板块标题显示"Extension Skills"
- ✅ 如存在扩展技能，卡片应显示 Extension 标签和 Puzzle 图标（紫色）
- ✅ 如无扩展技能，显示空状态或无卡片

**断言类型**：UI 断言

- UI：验证板块容器存在、标题正确、布局结构完整

---

#### TC-S-28：渲染自动注入技能板块

**覆盖需求**：requirements.zh.md § 2.1.4  
**优先级**：P1  
**前置条件**：

- 无（不依赖 `_builtin/` 目录实际内容）

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 定位"自动注入技能"板块容器（`auto-skills-section`）
3. 验证板块标题显示"Auto-injected Skills"
4. 验证板块容器渲染正确

**预期结果**：

- ✅ 板块容器可见且结构正确
- ✅ 板块标题显示"Auto-injected Skills"
- ✅ 如存在自动注入技能，卡片应显示 Auto 标签和 Lightning 图标（绿色）
- ✅ 如无自动注入技能，显示空状态或无卡片

**断言类型**：UI 断言 + Bridge 断言

- UI：验证板块容器存在、标题正确、布局结构完整
- Bridge：`invokeBridge('fs.listBuiltinAutoSkills')` 查询自动技能列表（可能为空）

---

#### TC-S-29：从文件夹导入技能（Mock 场景）

**覆盖需求**：requirements.zh.md § 2.2.1  
**优先级**：P1  
**前置条件**：

- 创建临时测试技能目录并生成 `SKILL.md`
- Mock `dialog.showOpenDialog` 返回测试技能路径

**测试步骤**：

1. 导航到 Skills Hub 页面
2. 在测试开始时注入 Mock：
   ```ts
   await electronApp.evaluate(async ({ dialog }, targetPath) => {
     dialog.showOpenDialog = () =>
       Promise.resolve({
         canceled: false,
         filePaths: [targetPath],
       });
   }, testSkillPath);
   ```
3. 点击"Import from Folder"按钮（`btn-manual-import`）
4. 等待导入完成

**预期结果**：

- ✅ 显示成功提示 Message
- ✅ 新技能卡片出现在"我的技能"列表
- ✅ 卡片显示 Custom 标签

**断言类型**：混合断言

- UI：验证成功 Message、卡片出现
- Bridge：`invokeBridge('fs.listAvailableSkills')` 返回包含新导入技能

---

## 3. 数据构造策略

### 3.1 测试数据命名规范

所有测试数据使用 `E2E-Test-*` 前缀，便于识别和批量清理：

- 技能名称：`E2E-Test-{场景}-{描述}`
- 外部源名称：`E2E Source {标识}`
- 示例：`E2E-Test-Import-Single`, `E2E Source A`

### 3.2 测试前置（Setup）

每个测试文件的 `beforeAll` 或 `beforeEach` 中：

1. **清理遗留数据**：

   ```ts
   const skills = await invokeBridge(page, 'fs.listAvailableSkills');
   for (const skill of skills) {
     if (skill.name.startsWith('E2E-Test-')) {
       await invokeBridge(page, 'fs.deleteSkill', { skillName: skill.name });
     }
   }
   ```

2. **创建临时外部源**：
   ```ts
   const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-external-'));
   // 添加测试技能...
   await invokeBridge(page, 'fs.addCustomExternalPath', {
     name: 'E2E Test Source',
     path: tempDir,
   });
   ```

### 3.3 测试清理（Cleanup）

每个测试文件的 `afterAll` 中：

1. **删除测试技能**：

   ```ts
   const skills = await invokeBridge(page, 'fs.listAvailableSkills');
   for (const skill of skills) {
     if (skill.name.startsWith('E2E-Test-')) {
       await invokeBridge(page, 'fs.deleteSkill', { skillName: skill.name });
     }
   }
   ```

2. **清理临时目录**：

   ```ts
   fs.rmSync(tempDir, { recursive: true, force: true });
   ```

3. **清理自定义外部路径**：
   ```ts
   const customPaths = await invokeBridge(page, 'fs.getCustomExternalPaths');
   for (const path of customPaths) {
     if (path.name.startsWith('E2E')) {
       await invokeBridge(page, 'fs.removeCustomExternalPath', { path: path.path });
     }
   }
   ```

---

## 4. testid 补充需求

### 4.1 必需 testid（P0 优先级）

以下 testid 必须在源码中添加，否则测试用例无法执行：

**我的技能板块**：

- `my-skills-section`（板块容器）
- `my-skill-card-${normalizedName}`（技能卡片，需转义）
- `btn-delete-${normalizedName}`（删除按钮）

**发现外部技能板块**：

- `external-skills-section`（板块容器）
- `external-source-tab-${source}`（Tab 按钮）
- `external-skill-card-${normalizedName}`（技能卡片）
- `btn-import-${normalizedName}`（单项导入按钮）
- `btn-import-all`（批量导入按钮）

**自定义路径 Modal**：

- `btn-add-custom-source`（Plus 按钮）
- `add-custom-path-modal`（Modal 容器）
- `input-custom-path-name`（Name 输入框）
- `input-custom-path-value`（Path 输入框）

### 4.2 testid 转义规则

技能名称中的特殊字符需转义为 `-`：

```ts
const normalizeTestId = (name: string) => name.replace(/[:\/\s<>"'|?*]/g, '-');
```

**示例**：

- 技能名称：`my:skill` → testid：`my-skill-card-my-skill`
- 技能名称：`test/skill` → testid：`my-skill-card-test-skill`

---

## 5. 测试执行策略

### 5.1 测试分组

建议按优先级分组执行：

```bash
# P0 核心功能（每次提交）
npx playwright test --grep "@p0"

# P1 重要功能（每日构建）
npx playwright test --grep "@p1"

# P2-P3 边界场景（发布前）
npx playwright test --grep "@p2|@p3"
```

### 5.2 并行执行

Skills 模块测试与 Assistant 模块测试是否可并行执行，需等待 engineer 调研结论（可能因 Electron 单实例冲突需串行）。

---

## 6. 已知限制与注意事项

### 6.1 UI 层未实现功能

以下功能在需求文档中已标注为 UI 未实现，测试用例不覆盖：

- 删除自定义外部路径（Bridge 已实现，UI 未调用）
- Skills Market 集成（完全未实现）

### 6.2 边界场景未处理

以下边界场景当前实现未处理，测试用例需验证当前行为：

- 技能名称包含特殊字符（依赖文件系统报错）
- 搜索空结果歧义（无技能 vs 搜索无匹配，提示相同）

### 6.3 性能限制

- 单个板块建议技能数量 ≤ 100（无虚拟滚动）
- 批量导入无 loading 状态、无进度反馈
- 搜索无防抖（快速输入可能频繁触发计算）

---

**文档状态**：✅ v1.3 定稿（29 个测试用例，所有用例无条件执行）  
**修订说明**：彻底移除所有 test.skip/限制措辞，TC-S-27/28/29 全部无条件断言容器存在  
**下一步**：通知 analyst、engineer、team-lead 最终复审 v1.3
