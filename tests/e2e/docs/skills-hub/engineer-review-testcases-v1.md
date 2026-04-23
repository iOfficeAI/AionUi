# Engineer Review: test-cases.zh.md v1.0

**Review 时间**：2026-04-21  
**Reviewer**：skills-engineer-2  
**文档版本**：test-cases.zh.md v1.0（26 个用例）

## 1. Review 范围

从 E2E 可执行性、前置条件可构造性、可观测点充分性角度 review Designer 起草的测试用例。

**Review 维度**：

1. 前置条件是否可通过 test-strategy 中的方法构造
2. 测试步骤中的 testid 是否在 test-strategy 清单中
3. 预期结果是否有明确可观测点（UI 或 Bridge）
4. 是否需要补充新 testid

---

## 2. 关键问题汇总

### 2.1 testid 命名不一致（P0 阻塞项）

用例中使用的 testid 与 test-strategy § 5.2 不一致，需统一：

| 用例中使用                       | test-strategy § 5.2       | 影响用例        |
| -------------------------------- | ------------------------- | --------------- |
| `my-skills-search-input`         | `input-search-my-skills`  | TC-S-02, 03     |
| `my-skills-refresh-button`       | `btn-refresh-my-skills`   | TC-S-04         |
| `delete-skill-button-${name}`    | `btn-delete-${name}`      | TC-S-05         |
| `import-skill-button-${name}`    | `btn-import-${name}`      | TC-S-10         |
| `import-all-skills-button`       | `btn-import-all`          | TC-S-11         |
| `export-skill-button-${name}`    | `btn-export-${name}`      | TC-S-19, 20     |
| `external-skills-search-input`   | `input-search-external`   | TC-S-12, 13     |
| `external-skills-refresh-button` | `btn-refresh-external`    | TC-S-14         |
| `add-custom-path-button`         | `btn-add-custom-source`   | TC-S-16, 17, 18 |
| `custom-path-name-input`         | `input-custom-path-name`  | TC-S-16, 17, 18 |
| `custom-path-value-input`        | `input-custom-path-value` | TC-S-16, 17, 18 |

**影响范围**：14 个用例

**建议**：Designer 修订 test-cases.zh.md，统一使用 test-strategy 中的 testid 命名（test-strategy 命名更规范，遵循 `btn-*` / `input-*` / `modal-*` 前缀约定）

---

### 2.2 Bridge key 确认（P1）

TC-S-16 用例中提到 `getCustomExternalPaths`，但 test-strategy § 4.2 未列出此 bridge key。

**需确认**：

1. 检查 `src/common/adapter/ipcBridge.ts` 是否存在 `fs.getCustomExternalPaths`
2. 如存在，补充到 test-strategy § 4.2 表格
3. 如不存在，用例改为仅用 `detectAndCountExternalSkills` 断言

---

### 2.3 Modal 确认按钮 testid 缺失（P1）

TC-S-05 删除确认 Modal 的"确认"按钮 testid 未在用例中明确指定。

**建议**：

- 用例中补充：点击"确认"按钮（`btn-confirm-delete`）
- test-strategy § 5.2 P1 已列出此 testid

---

## 3. 逐用例 Review

### ✅ TC-S-01：渲染我的技能列表

- 前置条件：✅ 可构造
- testid：✅ 完整
- 可观测点：✅ 明确

### ⚠️ TC-S-02/03：搜索技能

- 前置条件：✅ 可构造
- testid：⚠️ `my-skills-search-input` 需改为 `input-search-my-skills`
- 可观测点：✅ 明确

### ⚠️ TC-S-04：刷新技能列表

- 前置条件：✅ 可构造
- testid：⚠️ `my-skills-refresh-button` 需改为 `btn-refresh-my-skills`
- 可观测点：✅ 明确

### ⚠️ TC-S-05：删除自定义技能

- 前置条件：✅ 可构造
- testid：⚠️ 2 处不一致
  1. `delete-skill-button-${name}` → `btn-delete-${name}`
  2. Modal 确认按钮需明确为 `btn-confirm-delete`
- 可观测点：✅ 明确

### ✅ TC-S-06/07：删除 builtin / 空状态

- 前置条件：✅ 可构造
- testid：✅ 无新增 testid
- 可观测点：✅ 明确

### ⚠️ TC-S-08/09：渲染外部技能 / Tab 切换

- 前置条件：✅ 可构造（TC-S-08 已给出完整代码）
- testid：⚠️ `external-source-tab-${source}` 需规范化为 `external-source-tab-${normalizeTestId(source.name)}`
- 可观测点：✅ 明确

### ⚠️ TC-S-10：单项导入外部技能

- 前置条件：✅ 可构造
- testid：⚠️ `import-skill-button-${name}` → `btn-import-${name}`
- 可观测点：✅ 明确

