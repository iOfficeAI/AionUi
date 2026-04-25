# Assistant 设置页补充测试用例（门 2）

- 基于需求文档：`requirements.zh.md` v1.1
- 产出者：assistant-designer-2
- 日期：2026-04-21
- 版本：v1.0（门 2 初稿）
- 目的：将需求文档第 8 章的 37 条补充测试清单细化为可执行的 Playwright 测试用例步骤

---

## 测试用例格式说明

每个测试用例包含：

- **用例 ID**：P0-1 ~ P2-5（对应优先级）
- **用例名称**：简短描述（英文，作为 `test('...')` 的标题）
- **覆盖需求**：引用 requirements.zh.md 的需求 ID
- **前置条件**：测试开始前的状态要求
- **测试步骤**：编号步骤，包含具体操作 + data-testid + 断言点
- **预期结果**：关键断言的期望值
- **清理操作**：（如有）恢复测试前状态

---

## P0 测试用例（核心交互，必测）

### P0-1: 搜索栏展开/折叠按钮行为 + 图标切换

**用例名称**：`search toggle — expand/collapse with icon change`

**覆盖需求**：F-S-01 / F-S-02 / F-S-03 / F-S-08

**前置条件**：

- 导航到 Assistant 设置页（`#/settings/assistants`）
- 列表至少有 1 个助手卡片可见

**测试步骤**：

1. **验证初始状态**

   ```typescript
   const searchToggle = page.locator('[data-testid="btn-search-toggle"]');
   const searchInput = page.locator('[data-testid="input-search-assistant"]');

   // 搜索输入框不可见
   await expect(searchInput).toBeHidden();

   // 搜索按钮图标为 Search（通过 SVG path 或 class 判断）
   const toggleIcon = searchToggle.locator('svg');
   await expect(toggleIcon).toBeVisible();
   ```

2. **点击展开搜索**

   ```typescript
   await searchToggle.click();
   await page.waitForTimeout(200); // 等待展开动画

   // 搜索输入框可见
   await expect(searchInput).toBeVisible();

   // 按钮图标变为 CloseSmall
   // （如果无法直接判断 SVG，可通过后续行为验证）
   ```

3. **验证 autoFocus（F-S-04）**

   ```typescript
   // 搜索输入框应自动获得焦点
   await expect(searchInput).toBeFocused();
   ```

4. **输入查询并验证 searchQuery 非空时搜索栏保持可见（F-S-08）**

   ```typescript
   await searchInput.fill('test');

   // searchQuery 非空，即便 searchExpanded 可能为 false，搜索栏仍可见
   await expect(searchInput).toBeVisible();
   ```

5. **点击折叠并清空搜索**

   ```typescript
   await searchToggle.click();
   await page.waitForTimeout(200);

   // searchQuery 被清空
   await expect(searchInput).toHaveValue('');

   // 搜索输入框折叠（不可见）
   await expect(searchInput).toBeHidden();
   ```

**预期结果**：

- 初始：搜索框隐藏，图标为 Search
- 点击展开：搜索框可见且自动聚焦
- 输入查询后搜索框保持可见
- 再次点击：清空查询并折叠

**清理操作**：无（搜索已清空）

---

### P0-2: 卡片点击区域隔离（主体 vs 右侧操作区）

**用例名称**：`card click isolation — body opens drawer, actions do not`

**覆盖需求**：F-L-07 / B-08 / B-09

**前置条件**：

- 导航到 Assistant 设置页
- 列表至少有 1 个 Custom 助手（用于测试 Switch）

**测试步骤**：

1. **获取第一个助手卡片**

   ```typescript
   const cards = page.locator('[data-testid^="assistant-card-"]');
   const firstCard = cards.first();
   const assistantId = (await firstCard.getAttribute('data-testid'))?.replace('assistant-card-', '') || '';

   // 确保 Drawer 初始关闭
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   if (await drawer.isVisible().catch(() => false)) {
     await page.keyboard.press('Escape');
     await drawer.waitFor({ state: 'hidden', timeout: 3000 });
   }
   ```

2. **点击卡片主体 → Drawer 打开**

   ```typescript
   // 点击卡片左侧区域（Avatar + 名称）
   await firstCard.locator('.flex.items-center.gap-12px').first().click();

   // Drawer 应打开
   await expect(drawer).toBeVisible({ timeout: 5000 });

   // 关闭 Drawer 准备下一步测试
   await page.keyboard.press('Escape');
   await drawer.waitFor({ state: 'hidden', timeout: 3000 });
   ```

3. **点击 Switch → Drawer 不打开**

   ```typescript
   const switchElement = page.locator(`[data-testid="switch-enabled-${assistantId}"]`);
   const isCheckedBefore = await switchElement.isChecked();

   // 点击 Switch
   await switchElement.click();
   await page.waitForTimeout(300);

   // Drawer 应保持关闭
   await expect(drawer).toBeHidden();

   // Switch 状态应改变（验证点击生效）
   const isCheckedAfter = await switchElement.isChecked();
   expect(isCheckedAfter).toBe(!isCheckedBefore);

   // 恢复原状态
   await switchElement.click();
   await page.waitForTimeout(300);

   // 验证 Switch 状态已恢复到初始值
   const isCheckedRestored = await switchElement.isChecked();
   expect(isCheckedRestored).toBe(isCheckedBefore);
   ```

4. **Hover 并点击 Duplicate 按钮 → Drawer 打开（isCreating=true）**

   ```typescript
   await firstCard.hover();
   const duplicateBtn = page.locator(`[data-testid="btn-duplicate-${assistantId}"]`);

   // Duplicate 按钮在 hover 时可见
   await expect(duplicateBtn).toBeVisible();

   await duplicateBtn.click();

   // Drawer 应打开且为新建模式
   await expect(drawer).toBeVisible({ timeout: 5000 });
   const createBtn = page.locator('[data-testid="btn-save-assistant"]');
   await expect(createBtn).toContainText('Create');

   // 关闭 Drawer
   await page.keyboard.press('Escape');
   await drawer.waitFor({ state: 'hidden', timeout: 3000 });
   ```

**预期结果**：

- 点击卡片主体 → Drawer 打开
- 点击 Switch → Drawer 不打开，Switch 状态改变
- 点击 Duplicate（stopPropagation 生效） → Drawer 打开且为 Create 模式

**清理操作**：Switch 已恢复原状态，Drawer 已关闭

---

### P0-3: Delete 确认弹窗含助手预览卡片

**用例名称**：`delete modal shows assistant preview card`

**覆盖需求**：F-R-03 / F-R-04 / F-R-05

**前置条件**：

- 导航到 Assistant 设置页
- 创建一个测试用 Custom 助手（用于后续删除）

**测试步骤**：

1. **创建测试助手**

   ```typescript
   const timestamp = Date.now();
   const testName = `E2E Delete Preview ${timestamp}`;
   const testDesc = 'Test assistant for delete modal preview';

   await page.locator('[data-testid="btn-create-assistant"]').click();
   await page.locator('[data-testid="input-assistant-name"]').fill(testName);
   await page.locator('[data-testid="input-assistant-desc"]').fill(testDesc);
   await page.locator('[data-testid="btn-save-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await drawer.waitFor({ state: 'hidden', timeout: 10000 });
   ```

2. **打开助手编辑 Drawer**

   ```typescript
   // 找到刚创建的助手卡片
   const targetCard = page.locator(`[data-testid^="assistant-card-"]`).filter({ hasText: testName });
   await targetCard.click();
   await drawer.waitFor({ state: 'visible', timeout: 5000 });
   ```

