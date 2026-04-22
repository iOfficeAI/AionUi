# Skills Hub E2E 实现映射

本文档记录 `test-cases.zh.md` 中定义的 29 个测试用例与实际 E2E 实现文件的对应关系。

**生成时间**：2026-04-21  
**实现目录**：`tests/e2e/features/settings/skills/`  
**文档版本**：test-cases.zh.md v1.3

---

## 统计概览

| 类别 | 文档定义 | 实际实现 | 状态 |
|------|---------|---------|------|
| P0 核心交互 | 8 | 8 | ✅ 100% |
| P1 功能验证 | 15 | 15 | ✅ 100% |
| P2 边界用例 | 5 | 5 | ✅ 100% |
| P3 性能测试 | 1 | 1 | ✅ 100% |
| **总计** | **29** | **29** | ✅ 100% (29/29) |

**截图总数**：126 次 `takeScreenshot()` 调用  
**平均截图数/测试**：4.3 张

---

## P0 核心交互（8/8 实现）

| 用例 ID | 用例标题 | 实现文件 | 行号 | 测试函数名 | 通过 | 截图数 |
|---------|---------|----------|------|-----------|------|--------|
| TC-S-01 | 渲染我的技能列表（基础场景） | tests/e2e/features/settings/skills/core-ui.e2e.ts | 68 | `test('TC-S-01: should render My Skills section with builtin and custom skills')` | ✅ | 3 |
| TC-S-02 | 搜索技能（匹配场景） | tests/e2e/features/settings/skills/search.e2e.ts | 41 | `test('TC-S-02: should filter My Skills list by search keyword')` | ✅ | 3 |
| TC-S-05 | 删除自定义技能（成功场景） | tests/e2e/features/settings/skills/core-ui.e2e.ts | 136 | `test('TC-S-05: should delete custom skill via UI with confirmation modal')` | ✅ | 5 |
| TC-S-08 | 渲染外部技能列表（单源场景） | tests/e2e/features/settings/skills/core-ui.e2e.ts | 264 | `test('TC-S-08: should render external skills section with custom source')` | ✅ | 4 |
| TC-S-09 | Tab 切换外部源（多源场景） | tests/e2e/features/settings/skills/refresh-empty-tabs.e2e.ts | 137 | `test('TC-S-09: should switch tabs and show correct external skills')` | ✅ | 4 |
| TC-S-10 | 单项导入外部技能（成功场景） | tests/e2e/features/settings/skills/core-ui.e2e.ts | 322 | `test('TC-S-10: should import external skill via UI click')` | ✅ | 5 |
| TC-S-16 | 添加自定义外部路径（成功场景） | tests/e2e/features/settings/skills/core-ui.e2e.ts | 386 | `test('TC-S-16: should add custom external path via UI')` | ✅ | 7 |
| TC-S-19 | 导出技能到外部源（成功场景） | tests/e2e/features/settings/skills/core-ui.e2e.ts | 473 | `test('TC-S-19: should export skill to external source via UI')` | ✅ | 5 |

**小计**：8 个测试，36 张截图

---

## P1 功能验证（15/15 实现）

