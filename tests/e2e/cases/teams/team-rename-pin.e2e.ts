/**
 * E2E: Team rename + pin/unpin via sidebar context menu.
 */
import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, createTeam } from '../../helpers';

// 三点菜单触发按钮
const MENU_TRIGGER = '[data-testid="sider-item-menu-trigger"]';

/**
 * 在侧边栏找到指定 team，hover 后点三点菜单，再点指定菜单项
 */
async function clickTeamMenuItem(
  page: import('@playwright/test').Page,
  teamName: string,
  menuKey: string
): Promise<void> {
  // 找到包含 team 名称的 SiderItem 行
  const row = page.locator('.group').filter({ hasText: teamName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });

  // hover 让三点菜单出现
  await row.hover();
  const trigger = row.locator(MENU_TRIGGER);
  await expect(trigger).toBeVisible({ timeout: 3_000 });
  await trigger.click();

  // 等 dropdown 菜单弹出，点击对应 key 的 menu item（用文本匹配）
  const item = page
    .locator('.arco-dropdown-menu-item')
    .or(page.locator('.arco-menu-item'))
    .filter({ hasText: new RegExp(menuKey, 'i') })
    .first();
  await expect(item).toBeVisible({ timeout: 3_000 });
  await item.click();
}

/**
 * 获取侧边栏 team 列表中所有 team 名称（按显示顺序）
 */
async function getSidebarTeamNames(page: import('@playwright/test').Page): Promise<string[]> {
  // 等 Teams section 加载
  const section = page.locator('text=Teams').or(page.locator('text=团队'));
  await expect(section.first()).toBeVisible({ timeout: 10_000 });

  // 每个 SiderItem 行里的名称文本
  const items = page.locator('.group .text-ellipsis span');
  const count = await items.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    if (text?.trim()) names.push(text.trim());
  }
  return names;
}

test.describe('Team Rename & Pin', () => {
  const RENAME_ORIG = 'E2E-Rename-Orig';
  const RENAME_NEW = 'E2E-Rename-New';
  const PIN_A = 'E2E-Pin-A';
  const PIN_B = 'E2E-Pin-B';

  // 每次测试前清理可能残留的 team
  test.beforeEach(async ({ page }) => {
    for (const name of [RENAME_ORIG, RENAME_NEW, PIN_A, PIN_B]) {
      await cleanupTeamsByName(page, name);
    }
  });

  test.afterEach(async ({ page }) => {
    for (const name of [RENAME_ORIG, RENAME_NEW, PIN_A, PIN_B]) {
      await cleanupTeamsByName(page, name);
    }
  });

  test('重命名 team', async ({ page }) => {
    // 1. 通过 UI 创建 team
    await createTeam(page, RENAME_ORIG);

    // 2. 侧边栏 → hover → 三点菜单 → rename
    await clickTeamMenuItem(page, RENAME_ORIG, 'rename');

    // 3. rename modal 弹出，清空输入框并填入新名字
    const modal = page.locator('.arco-modal').last();
    await expect(modal).toBeVisible({ timeout: 5_000 });
    const input = modal.locator('input').first();
    await input.clear();
    await input.fill(RENAME_NEW);

    // 4. 点确认
    const okBtn = modal.locator('.arco-btn-primary');
    await expect(okBtn).toBeEnabled({ timeout: 3_000 });
    await okBtn.click();

    // 等 modal 关闭
    await expect(modal).toBeHidden({ timeout: 5_000 });

    // 5. 验证侧边栏显示新名字，旧名字消失
    const newName = page.locator('.group').filter({ hasText: RENAME_NEW });
    await expect(newName.first()).toBeVisible({ timeout: 10_000 });
    const oldName = page.locator('.group').filter({ hasText: RENAME_ORIG });
    await expect(oldName).toHaveCount(0, { timeout: 5_000 });
  });

  test('pin/unpin team 改变排序', async ({ page }) => {
    // 1. 创建两个 team，A 先创建排在前面
    await createTeam(page, PIN_A);
    // 回到首页避免阻塞第二次创建
    await page.goto(page.url().replace(/#.*/, '#/'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_000);
    await createTeam(page, PIN_B);

    // 回到首页让侧边栏完整渲染
    await page.goto(page.url().replace(/#.*/, '#/'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_000);

    // 确认初始顺序：A 在 B 前面
    let names = await getSidebarTeamNames(page);
    const idxA1 = names.indexOf(PIN_A);
    const idxB1 = names.indexOf(PIN_B);
    expect(idxA1).toBeGreaterThanOrEqual(0);
    expect(idxB1).toBeGreaterThanOrEqual(0);
    expect(idxA1).toBeLessThan(idxB1);

    // 2. Pin B → B 应该排到 A 前面
    await clickTeamMenuItem(page, PIN_B, 'pin');
    await page.waitForTimeout(500);

    names = await getSidebarTeamNames(page);
    const idxA2 = names.indexOf(PIN_A);
    const idxB2 = names.indexOf(PIN_B);
    expect(idxB2).toBeLessThan(idxA2);

    // 3. Unpin B → 恢复原顺序
    await clickTeamMenuItem(page, PIN_B, 'pin');
    await page.waitForTimeout(500);

    names = await getSidebarTeamNames(page);
    const idxA3 = names.indexOf(PIN_A);
    const idxB3 = names.indexOf(PIN_B);
    expect(idxA3).toBeLessThan(idxB3);
  });
});