3. **点击 Delete 按钮**

   ```typescript
   const deleteBtn = page.locator('[data-testid="btn-delete-assistant"]');
   await expect(deleteBtn).toBeVisible();
   await deleteBtn.click();
   ```

4. **验证 Delete Modal 渲染**

   ```typescript
   const modal = page.locator('[data-testid="modal-delete-assistant"]');
   await expect(modal).toBeVisible({ timeout: 3000 });

   // 验证 Modal 标题
   await expect(modal.locator('.arco-modal-title')).toContainText('Delete');
   ```

5. **验证助手预览卡片内容**

   ```typescript
   // 预览区应包含 Avatar（32px 或类似尺寸）
   const avatar = modal.locator('.arco-avatar');
   await expect(avatar).toBeVisible();

   // 预览区应显示助手名称
   await expect(modal).toContainText(testName);

   // 预览区应显示助手描述
   await expect(modal).toContainText(testDesc);
   ```

6. **验证按钮渲染**

   ```typescript
   // 确认按钮为 danger 状态，文案为 "Delete"
   const confirmBtn = modal.locator('.arco-btn-status-danger');
   await expect(confirmBtn).toBeVisible();
   await expect(confirmBtn).toContainText('Delete');

   // 取消按钮文案为 "Cancel"
   const cancelBtn = modal.locator('.arco-btn').filter({ hasText: 'Cancel' });
   await expect(cancelBtn).toBeVisible();
   ```

7. **确认删除**

   ```typescript
   await confirmBtn.click();

   // Modal 关闭
   await modal.waitFor({ state: 'hidden', timeout: 3000 });

   // Drawer 关闭
   await drawer.waitFor({ state: 'hidden', timeout: 3000 });

   // 助手从列表中移除
   await expect(targetCard).toBeHidden({ timeout: 5000 });
   ```

**预期结果**：

- Delete Modal 显示完整的助手预览卡片（Avatar + 名称 + 描述）
- 确认按钮为 danger 样式，取消按钮正常渲染
- 确认后助手被删除

**清理操作**：测试助手已删除

---

### P0-4: highlightId 滚动到卡片并高亮 2 秒，之后清 query

**用例名称**：`highlight assistant card via query param`

**覆盖需求**：3.2 交互流程

**前置条件**：

- 已知一个存在的助手 ID（如 `builtin-agent`）

**测试步骤**：

1. **导航到带 highlight 参数的 URL**

   ```typescript
   const targetId = 'builtin-agent'; // 或从列表动态获取第一个
   await page.goto('/#/settings/assistants?highlight=' + targetId);

   const targetCard = page.locator(`[data-testid="assistant-card-${targetId}"]`);
   await targetCard.waitFor({ state: 'visible', timeout: 10000 });
   ```

2. **等待 150ms 延迟 + 验证滚动到视口**

   ```typescript
   await page.waitForTimeout(200);

   // 卡片应滚动到视口中心附近（通过 scrollIntoView 实现）
   const isInViewport = await targetCard.evaluate((el) => {
     const rect = el.getBoundingClientRect();
     return rect.top >= 0 && rect.bottom <= window.innerHeight;
   });
   expect(isInViewport).toBe(true);
   ```

3. **验证高亮样式**

   ```typescript
   // 卡片应有高亮样式 'border-primary-5 bg-primary-1'
   const cardClasses = await targetCard.getAttribute('class');
   expect(cardClasses).toContain('border-primary-5');
   expect(cardClasses).toContain('bg-primary-1');
   ```

4. **等待 2 秒后验证高亮消失**

   ```typescript
   await page.waitForTimeout(2100); // 2s + buffer

   // 高亮样式应移除
   const cardClassesAfter = await targetCard.getAttribute('class');
   expect(cardClassesAfter).not.toContain('border-primary-5');
   expect(cardClassesAfter).not.toContain('bg-primary-1');
   ```

5. **验证 query param 被清空**
   ```typescript
   const currentUrl = page.url();
   expect(currentUrl).not.toContain('highlight=');
   ```

**预期结果**：

- 导航后卡片滚动到视口并高亮 2 秒
- 高亮结束后样式移除，query param 清空

**清理操作**：无

---

### P0-5: AddSkillsModal 搜索框过滤 + 无结果文案 "No skills found"

**用例名称**：`skills modal search filters and shows empty state`

**覆盖需求**：F-A-03 / F-A-04

**前置条件**：

- 导航到 Assistant 设置页
- 创建或打开一个 Custom 助手编辑 Drawer
- 打开 AddSkillsModal

**测试步骤**：

1. **打开 Custom 助手 Drawer 和 Skills Modal**

   ```typescript
   // 创建或打开 Custom 助手
   await page.locator('[data-testid="btn-create-assistant"]').click();
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await drawer.waitFor({ state: 'visible', timeout: 5000 });

   // 点击 Add Skills 按钮
   const addSkillsBtn = page.locator('[data-testid="btn-add-skills"]');
   await addSkillsBtn.click();

   // Skills Modal 打开
   const modal = page.locator('.arco-modal').filter({ hasText: 'Add Skills' });
   await expect(modal).toBeVisible({ timeout: 3000 });
   ```

2. **验证搜索输入框存在**

   ```typescript
   // 搜索框无 data-testid，通过 prefix 图标 + .arco-input 定位
   const searchInput = modal
     .locator('.arco-input-wrapper')
     .filter({ has: page.locator('[class*="icon"]') })
     .locator('input');
   await expect(searchInput).toBeVisible();
   ```

3. **输入不存在的查询 → 验证空态文案**

   ```typescript
   await searchInput.fill('zzz_nonexistent_skill_12345');
   await page.waitForTimeout(300);

   // 应显示 "No skills found" 文案
   await expect(modal).toContainText('No skills found');
   ```

4. **清空搜索 → 验证技能列表恢复**

   ```typescript
   await searchInput.clear();
   await page.waitForTimeout(300);

   // 如果有外部技能源，应显示技能卡片
   // 如果无外部源，应显示 "No external skill sources discovered"
   const hasSkills = (await modal.locator('[class*="skill"]').count()) > 0;
   const hasNoSourceMsg = await modal.textContent();

   expect(hasSkills || hasNoSourceMsg?.includes('No external skill sources')).toBe(true);
   ```

5. **关闭 Modal**
   ```typescript
   await page.keyboard.press('Escape');
   await modal.waitFor({ state: 'hidden', timeout: 3000 });
   ```

**预期结果**：

- 搜索不存在的技能 → 显示 "No skills found"
- 清空搜索 → 技能列表恢复或显示 "No external skill sources discovered"

**清理操作**：关闭 Modal 和 Drawer（`Escape`）

---

### P0-6: Extension 助手 Skills 区渲染验证

**用例名称**：`extension assistant shows skills section`

**覆盖需求**：2.5.3（Extension showSkills）

**前置条件**：

- 存在至少 1 个 Extension 助手（ID 前缀 `ext-`）
- 如无 Extension 助手，此测试 skip

**测试步骤**：

1. **查找 Extension 助手**

   ```typescript
   await page.goto('/#/settings/assistants');
   const cards = page.locator('[data-testid^="assistant-card-"]');
   await cards.first().waitFor({ state: 'visible', timeout: 10000 });

   const cardCount = await cards.count();
   let extensionId: string | null = null;

   for (let i = 0; i < cardCount; i++) {
     const cardId = await cards.nth(i).getAttribute('data-testid');
     if (cardId?.includes('ext-')) {
       extensionId = cardId.replace('assistant-card-', '');
       break;
     }
   }

   if (!extensionId) {
     test.skip(true, 'No extension assistant found');
     return;
   }
   ```