| 用例 ID | 用例标题 | 实现文件 | 行号 | 测试函数名 | 通过 | 截图数 |
|---------|---------|----------|------|-----------|------|--------|
| TC-S-03 | 搜索技能（无匹配场景） | tests/e2e/features/settings/skills/search.e2e.ts | 112 | `test('TC-S-03: should show empty state when search has no match')` | ✅ | 3 |
| TC-S-04 | 刷新技能列表 | tests/e2e/features/settings/skills/refresh-empty-tabs.e2e.ts | 39 | `test('TC-S-04: should refresh My Skills list and show newly added skill')` | ✅ | 4 |
| TC-S-06 | 删除 builtin 技能（无删除按钮） | tests/e2e/features/settings/skills/core-ui.e2e.ts | 219 | `test('TC-S-06: should not show delete button for builtin skills')` | ✅ | 3 |
| TC-S-07 | 空状态展示（无技能） | tests/e2e/features/settings/skills/refresh-empty-tabs.e2e.ts | 104 | `test('TC-S-07: should show empty state when no skills exist')` | ✅ | 3 |
| TC-S-11 | 批量导入外部技能（部分成功场景） | tests/e2e/features/settings/skills/batch-import.e2e.ts | 36 | `test('TC-S-11: should batch import external skills and skip already existing ones')` | ✅ | 5 |
| TC-S-12 | 搜索外部技能（匹配场景） | tests/e2e/features/settings/skills/search.e2e.ts | 152 | `test('TC-S-12: should filter external skills list by search keyword')` | ✅ | 3 |
| TC-S-13 | 搜索外部技能（无匹配场景） | tests/e2e/features/settings/skills/search.e2e.ts | 206 | `test('TC-S-13: should show empty state when external search has no match')` | ✅ | 3 |
| TC-S-14 | 刷新外部技能列表 | tests/e2e/features/settings/skills/path-export.e2e.ts | 45 | `test('TC-S-14: should refresh external skills and show newly added skill')` | ✅ | 4 |
| TC-S-17 | 添加自定义路径（路径重复场景） | tests/e2e/features/settings/skills/path-export.e2e.ts | 109 | `test('TC-S-17: should show error when adding duplicate custom path')` | ✅ | 5 |
| TC-S-18 | 添加自定义路径（必填验证） | tests/e2e/features/settings/skills/path-export.e2e.ts | 169 | `test('TC-S-18: should disable Confirm button when required fields are empty')` | ✅ | 7 |
| TC-S-20 | 导出技能（目标已存在场景） | tests/e2e/features/settings/skills/path-export.e2e.ts | 228 | `test('TC-S-20: should show error when exporting to target with existing skill')` | ✅ | 5 |
| TC-S-22 | URL 参数高亮技能（成功场景） | tests/e2e/features/settings/skills/url-highlight.e2e.ts | 30 | `test('TC-S-22: should highlight skill and scroll to it when URL has highlight param')` | ✅ | 6 |
| TC-S-27 | 渲染扩展技能板块 | tests/e2e/features/settings/skills/boards-rendering.e2e.ts | 26 | `test('TC-S-27: should render Extension Skills board with correct structure')` | ✅ | 4 |
| TC-S-28 | 渲染自动注入技能板块 | tests/e2e/features/settings/skills/boards-rendering.e2e.ts | 60 | `test('TC-S-28: should render Auto-injected Skills board with correct structure')` | ✅ | 4 |
| TC-S-29 | 从文件夹导入技能（Mock 场景） | tests/e2e/features/settings/skills/manual-import.e2e.ts | 29 | `test('TC-S-29: should import skill from folder via mocked dialog')` | ✅ | 6 |

**小计**：15 个测试，65 张截图

---

## P2 边界用例（5/5 实现）

| 用例 ID | 用例标题 | 实现文件 | 行号 | 测试函数名 | 通过 | 截图数 |
|---------|---------|----------|------|-----------|------|--------|
| TC-S-15 | 空外部源状态（无外部技能） | tests/e2e/features/settings/skills/edge-cases.e2e.ts | 56 | `test('TC-S-15: should not show custom external source tabs when no custom paths exist')` | ✅ | 4 |
| TC-S-21 | 导出技能（无外部源场景） | tests/e2e/features/settings/skills/edge-cases.e2e.ts | 100 | `test('TC-S-21: should show export button but only builtin targets when no custom sources exist')` | ✅ | 4 |
| TC-S-23 | URL 参数高亮技能（技能不存在场景） | tests/e2e/features/settings/skills/edge-cases.e2e.ts | 151 | `test('TC-S-23: should not crash when URL highlight param references non-existent skill')` | ✅ | 4 |
| TC-S-24 | 技能名称包含特殊字符（导入场景） | tests/e2e/features/settings/skills/special-cases.e2e.ts | 34 | `test('TC-S-24: should handle skills with special characters in names')` | ✅ | 4 |
| TC-S-26 | 并发操作（连续快速刷新） | tests/e2e/features/settings/skills/special-cases.e2e.ts | 150 | `test('TC-S-26: should handle rapid refresh clicks without crashing')` | ✅ | 6 |

**小计**：5 个测试，22 张截图

---

## P3 性能测试（1/1 实现）

| 用例 ID | 用例标题 | 实现文件 | 行号 | 测试函数名 | 通过 | 截图数 |
|---------|---------|----------|------|-----------|------|--------|
| TC-S-25 | 大规模技能列表渲染（性能场景） | tests/e2e/features/settings/skills/special-cases.e2e.ts | 88 | `test('TC-S-25: should handle rendering 20 skills without performance issues')` | ✅ | 3 |

**小计**：1 个测试，3 张截图

---

## 截图数统计分析

### 按优先级分组

| 优先级 | 测试数 | 总截图数 | 平均截图数 |
|--------|--------|---------|-----------|
| P0 | 8 | 36 | 4.5 |
| P1 | 15 | 65 | 4.3 |
| P2 | 5 | 22 | 4.4 |
| P3 | 1 | 3 | 3.0 |
| **总计** | **29** | **126** | **4.3** |

### 按文件分组