### ⚠️ TC-S-11：批量导入

- 前置条件：✅ 可构造
- testid：⚠️ `import-all-skills-button` → `btn-import-all`
- 可观测点：✅ 明确

### ⚠️ TC-S-12/13：搜索外部技能

- 前置条件：✅ 可构造
- testid：⚠️ `external-skills-search-input` → `input-search-external`
- 可观测点：✅ 明确

### ⚠️ TC-S-14：刷新外部技能

- 前置条件：✅ 可构造
- testid：⚠️ `external-skills-refresh-button` → `btn-refresh-external`
- 可观测点：✅ 明确

### ✅ TC-S-15：空外部源状态

- 前置条件：✅ 可构造
- testid：✅ 无新增 testid
- 可观测点：✅ 明确

### ⚠️ TC-S-16/17/18：添加自定义路径

- 前置条件：✅ 可构造
- testid：⚠️ 3 处不一致
  1. `add-custom-path-button` → `btn-add-custom-source`
  2. `custom-path-name-input` → `input-custom-path-name`
  3. `custom-path-value-input` → `input-custom-path-value`
- Bridge key：⚠️ `getCustomExternalPaths` 需确认是否存在
- 可观测点：✅ 明确

### ⚠️ TC-S-19/20：导出技能

- 前置条件：✅ 可构造
- testid：⚠️ `export-skill-button-${name}` → `btn-export-${name}`
- 可观测点：✅ 明确

### ✅ TC-S-21：导出（无外部源）

- 前置条件：✅ 可构造
- testid：✅ 无新增 testid
- 可观测点：✅ 明确

### ✅ TC-S-22/23：URL 高亮

- 前置条件：✅ 可构造
- testid：✅ 使用已有卡片 testid
- 可观测点：✅ 明确

### ✅ TC-S-24：特殊字符

- 前置条件：✅ 可构造
- testid：✅ 无新增 testid
- 可观测点：✅ 明确

### ⚠️ TC-S-25：性能场景

- 前置条件：✅ 可构造
- testid：✅ 无新增 testid
- 可观测点：⚠️ 性能断言需补充实现细节
  - 建议补充示例代码：
    ```typescript
    const startTime = await page.evaluate(() => performance.now());
    // 渲染操作...
    const endTime = await page.evaluate(() => performance.now());
    expect(endTime - startTime).toBeLessThan(1000);
    ```

### ✅ TC-S-26：并发操作

- 前置条件：✅ 可构造
- testid：✅ 无新增 testid
- 可观测点：✅ 明确

---

## 4. 总体评价

### 优点

✅ **前置条件可构造性**：优秀

- 所有 26 个用例的前置条件均可通过 test-strategy 中的方法构造
- TC-S-08, TC-S-16 等用例已给出完整构造代码

✅ **可观测点充分性**：优秀

- 所有用例均有明确的 UI 或 Bridge 断言点
- 混合断言场景覆盖完整

✅ **文档质量**：优秀

- 用例结构清晰（前置条件/测试步骤/预期结果/断言类型）
- 已知问题和限制标注准确
- 优先级定义明确

### 需改进

⚠️ **testid 命名不一致**：14 个用例受影响

- 用例中使用的 testid 与 test-strategy 不一致
- 需 Designer 统一命名

⚠️ **Bridge key 需确认**：1 个用例

- TC-S-16 的 `getCustomExternalPaths` 需确认是否存在

⚠️ **性能断言细节**：1 个用例

- TC-S-25 需补充性能测量实现代码

---

## 5. Action Items

### 优先级 1（阻塞门 3）

1. **Designer 修订 test-cases.zh.md**：
   - 统一 testid 命名（14 个用例，见 § 2.1 表格）
   - TC-S-05 补充 Modal 确认按钮 testid
   - 修订版本升级为 v1.1

2. **Engineer 确认 Bridge key**：
   - 检查 `fs.getCustomExternalPaths` 是否存在
   - 如存在，补充到 test-strategy § 4.2
   - 如不存在，通知 Designer 修改 TC-S-16

### 优先级 2（可选优化）

3. **Designer 可选**：补充 TC-S-25 性能断言实现细节
4. **Engineer 可选**：补充 `my-skills-empty-state` 等 P2 testid 到 test-strategy

---

## 6. Review 结论

**结论**：⚠️ **有条件通过，需修订 testid 命名后再次确认**

**修订后可进入门 3**：

- Designer 统一 testid 命名后，通知 Engineer 二次确认
- Engineer 确认 Bridge key 后，更新 test-strategy
- 三方一致后通知 team-lead，门 2 完成，进入门 3

---

**Review 状态**：✅ 完成  
**核心问题**：testid 命名不一致（14 个用例），需 Designer 修订