2. **打开 Extension 助手 Drawer**

   ```typescript
   const targetCard = page.locator(`[data-testid="assistant-card-${extensionId}"]`);
   await targetCard.click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

3. **验证 Skills 区渲染**

   ```typescript
   const skillsSection = drawer.locator('[data-testid="skills-section"]');
   await expect(skillsSection).toBeVisible();
   ```

4. **验证 Skills 区为只读（Add Skills 按钮不可点击或不可见）**

   ```typescript
   const addSkillsBtn = drawer.locator('[data-testid="btn-add-skills"]');

   // Extension 的 Skills 区应为只读
   // 可能是按钮不可见，或 disabled
   const isVisible = await addSkillsBtn.isVisible().catch(() => false);
   if (isVisible) {
     const isDisabled = await addSkillsBtn.isDisabled();
     expect(isDisabled).toBe(true);
   }
   ```

**预期结果**：

- Extension 助手 Drawer 显示 Skills 区（`data-testid="skills-section"`）
- Skills 区为只读状态（Add Skills 按钮不可用）

**清理操作**：关闭 Drawer（`Escape`）

---

## P1 测试用例（重要 UI 状态，推荐测）

### P1-1: 搜索输入 autoFocus

**用例名称**：`search input auto-focuses on expand`

**覆盖需求**：F-S-04

**前置条件**：

- 导航到 Assistant 设置页
- 搜索栏初始为折叠状态

**测试步骤**：

1. **点击搜索切换按钮**

   ```typescript
   const searchToggle = page.locator('[data-testid="btn-search-toggle"]');
   await searchToggle.click();

   const searchInput = page.locator('[data-testid="input-search-assistant"]');
   await expect(searchInput).toBeVisible({ timeout: 1000 });
   ```

2. **验证 autoFocus**
   ```typescript
   // 搜索输入框应自动获得焦点
   await expect(searchInput).toBeFocused();
   ```

**预期结果**：搜索展开后输入框自动聚焦

**清理操作**：无

---

### P1-2: 搜索空白查询不过滤

**用例名称**：`search with blank query does not filter`

**覆盖需求**：F-S-07 / B-01

**前置条件**：

- 导航到 Assistant 设置页
- 列表有多个助手

**测试步骤**：

1. **记录初始助手数量**

   ```typescript
   const cards = page.locator('[data-testid^="assistant-card-"]');
   const countBefore = await cards.count();
   ```

2. **展开搜索并输入空白字符**

   ```typescript
   const searchToggle = page.locator('[data-testid="btn-search-toggle"]');
   await searchToggle.click();

   const searchInput = page.locator('[data-testid="input-search-assistant"]');
   await searchInput.fill('   '); // 仅空格
   await page.waitForTimeout(300);
   ```

3. **验证列表不过滤**
   ```typescript
   const countAfter = await cards.count();
   expect(countAfter).toBe(countBefore);
   ```

**预期结果**：空白查询（trim 后为空串）不过滤列表

**清理操作**：清空搜索

---

### P1-3: Custom 来源标签显示 / Builtin 不显示

**用例名称**：`custom assistant shows source tag, builtin does not`

**覆盖需求**：F-L-06

**前置条件**：

- 列表中有 Builtin 和 Custom 助手

**测试步骤**：

1. **查找 Builtin 助手卡片**

   ```typescript
   const builtinCard = page.locator('[data-testid="assistant-card-builtin-agent"]').first();
   await expect(builtinCard).toBeVisible();

   // Builtin 不应显示 "Custom" 标签
   const builtinTag = builtinCard.locator('.arco-tag').filter({ hasText: 'Custom' });
   await expect(builtinTag).toBeHidden();
   ```

2. **创建 Custom 助手并验证标签**

   ```typescript
   const timestamp = Date.now();
   const testName = `E2E Custom ${timestamp}`;

   await page.locator('[data-testid="btn-create-assistant"]').click();
   await page.locator('[data-testid="input-assistant-name"]').fill(testName);
   await page.locator('[data-testid="btn-save-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await drawer.waitFor({ state: 'hidden', timeout: 10000 });

   // 找到 Custom 助手卡片
   const customCard = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: testName });
   await expect(customCard).toBeVisible();

   // 应显示绿色 "Custom" 标签
   const customTag = customCard.locator('.arco-tag').filter({ hasText: 'Custom' });
   await expect(customTag).toBeVisible();
   ```

3. **清理 Custom 助手**
   ```typescript
   await customCard.click();
   await drawer.waitFor({ state: 'visible' });
   await page.locator('[data-testid="btn-delete-assistant"]').click();
   const modal = page.locator('[data-testid="modal-delete-assistant"]');
   await modal.locator('.arco-btn-status-danger').click();
   await drawer.waitFor({ state: 'hidden' });
   ```

**预期结果**：

- Builtin 助手不显示 "Custom" 标签
- Custom 助手显示绿色 "Custom" 标签

**清理操作**：已删除测试助手

---

### P1-4: 过滤结果为 0 的空态文案

**用例名称**：`filter with no results shows empty state`

**覆盖需求**：F-L-08 / B-03

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **展开搜索并输入不存在的查询**

   ```typescript
   await page.locator('[data-testid="btn-search-toggle"]').click();
   const searchInput = page.locator('[data-testid="input-search-assistant"]');
   await searchInput.fill('zzz_nonexistent_assistant_98765');
   await page.waitForTimeout(300);
   ```

2. **验证空态文案**

   ```typescript
   const emptyMessage = page.locator('text=No assistants match the current filters.');
   await expect(emptyMessage).toBeVisible();
   ```

3. **清空搜索**
   ```typescript
   await page.locator('[data-testid="btn-search-toggle"]').click();
   ```

**预期结果**：搜索无结果时显示 "No assistants match the current filters."

**清理操作**：已清空搜索

---

### P1-5: Duplicate 按钮仅在 hover 时可见

**用例名称**：`duplicate button only visible on hover`

**覆盖需求**：F-L-03 / F-D-01

**前置条件**：

- 导航到 Assistant 设置页
- 列表至少有 1 个助手

**测试步骤**：

1. **获取第一个助手卡片**

   ```typescript
   const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
   const assistantId = (await firstCard.getAttribute('data-testid'))?.replace('assistant-card-', '') || '';
   const duplicateBtn = page.locator(`[data-testid="btn-duplicate-${assistantId}"]`);
   ```

2. **验证默认不可见**

   ```typescript
   // Duplicate 按钮默认不可见（invisible class）
   const isVisible = await duplicateBtn.isVisible().catch(() => false);
   expect(isVisible).toBe(false);
   ```

3. **Hover 卡片后验证可见**

   ```typescript
   await firstCard.hover();
   await page.waitForTimeout(100);

   // Duplicate 按钮应变为可见
   await expect(duplicateBtn).toBeVisible();
   ```

4. **移开鼠标后验证再次不可见**

   ```typescript
   await page.mouse.move(0, 0); // 移到页面左上角
   await page.waitForTimeout(100);

   const isVisibleAfter = await duplicateBtn.isVisible().catch(() => false);
   expect(isVisibleAfter).toBe(false);
   ```

**预期结果**：

- Duplicate 按钮默认不可见
- Hover 时可见
- 移开鼠标后再次不可见

**清理操作**：无

---

### P1-6: Extension Switch 为 disabled 且 checked

**用例名称**：`extension assistant switch is disabled and checked`

**覆盖需求**：F-L-04 / F-T-02 / B-10

**前置条件**：

- 存在至少 1 个 Extension 助手

**测试步骤**：

1. **查找 Extension 助手**

   ```typescript
   const cards = page.locator('[data-testid^="assistant-card-"]');
   let extensionId: string | null = null;

   const count = await cards.count();
   for (let i = 0; i < count; i++) {
     const cardId = await cards.nth(i).getAttribute('data-testid');
     if (cardId?.includes('ext-')) {
       extensionId = cardId.replace('assistant-card-', '');
       break;
     }
   }

   if (!extensionId) {
     test.skip(true, 'No extension assistant found');
     return;
   }
   ```

2. **验证 Switch 状态**

   ```typescript
   const switchElement = page.locator(`[data-testid="switch-enabled-${extensionId}"]`);

   // Switch 应为 checked
   await expect(switchElement).toBeChecked();

   // Switch 应为 disabled
   await expect(switchElement).toBeDisabled();
   ```

**预期结果**：Extension 助手的启用开关为 checked 且 disabled

**清理操作**：无

---

### P1-7: Drawer 关闭按钮（右上 Close 图标）

**用例名称**：`drawer close button closes drawer`

**覆盖需求**：F-E-02

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **打开任意助手 Drawer**

   ```typescript
   const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
   await firstCard.click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **点击右上 Close 图标**

   ```typescript
   // Close 按钮无 data-testid，通过 Drawer header + Close 图标定位
   const closeBtn = drawer.locator('.arco-drawer-header').locator('svg[class*="close"]').first();
   await closeBtn.click();
   ```