| 文件名 | 测试数 | 总截图数 |
|--------|--------|---------|
| core-ui.e2e.ts | 7 | 32 |
| path-export.e2e.ts | 4 | 21 |
| special-cases.e2e.ts | 3 | 13 |
| edge-cases.e2e.ts | 3 | 12 |
| search.e2e.ts | 4 | 12 |
| refresh-empty-tabs.e2e.ts | 3 | 11 |
| boards-rendering.e2e.ts | 2 | 8 |
| url-highlight.e2e.ts | 1 | 6 |
| manual-import.e2e.ts | 1 | 6 |
| batch-import.e2e.ts | 1 | 5 |
| **总计** | **29** | **126** |

---

## 实现文件说明

### 核心 UI 测试 (core-ui.e2e.ts, 32 screenshots)
包含 P0 主干功能的 7 个测试用例，覆盖：
- 我的技能列表渲染（TC-S-01）
- 自定义技能删除（TC-S-05）
- Builtin 技能删除按钮验证（TC-S-06）
- 外部技能列表渲染（TC-S-08）
- 单项导入外部技能（TC-S-10）
- 添加自定义外部路径（TC-S-16）
- 导出技能到外部源（TC-S-19）

### 搜索功能测试 (search.e2e.ts, 12 screenshots)
包含 4 个搜索相关测试用例，覆盖：
- 我的技能搜索（匹配 + 无匹配）（TC-S-02, TC-S-03）
- 外部技能搜索（匹配 + 无匹配）（TC-S-12, TC-S-13）

### 路径与导出测试 (path-export.e2e.ts, 21 screenshots)
包含 4 个路径管理和导出相关测试用例，覆盖：
- 刷新外部技能列表（TC-S-14）
- 添加自定义路径（重复场景 + 必填验证）（TC-S-17, TC-S-18）
- 导出技能（目标已存在场景）（TC-S-20）

### 刷新与空态测试 (refresh-empty-tabs.e2e.ts, 11 screenshots)
包含 3 个刷新和空态相关测试用例，覆盖：
- 刷新我的技能列表（TC-S-04）
- 空状态展示（TC-S-07）
- Tab 切换外部源（TC-S-09）

### 特殊场景测试 (special-cases.e2e.ts, 13 screenshots)
包含 3 个特殊场景测试用例，覆盖：
- 特殊字符技能名称（TC-S-24）
- 大规模技能列表渲染（TC-S-25）
- 并发快速刷新（TC-S-26）

### 边界用例测试 (edge-cases.e2e.ts, 12 screenshots)
包含 3 个边界场景测试用例，覆盖：
- 空外部源状态（TC-S-15）
- 无外部源时导出（TC-S-21）
- URL 高亮不存在的技能（TC-S-23）

### 板块渲染测试 (boards-rendering.e2e.ts, 8 screenshots)
包含 2 个板块渲染测试用例，覆盖：
- 扩展技能板块（TC-S-27, 4 张截图）
- 自动注入技能板块（TC-S-28, 4 张截图）

### 批量导入测试 (batch-import.e2e.ts, 5 screenshots)
包含 1 个批量导入测试用例，覆盖：
- 批量导入外部技能（部分成功）（TC-S-11）

### URL 高亮测试 (url-highlight.e2e.ts, 6 screenshots)
包含 1 个 URL 高亮测试用例，覆盖：
- URL 参数高亮技能（成功场景）（TC-S-22）

### 手动导入测试 (manual-import.e2e.ts, 6 screenshots)
包含 1 个手动导入测试用例，覆盖：
- 从文件夹导入技能（Mock 场景）（TC-S-29）

---

## 测试质量指标

### 截图覆盖率
- **所有测试均含截图**：29/29 (100%)
- **符合"至少 3 张"规则**：29/29 (100%)

### 测试用例完整性
- **P0 核心功能覆盖**：8/8 (100%)
- **P1 功能验证覆盖**：15/15 (100%)
- **P2 边界用例覆盖**：5/5 (100%)
- **P3 性能测试覆盖**：1/1 (100%)

### 实现分布均衡性
- **最大文件（core-ui.e2e.ts）**：7 个测试，24.1%
- **最小文件（manual-import.e2e.ts 等）**：1 个测试，3.4%
- **平均每文件测试数**：2.9 个测试

---

## 维护说明

### 更新触发条件
1. 新增测试用例到 `test-cases.zh.md`
2. 修改测试用例 ID 或标题
3. 调整测试用例优先级
4. 重构测试文件结构（拆分/合并文件）

### 更新流程
1. 运行命令 `grep -c "^\s*await takeScreenshot" <file>` 重新统计截图数
2. 更新统计概览中的数字
3. 更新对应的映射表行
4. 验证分组小计 = 总数
5. 提交变更并注明修改原因

---

**最后更新**：2026-04-21  
**维护者**：skills-designer-2