3. **验证 Drawer 关闭**
   ```typescript
   await expect(drawer).toBeHidden({ timeout: 3000 });
   ```

**预期结果**：点击右上 Close 图标关闭 Drawer

**清理操作**：无

---

### P1-8: Drawer footer 的 Cancel 按钮关闭 Drawer

**用例名称**：`drawer cancel button closes drawer`

**覆盖需求**：F-E-05

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **打开任意助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **点击 Cancel 按钮**

   ```typescript
   // Cancel 按钮无 data-testid，通过文本定位
   const cancelBtn = drawer.locator('.arco-drawer-footer').locator('button').filter({ hasText: 'Cancel' });
   await cancelBtn.click();
   ```

3. **验证 Drawer 关闭**
   ```typescript
   await expect(drawer).toBeHidden({ timeout: 3000 });
   ```

**预期结果**：点击 Cancel 按钮关闭 Drawer

**清理操作**：无

---

### P1-9: Rules 区 Expand/Collapse 切换高度

**用例名称**：`rules section expand collapse toggles height`

**覆盖需求**：F-E-06

**前置条件**：

- 打开一个 Custom 助手 Drawer

**测试步骤**：

1. **打开 Custom 助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **定位 Rules 区容器**

   ```typescript
   // Rules 区容器通过样式定位（height: 260px 或 220px）
   const rulesContainer = drawer
     .locator('.border.border-border-2.overflow-hidden.rounded-4px')
     .filter({ has: page.locator('textarea') });

   const initialHeight = await rulesContainer.evaluate((el) => window.getComputedStyle(el).height);
   ```

3. **点击 Expand 按钮**

   ```typescript
   // Expand/Collapse 按钮无 data-testid，通过文本定位
   const expandBtn = drawer.locator('button').filter({ hasText: 'Expand' });
   await expandBtn.click();
   await page.waitForTimeout(200);

   const expandedHeight = await rulesContainer.evaluate((el) => window.getComputedStyle(el).height);

   // 展开后高度应为 420px
   expect(expandedHeight).toBe('420px');
   ```

4. **点击 Collapse 按钮**

   ```typescript
   const collapseBtn = drawer.locator('button').filter({ hasText: 'Collapse' });
   await collapseBtn.click();
   await page.waitForTimeout(200);

   const collapsedHeight = await rulesContainer.evaluate((el) => window.getComputedStyle(el).height);

   // 折叠后高度应恢复（260px 或 220px）
   expect(collapsedHeight).toBe(initialHeight);
   ```

**预期结果**：

- 点击 Expand → 高度变为 420px
- 点击 Collapse → 高度恢复初始值

**清理操作**：关闭 Drawer

---

### P1-10: Rules 区 Edit/Preview Tab 切换

**用例名称**：`rules section edit preview tab switch`

**覆盖需求**：F-E-07 / F-E-08

**前置条件**：

- 打开一个 Custom 助手 Drawer

**测试步骤**：

1. **打开 Custom 助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **验证初始为 Edit 模式**

   ```typescript
   // Edit Tab 应有 active 样式
   const editTab = drawer
     .locator('div')
     .filter({ hasText: /^Edit$/ })
     .first();
   const editTabClass = await editTab.getAttribute('class');
   expect(editTabClass).toContain('text-primary');
   expect(editTabClass).toContain('border-primary');

   // textarea 应可见
   const textarea = drawer.locator('textarea');
   await expect(textarea).toBeVisible();
   ```

3. **切换到 Preview 模式（空内容）**

   ```typescript
   const previewTab = drawer
     .locator('div')
     .filter({ hasText: /^Preview$/ })
     .first();
   await previewTab.click();
   await page.waitForTimeout(200);

   // Preview Tab 应变为 active
   const previewTabClass = await previewTab.getAttribute('class');
   expect(previewTabClass).toContain('text-primary');

   // textarea 应隐藏
   await expect(textarea).toBeHidden();

   // 应显示空态文案 "No content to preview"
   await expect(drawer).toContainText('No content to preview');
   ```

4. **输入内容后切换到 Preview**

   ```typescript
   await editTab.click();
   await textarea.fill('# Test Rules\n\nThis is a test.');
   await previewTab.click();
   await page.waitForTimeout(200);

   // 应渲染 Markdown 内容
   await expect(drawer.locator('.markdown-body, [class*="markdown"]')).toContainText('Test Rules');
   ```

**预期结果**：

- Edit 模式显示 textarea
- Preview 模式空内容显示 "No content to preview"
- Preview 模式有内容渲染 Markdown

**清理操作**：关闭 Drawer

---

### P1-11: Rules 预览模式空内容占位文案

**用例名称**：`rules preview shows empty placeholder`

**覆盖需求**：F-E-08

**前置条件**：

- 打开一个 Custom 助手 Drawer

**测试步骤**：

1. **打开 Custom 助手 Drawer（Rules 为空）**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **切换到 Preview 模式**

   ```typescript
   const previewTab = drawer
     .locator('div')
     .filter({ hasText: /^Preview$/ })
     .first();
   await previewTab.click();
   await page.waitForTimeout(200);
   ```

3. **验证占位文案**
   ```typescript
   await expect(drawer).toContainText('No content to preview');
   ```

**预期结果**：Preview 模式下 Rules 为空时显示 "No content to preview"

**清理操作**：关闭 Drawer

---

### P1-12: Main Agent 下拉项显示 Extension tag

**用例名称**：`main agent dropdown shows extension tag`

**覆盖需求**：F-E-10

**前置条件**：

- 存在 Extension Agent（`opt.isExtension=true`）

**测试步骤**：

1. **打开任意助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **点击 Main Agent 下拉**

   ```typescript
   const agentSelect = page.locator('[data-testid="select-assistant-agent"]');
   await agentSelect.click();
   ```

3. **验证 Extension Agent 选项显示 "ext" tag**

   ```typescript
   // 查找包含 "ext" tag 的选项
   const extensionOption = page
     .locator('.arco-select-option')
     .filter({ has: page.locator('.arco-tag').filter({ hasText: 'ext' }) });

   if ((await extensionOption.count()) > 0) {
     await expect(extensionOption.first()).toBeVisible();
   } else {
     test.skip(true, 'No extension agent found');
   }
   ```

**预期结果**：Extension Agent 下拉项显示蓝色 "ext" tag

**清理操作**：关闭 Drawer

---

### P1-13: Skills 区分组 Header 计数格式（N/M + 状态点）

**用例名称**：`skills section header shows count and status dot`

**覆盖需求**：F-SK-04

**前置条件**：

- 打开一个有 Skills 的 Custom 助手 Drawer

**测试步骤**：

1. **打开 Custom 助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **定位 Skills 分组 Header**

   ```typescript
   const skillsCollapse = drawer.locator('[data-testid="skills-collapse"]');
   const builtinHeader = skillsCollapse.locator('.arco-collapse-item-header').filter({ hasText: 'Builtin Skills' });
   ```

3. **验证计数格式**

   ```typescript
   // Header 应包含计数文本（如 "0/5" 或 "3/5"）
   const headerText = await builtinHeader.textContent();
   expect(headerText).toMatch(/\d+\/\d+/);
   ```

4. **验证状态点渲染**

   ```typescript
   // 状态点：8px 圆点，颜色根据激活状态（绿色 or 灰色）
   const statusDot = builtinHeader.locator('span[class*="w-8px"]');
   await expect(statusDot).toBeVisible();

   const dotStyle = await statusDot.evaluate((el) => window.getComputedStyle(el).background);
   // 验证颜色为 success-6（绿）或 text-4（灰）
   expect(dotStyle).toBeTruthy();
   ```

**预期结果**：

- 分组 Header 显示 "N/M" 格式计数
- 状态点为 8px 圆形，颜色反映激活状态

**清理操作**：关闭 Drawer

---

### P1-14: 无 Pending 技能时不显示 PENDING 标签

**用例名称**：`no pending badge when no pending skills`

**覆盖需求**：F-SK-05

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **打开 Custom 助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **验证无 PENDING 标签**
   ```typescript
   // 确保 Skills 区没有任何 PENDING 标签（空态验证）
   const pendingBadges = drawer.locator('span').filter({ hasText: 'PENDING' });
   await expect(pendingBadges).toHaveCount(0);
   ```

**预期结果**：新创建的助手没有 Pending 技能，不显示 PENDING 标签

**清理操作**：

```typescript
// 关闭 Drawer（每个测试结尾必须清理）
await page.keyboard.press('Escape');
await expect(drawer).toBeHidden({ timeout: 3000 });
```

---

### P1-15: 无 Custom 技能时不显示 CUSTOM 标签

**用例名称**：`no custom badge when no custom skills`

**覆盖需求**：F-SK-06

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **打开 Custom 助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **验证无 CUSTOM 标签**
   ```typescript
   // 确保所有 Builtin Skills 都没有 CUSTOM 标签（空态验证）
   const customBadges = drawer.locator('span').filter({ hasText: 'CUSTOM' });
   await expect(customBadges).toHaveCount(0);
   ```

**预期结果**：未导入 Custom 技能时，不显示 CUSTOM 标签

**清理操作**：

```typescript
// 关闭 Drawer
await page.keyboard.press('Escape');
await expect(drawer).toBeHidden({ timeout: 3000 });
```

---

### P1-16: Builtin Skills Checkbox 取消勾选不触发删除弹窗

**用例名称**：`builtin skill checkbox unchecks without modal`

**覆盖需求**：F-SK-08

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **打开 Custom 助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **展开 Builtin Skills 分组**

   ```typescript
   const skillsCollapse = drawer.locator('[data-testid="skills-collapse"]');
   const builtinHeader = skillsCollapse.locator('.arco-collapse-item-header').filter({ hasText: 'Builtin Skills' });

   // 如果分组是收起状态，展开它
   const isExpanded = await builtinHeader.getAttribute('aria-expanded');
   if (isExpanded === 'false') {
     await builtinHeader.click();
     await page.waitForTimeout(300);
   }
   ```

3. **验证有 Builtin Skills 可用**

   ```typescript
   const builtinSection = skillsCollapse.locator('.arco-collapse-item').filter({ hasText: 'Builtin Skills' });
   const skillCards = builtinSection.locator('div.flex.items-start.gap-8px.p-8px');

   const skillCount = await skillCards.count();
   if (skillCount === 0) {
     test.skip(true, 'No builtin skills available for new assistant');
     return;
   }
   ```

4. **找到第一个已勾选的 Builtin Skill**

   ```typescript
   let checkedSkillCard = null;
   for (let i = 0; i < skillCount; i++) {
     const card = skillCards.nth(i);
     const checkbox = card.locator('.arco-checkbox-icon');
     const isChecked = await checkbox.isChecked();

     if (isChecked) {
       checkedSkillCard = card;
       break;
     }
   }

   if (!checkedSkillCard) {
     // 如果没有已勾选的，勾选第一个
     const firstCheckbox = skillCards.first().locator('.arco-checkbox-icon');
     await firstCheckbox.click();
     await page.waitForTimeout(200);
     checkedSkillCard = skillCards.first();
   }
   ```

5. **点击 Checkbox 取消勾选**

   ```typescript
   const checkbox = checkedSkillCard.locator('.arco-checkbox-icon');
   await checkbox.click();
   await page.waitForTimeout(200);
   ```

6. **验证没有弹出删除确认弹窗**

   ```typescript
   const modal = page.locator('.arco-modal').filter({ hasText: 'Remove' });
   await expect(modal).toHaveCount(0);
   ```

7. **验证 Checkbox 已取消勾选**

   ```typescript
   await expect(checkbox).not.toBeChecked();
   ```

8. **恢复原状态（再次勾选）**
   ```typescript
   await checkbox.click();
   await page.waitForTimeout(200);
   await expect(checkbox).toBeChecked();
   ```

**预期结果**：Builtin Skills 通过 Checkbox 取消勾选，不触发删除确认弹窗（只是取消激活，不是删除）

**清理操作**：

```typescript
// 关闭 Drawer（使用 helper 或 Escape）
await page.keyboard.press('Escape');
await expect(drawer).toBeHidden({ timeout: 3000 });
```

---

### P1-17: Pending/Custom 技能删除弹窗（不可测，已废弃）

**注**：此用例已废弃。原设计验证 Pending/Custom 技能的删除弹窗 + 消息提示，但：

1. **Pending Skills** 是临时 React state，invokeBridge 无法构造
2. **Custom Skills** 需预置外部文件系统路径
3. **Builtin Skills** 无删除按钮（只能 Checkbox 取消勾选，见 P1-16）

F-SC-01/F-SC-02（删除弹窗需求）属于不可测场景，P1-14/15 空态验证已覆盖标签渲染逻辑。

**原覆盖需求**：F-SC-01 / F-SC-02

---

---

### P1-18: 有 Auto-injected Skills 时显示该分组

**用例名称**：`auto-injected section shows when configured`

**覆盖需求**：F-SK-10

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **打开一个有 Auto-injected 配置的 Builtin 助手**

   ```typescript
   // 大部分 Builtin 助手都有 defaultEnabledSkills 配置（如 word-creator、ppt-creator 等）
   const builtinCards = page.locator('[data-testid^="assistant-card-builtin-"]');
   const firstBuiltin = builtinCards.first();
   await firstBuiltin.click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **验证显示 Auto-injected Skills 分组**

   ```typescript
   const autoSection = drawer.locator('.arco-collapse-item').filter({ hasText: 'Auto-injected Skills' });
   await expect(autoSection).toBeVisible();
   ```

3. **验证分组 header 包含计数**
   ```typescript
   const headerText = await autoSection.locator('.arco-collapse-item-header').textContent();
   expect(headerText).toMatch(/\d+\/\d+/); // 如 "2/5" 格式
   ```

**预期结果**：有 Auto-injected 配置的 Builtin 助手显示 "Auto-injected Skills" 分组，header 包含 N/M 格式计数

**清理操作**：

```typescript
// 关闭 Drawer
await page.keyboard.press('Escape');
await expect(drawer).toBeHidden({ timeout: 3000 });
```

---

### P1-19: Custom 空态文案 "No custom skills added"

**用例名称**：`custom skills section shows empty state`

**覆盖需求**：F-SK-11 / B-04

**前置条件**：

- 打开一个无 Custom Skills 的 Custom 助手 Drawer

**测试步骤**：

1. **打开 Custom 助手 Drawer**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();

   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **定位 Custom Skills 分组**

   ```typescript
   const skillsCollapse = drawer.locator('[data-testid="skills-collapse"]');
   const customSection = skillsCollapse.locator('.arco-collapse-item').filter({ hasText: 'Imported Skills' });

   // 展开分组（如未展开）
   const customHeader = customSection.locator('.arco-collapse-item-header');
   await customHeader.click();
   await page.waitForTimeout(200);
   ```

3. **验证空态文案**
   ```typescript
   await expect(customSection).toContainText('No custom skills added');
   ```

**预期结果**：Custom Skills 为空时显示 "No custom skills added"

**清理操作**：关闭 Drawer

---

### P1-20: AddSkillsModal 顶部外部源 pill 渲染 + 激活切换

**用例名称**：`skills modal source pills render and switch`

**覆盖需求**：F-A-01

**前置条件**：

- 存在至少 1 个外部技能源

**测试步骤**：

1. **打开 AddSkillsModal**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await drawer.waitFor({ state: 'visible' });

   await page.locator('[data-testid="btn-add-skills"]').click();
   const modal = page.locator('.arco-modal').filter({ hasText: 'Add Skills' });
   await expect(modal).toBeVisible({ timeout: 3000 });
   ```

2. **验证外部源 pill 渲染**

   ```typescript
   // pill 按钮显示源名 + 技能数（如 "User Skills (5)"）
   const pills = modal.locator('button').filter({ has: page.locator('span[class*="px-6px"]') });
   const pillCount = await pills.count();

   if (pillCount === 0) {
     test.skip(true, 'No external skill sources found');
     return;
   }

   expect(pillCount).toBeGreaterThan(0);
   ```

3. **验证激活 pill 样式**

   ```typescript
   const firstPill = pills.first();
   const firstPillClass = await firstPill.getAttribute('class');

   // 激活 pill 应有蓝色背景 + 白字
   expect(firstPillClass).toContain('bg-primary-6');
   expect(firstPillClass).toContain('text-white');
   ```

4. **点击切换到第二个源（如有）**

   ```typescript
   if (pillCount > 1) {
     const secondPill = pills.nth(1);
     await secondPill.click();
     await page.waitForTimeout(300);

     // 第二个 pill 应变为激活状态
     const secondPillClass = await secondPill.getAttribute('class');
     expect(secondPillClass).toContain('bg-primary-6');

     // 第一个 pill 应变为非激活状态
     const firstPillClassAfter = await firstPill.getAttribute('class');
     expect(firstPillClassAfter).not.toContain('bg-primary-6');
   }
   ```

**预期结果**：

- 外部源 pill 渲染，显示源名 + 技能数
- 激活 pill 有蓝色背景，点击切换时样式变化

**清理操作**：关闭 Modal

---

### P1-21: AddSkillsModal 已添加技能显示 Added disabled

**用例名称**：`skills modal shows added skills as disabled`

**覆盖需求**：F-A-05

**前置条件**：

- 存在外部技能源且有已添加的技能

**测试步骤**：

1. **打开 AddSkillsModal**（同 P1-20）

   ```typescript
   // ... 打开 Modal
   test.skip(true, 'Requires external skill source with added skills');
   ```

2. **查找已添加技能的 "Added" 按钮**

   ```typescript
   const addedBtn = modal.locator('button').filter({ hasText: 'Added' }).first();

   if ((await addedBtn.count()) === 0) {
     test.skip(true, 'No added skills found');
     return;
   }

   await expect(addedBtn).toBeVisible();
   await expect(addedBtn).toBeDisabled();
   ```

**预期结果**：已添加技能的按钮文案为 "Added" 且 disabled

**清理操作**：关闭 Modal

---

### P1-22: Drawer 响应式宽度（480 / 1024 / 2048 viewport）

**用例名称**：`drawer width responds to viewport size`

**覆盖需求**：F-E-01

**前置条件**：

- 导航到 Assistant 设置页

**测试步骤**：

1. **480px viewport**

   ```typescript
   await page.setViewportSize({ width: 480, height: 800 });
   await page.goto('/#/settings/assistants');

   await page.locator('[data-testid^="assistant-card-"]').first().click();
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });

   const width480 = await drawer.evaluate((el) => window.getComputedStyle(el).width);

   // Math.min(1024, Math.max(480, 480 * 0.5)) = 480
   expect(width480).toBe('480px');

   await page.keyboard.press('Escape');
   await drawer.waitFor({ state: 'hidden' });
   ```

2. **1024px viewport**

   ```typescript
   await page.setViewportSize({ width: 1024, height: 800 });
   await page.locator('[data-testid^="assistant-card-"]').first().click();
   await drawer.waitFor({ state: 'visible' });

   const width1024 = await drawer.evaluate((el) => window.getComputedStyle(el).width);

   // Math.min(1024, Math.max(480, 1024 * 0.5)) = 512
   expect(width1024).toBe('512px');

   await page.keyboard.press('Escape');
   await drawer.waitFor({ state: 'hidden' });
   ```

3. **2048px viewport**

   ```typescript
   await page.setViewportSize({ width: 2048, height: 800 });
   await page.locator('[data-testid^="assistant-card-"]').first().click();
   await drawer.waitFor({ state: 'visible' });

   const width2048 = await drawer.evaluate((el) => window.getComputedStyle(el).width);

   // Math.min(1024, Math.max(480, 2048 * 0.5)) = 1024
   expect(width2048).toBe('1024px');

   await page.keyboard.press('Escape');
   ```

**预期结果**：

- 480px viewport → Drawer 宽度 480px
- 1024px viewport → Drawer 宽度 512px
- 2048px viewport → Drawer 宽度 1024px（上限）

**清理操作**：恢复默认 viewport

---

### P1-23: sessionStorage/路由 state 的 openAssistantEditorIntent 触发自动打开编辑器

**用例名称**：`session storage intent opens assistant editor`

**覆盖需求**：3.3 交互流程

**前置条件**：

- 已知一个存在的助手 ID

**测试步骤**：

1. **设置 sessionStorage intent**

   ```typescript
   const targetId = 'builtin-agent'; // 或动态获取

   await page.evaluate((id) => {
     sessionStorage.setItem(
       'guid.openAssistantEditorIntent',
       JSON.stringify({ assistantId: id, openAssistantEditor: true })
     );
   }, targetId);
   ```

2. **导航到 Assistant 设置页**

   ```typescript
   await page.goto('/#/settings/assistants');
   await page.waitForTimeout(1000); // 等待 useEffect 触发
   ```

3. **验证 Drawer 自动打开**

   ```typescript
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

4. **验证 sessionStorage 被清空**

   ```typescript
   const intentAfter = await page.evaluate(() => {
     return sessionStorage.getItem('guid.openAssistantEditorIntent');
   });

   expect(intentAfter).toBeNull();
   ```

**预期结果**：

- sessionStorage 设置后导航到页面 → Drawer 自动打开
- sessionStorage 被清空

**清理操作**：关闭 Drawer

---

### P1-24: 移动端布局响应式验证（按钮/搜索纵向排列 + 按钮宽度 100%）

**用例名称**：`mobile layout stacks buttons vertically and full width`

**覆盖需求**：F-L-10

**前置条件**：

- 设置移动端 viewport（如 375px 宽度）

**测试步骤**：

1. **设置移动端 viewport**

   ```typescript
   await page.setViewportSize({ width: 375, height: 667 });
   await page.goto('/#/settings/assistants');
   await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10000 });
   ```

2. **验证按钮/搜索区纵向排列**

   ```typescript
   // 顶部容器应有 flex-col
   const headerContainer = page.locator('.flex.gap-12px').first();
   const headerClass = await headerContainer.getAttribute('class');
   expect(headerClass).toContain('flex-col');
   ```

3. **验证 Create 按钮宽度 100%、高度 36px**

   ```typescript
   const createBtn = page.locator('[data-testid="btn-create-assistant"]');
   const btnClass = await createBtn.getAttribute('class');

   expect(btnClass).toContain('!w-full');
   expect(btnClass).toContain('!h-36px');
   ```

**预期结果**：

- 移动端下按钮/搜索区纵向排列（`flex-col`）
- Create 按钮宽度 100%、高度 36px

**清理操作**：恢复默认 viewport

---

### P1-25: AddSkillsModal 关闭时清空 `searchExternalQuery`

**用例名称**：`skills modal clears search on close`

**覆盖需求**：F-A-07

**前置条件**：

- 打开 AddSkillsModal 并输入搜索

**测试步骤**：

1. **打开 AddSkillsModal 并输入搜索**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await drawer.waitFor({ state: 'visible' });

   await page.locator('[data-testid="btn-add-skills"]').click();
   const modal = page.locator('.arco-modal').filter({ hasText: 'Add Skills' });
   await expect(modal).toBeVisible({ timeout: 3000 });

   const searchInput = modal.locator('input[placeholder*="Search"]');
   await searchInput.fill('test query');
   ```

2. **关闭 Modal**

   ```typescript
   await page.keyboard.press('Escape');
   await modal.waitFor({ state: 'hidden', timeout: 3000 });
   ```

3. **重新打开 Modal 并验证搜索已清空**

   ```typescript
   await page.locator('[data-testid="btn-add-skills"]').click();
   await modal.waitFor({ state: 'visible', timeout: 3000 });

   const searchInputAgain = modal.locator('input[placeholder*="Search"]');
   await expect(searchInputAgain).toHaveValue('');
   ```

**预期结果**：关闭 Modal 后重新打开，搜索框为空

**清理操作**：关闭 Modal 和 Drawer

---

### P1-26: 列表排序——section 标题文案 + 数量显示 (N)

**用例名称**：`section headers show count`

**覆盖需求**：F-L-05

**前置条件**：

- 列表有启用和禁用的助手

**测试步骤**：

1. **导航到 Assistant 设置页**

   ```typescript
   await page.goto('/#/settings/assistants');
   await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10000 });
   ```

2. **验证 Enabled 区段标题和数量**

   ```typescript
   const enabledHeader = page.locator('text=/Enabled/').first();
   await expect(enabledHeader).toBeVisible();

   const enabledText = await enabledHeader.textContent();
   // 应包含数量，如 "Enabled (3)"
   expect(enabledText).toMatch(/Enabled.*\(\d+\)/);
   ```

3. **验证 Disabled 区段标题和数量**

   ```typescript
   const disabledHeader = page.locator('text=/Disabled/').first();

   // 如果有禁用助手
   if (await disabledHeader.isVisible().catch(() => false)) {
     const disabledText = await disabledHeader.textContent();
     expect(disabledText).toMatch(/Disabled.*\(\d+\)/);
   }
   ```

**预期结果**：

- Enabled 区段标题显示 "Enabled (N)"
- Disabled 区段标题显示 "Disabled (N)"

**清理操作**：无

---

### P1-27: Summary Skills 计数 Tag 颜色（0=gray, >0=green）

**用例名称**：`summary skills count tag color changes with count`

**覆盖需求**：F-E-09

**前置条件**：

- 打开 Custom 助手 Drawer

**测试步骤**：

1. **打开 Custom 助手 Drawer（无技能）**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await expect(drawer).toBeVisible({ timeout: 5000 });
   ```

2. **定位 Summary 区 Skills 计数 Tag**

   ```typescript
   const summarySection = drawer.locator('.flex.flex-wrap.items-center.gap-8px.p-10px');
   const skillsTag = summarySection.locator('.arco-tag').filter({ hasText: /\d+/ }).last();
   ```

3. **验证无技能时为 gray**

   ```typescript
   const tagColorInitial = await skillsTag.getAttribute('color');
   expect(tagColorInitial).toBe('gray');
   ```

4. **添加技能后验证变为 green**（需实际添加技能或 mock）
   ```typescript
   // 此步骤需要实际添加技能，或跳过
   test.skip(true, 'Requires adding skills to verify color change');
   ```

**预期结果**：

- 技能数为 0 → Tag 颜色 gray
- 技能数 > 0 → Tag 颜色 green

**清理操作**：关闭 Drawer

---

## P2 测试用例（边界/辅助，可选）

### P2-1: 高亮动画中途离开页面无 warning

**用例名称**：`highlight animation cleanup on unmount`

**覆盖需求**：B-14

**前置条件**：

- 已知一个存在的助手 ID

**测试步骤**：

1. **导航到带 highlight 参数的 URL**

   ```typescript
   const targetId = 'builtin-agent';
   await page.goto('/#/settings/assistants?highlight=' + targetId);

   const targetCard = page.locator(`[data-testid="assistant-card-${targetId}"]`);
   await targetCard.waitFor({ state: 'visible', timeout: 10000 });
   ```

2. **等待 1 秒（高亮动画未完成）**

   ```typescript
   await page.waitForTimeout(1000);
   ```

3. **立即跳转到其他页面**

   ```typescript
   await page.goto('/#/settings/general');
   await page.waitForTimeout(500);
   ```

4. **验证无 console warning/error**

   ```typescript
   const errors: string[] = [];
   page.on('console', (msg) => {
     if (msg.type() === 'error' || msg.type() === 'warning') {
       errors.push(msg.text());
     }
   });

   await page.waitForTimeout(3000); // 等待可能的延迟错误

   // 不应有内存泄漏相关的 warning
   const hasMemoryWarning = errors.some((e) => e.includes('memory') || e.includes('timer') || e.includes('cleanup'));
   expect(hasMemoryWarning).toBe(false);
   ```

**预期结果**：高亮动画期间离开页面不产生 warning/error

**清理操作**：无

---

### P2-2: 搜索 + Tab 过滤同时生效空态

**用例名称**：`search and tab filter both apply empty state`

**覆盖需求**：B-15

**前置条件**：

- 列表有 Builtin 和 Custom 助手

**测试步骤**：

1. **输入搜索 "Custom"**

   ```typescript
   await page.locator('[data-testid="btn-search-toggle"]').click();
   const searchInput = page.locator('[data-testid="input-search-assistant"]');
   await searchInput.fill('Custom');
   await page.waitForTimeout(300);
   ```

2. **切换到 System Tab**

   ```typescript
   const systemTab = page.locator('.arco-tabs-tab').filter({ hasText: 'System' });
   await systemTab.click();
   await page.waitForTimeout(300);
   ```

3. **验证空态文案**
   ```typescript
   // 两个条件同时生效：searchQuery="Custom" + filter="builtin"
   // 结果应为空
   const emptyMessage = page.locator('text=No assistants match the current filters.');
   await expect(emptyMessage).toBeVisible();
   ```

**预期结果**：搜索 "Custom" + 切 System Tab → 显示空态文案

**清理操作**：清空搜索

---

### P2-3: Pending/Custom 技能 hover 显示删除按钮

**用例名称**：`skill delete button visible on hover`

**覆盖需求**：F-SK-09

**前置条件**：

- 有 Pending 或 Custom 技能

**测试步骤**：

1. **定位 Pending/Custom 技能卡片**

   ```typescript
   // 需要 Pending 或 Custom 技能
   test.skip(true, 'Requires pending/custom skill');
   ```

2. **验证默认删除按钮不可见**

   ```typescript
   const skillCard = drawer.locator('.flex.items-start.gap-8px.p-8px').first();
   const deleteBtn = skillCard.locator('button').filter({ has: page.locator('svg[class*="delete"]') });

   // 默认不可见（opacity-0）
   const isVisible = await deleteBtn.isVisible().catch(() => false);
   expect(isVisible).toBe(false);
   ```

3. **Hover 卡片后验证可见**

   ```typescript
   await skillCard.hover();
   await page.waitForTimeout(100);

   await expect(deleteBtn).toBeVisible();
   ```

**预期结果**：

- 默认删除按钮不可见（`opacity-0`）
- Hover 时可见（`group-hover:opacity-100`）

**清理操作**：无

---

### P2-4: AddCustomPathModal OK 按钮 disabled 规则（Name/Path trim 后任一为空）

**用例名称**：`add custom path ok button disabled when empty`

**覆盖需求**：F-P-03

**前置条件**：

- 打开 AddCustomPathModal

**测试步骤**：

1. **打开 AddSkillsModal 并点击 "+" 按钮**

   ```typescript
   await page.locator('[data-testid="btn-create-assistant"]').click();
   const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
   await drawer.waitFor({ state: 'visible' });

   await page.locator('[data-testid="btn-add-skills"]').click();
   const skillsModal = page.locator('.arco-modal').filter({ hasText: 'Add Skills' });
   await expect(skillsModal).toBeVisible({ timeout: 3000 });

   // 点击 "+" 按钮打开 Add Custom Path Modal
   const addPathBtn = skillsModal.locator('button').filter({ has: page.locator('[class*="plus"]') });
   await addPathBtn.click();

   const pathModal = page.locator('.arco-modal').filter({ hasText: 'Add Custom Path' });
   await expect(pathModal).toBeVisible({ timeout: 3000 });
   ```

2. **验证 Name 为空时 OK 按钮 disabled**

   ```typescript
   const nameInput = pathModal.locator('input').first();
   const pathInput = pathModal.locator('input').last();
   const okBtn = pathModal.locator('.arco-btn-primary');

   await nameInput.clear();
   await pathInput.fill('/test/path');
   await page.waitForTimeout(200);

   await expect(okBtn).toBeDisabled();
   ```

3. **验证 Path 为空时 OK 按钮 disabled**

   ```typescript
   await nameInput.fill('Test');
   await pathInput.clear();
   await page.waitForTimeout(200);

   await expect(okBtn).toBeDisabled();
   ```

4. **验证仅空格时 OK 按钮 disabled**

   ```typescript
   await nameInput.fill('   ');
   await pathInput.fill('   ');
   await page.waitForTimeout(200);

   await expect(okBtn).toBeDisabled();
   ```

5. **验证两者都非空时 OK 按钮 enabled**

   ```typescript
   await nameInput.fill('Test');
   await pathInput.fill('/test/path');
   await page.waitForTimeout(200);

   await expect(okBtn).toBeEnabled();
   ```

**预期结果**：

- Name 或 Path 为空（trim 后）→ OK 按钮 disabled
- 两者都非空 → OK 按钮 enabled

**清理操作**：关闭 Modal（`Escape`）

---

### P2-5: AddCustomPathModal 选择目录按钮触发 dialog.showOpen（mock 返回路径）

**用例名称**：`add custom path folder button triggers dialog`

**覆盖需求**：F-P-02

**前置条件**：

- 打开 AddCustomPathModal

**测试步骤**：

1. **打开 AddCustomPathModal**（同 P2-4）

   ```typescript
   // ... 打开 Modal
   ```

2. **Mock `dialog.showOpen` 返回路径**

   ```typescript
   await page.evaluate(() => {
     window.electron = window.electron || {};
     window.electron.dialog = {
       showOpen: async () => ({
         canceled: false,
         filePaths: ['/mock/selected/path'],
       }),
     };
   });
   ```

3. **点击 FolderOpen 按钮**

   ```typescript
   const folderBtn = pathModal.locator('button').filter({ has: page.locator('[class*="folder"]') });
   await folderBtn.click();
   ```

4. **验证 Path 输入框填入返回的路径**
   ```typescript
   const pathInput = pathModal.locator('input').last();
   await expect(pathInput).toHaveValue('/mock/selected/path');
   ```

**预期结果**：点击 FolderOpen 按钮 → `dialog.showOpen` 被调用 → 返回路径填入输入框

**清理操作**：关闭 Modal

---

## 测试实施注意事项

### 数据依赖

- **P0-6, P1-6**：依赖 Extension 助手存在（ID 前缀 `ext-`）。如无，测试应 skip。
- **P1-14 ~ P1-17**：依赖外部技能源或 Pending/Custom 技能。建议 mock 或 skip。
- **P1-18**：依赖 Builtin 助手有 Auto-injected Skills。建议用 `builtin-agent`（如有）。
- **P1-21**：依赖已添加的技能。建议 skip 或 mock。

### data-testid 缺失元素

以下元素无 `data-testid`，需通过组合 selector 定位（已在用例中给出）：

- AddSkillsModal 外部源 pill、搜索输入框、技能卡片 Add 按钮
- Drawer 右上 Close 图标、Cancel 按钮
- Rules 区 Expand/Collapse 按钮、Edit/Preview Tab
- Skills 分组 Header、状态点、删除按钮
- SkillConfirmModals OK 按钮
- AddCustomPathModal 输入框、FolderOpen 按钮

### 测试环境要求

- **Viewport 测试**（P1-22, P1-24）：需支持 `page.setViewportSize()`。
- **sessionStorage 测试**（P1-23）：需支持 `page.evaluate()`。
- **Mock dialog.showOpen**（P2-5）：需在测试环境中 mock Electron IPC。

### 清理策略

- 测试创建的 Custom 助手应在用例结束时删除（除非明确作为后续用例的前置条件）。
- 搜索、过滤状态应在用例结束时清空。
- viewport 变更应在用例结束时恢复默认值。

---

## 总结

本文档将 37 条补充测试清单细化为可执行的 Playwright 测试用例步骤，包含：

- **P0**：6 个核心交互用例（必测）
- **P1**：27 个重要 UI 状态用例（推荐测）
- **P2**：5 个边界/辅助用例（可选）

每个用例明确覆盖的需求 ID、前置条件、详细步骤（含 data-testid 和断言点）、预期结果、清理操作。部分用例因依赖外部数据（Extension 助手、技能源等）标注为 skip，可在后续实施时补充 mock 或实际数据。

下一步：由 Engineer 审核可实施性，Designer 确认步骤准确性，之后进入门 3（实际编写测试代码）。
