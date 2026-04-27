import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, createTeam } from '../../helpers';

const TEAM_COLLAPSED = 'E2E Collapsed Team';
const TEAM_WORKSPACE = 'E2E Workspace Team';

test.describe('Team UI Details', () => {
  test('collapsed sidebar shows team icon and navigates on click', async ({ page }) => {
    await cleanupTeamsByName(page, TEAM_COLLAPSED);

    let teamId: string;
    try {
      teamId = await createTeam(page, TEAM_COLLAPSED);
    } catch {
      test.skip();
      return;
    }

    const collapseBtn = page.locator('button[aria-label="Collapse sidebar"], button[aria-label="折叠侧边栏"]');
    const expandBtn = page.locator('button[aria-label="Expand sidebar"], button[aria-label="展开侧边栏"]');

    await collapseBtn.click({ timeout: 5_000 });

    const collapsedItem = page.locator(`[data-testid="collapsed-team-item-${teamId}"]`);
    await expect(collapsedItem).toBeVisible({ timeout: 5_000 });

    const collapsedIcon = page.locator(`[data-testid="collapsed-team-icon-${teamId}"]`);
    await expect(collapsedIcon).toBeVisible();

    await collapsedItem.click();
    await page.waitForURL(new RegExp(`/team/${teamId}`), { timeout: 10_000 });

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toContain(`/team/${teamId}`);

    await expandBtn.click({ timeout: 5_000 });

    await cleanupTeamsByName(page, TEAM_COLLAPSED);
  });

  test('create team with workspace folder via native dialog', async ({ electronApp, page }) => {
    await cleanupTeamsByName(page, TEAM_WORKSPACE);

    const tmpDir = `/tmp/e2e-workspace-${Date.now()}`;
    await electronApp.evaluate(async ({ dialog }, dir) => {
      const fs = await import('fs');
      fs.mkdirSync(dir, { recursive: true });
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [dir] });
    }, tmpDir);

    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    const modal = page.locator('.arco-modal').last();
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const nameInput = modal.getByRole('textbox').first();
    await nameInput.fill(TEAM_WORKSPACE);

    const leaderSelect = modal.locator('[data-testid="team-create-leader-select"]');
    const hasSelect = await leaderSelect.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasSelect) {
      await modal
        .locator('.arco-btn')
        .filter({ hasText: /Cancel|取消/i })
        .first()
        .click({ force: true });
      test.skip();
      return;
    }
    await leaderSelect.click();

    const firstOption = page.locator('[data-testid^="team-create-agent-option-"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5_000 });
    await firstOption.click();

    const trigger = modal.locator('[data-testid="team-create-workspace-trigger"]');
    await expect(trigger).toBeVisible({ timeout: 3_000 });
    await trigger.click();

    const menu = page.locator('[data-testid="team-create-workspace-menu"]');
    const menuVisible = await menu.isVisible({ timeout: 3_000 }).catch(() => false);

    if (menuVisible) {
      const browseOption = menu.locator('text=Choose a different folder').or(menu.locator('text=选择其他文件夹'));
      await browseOption.first().click();
    }

    await page.waitForTimeout(1_000);

    const workspacePath = modal.locator(`text=${tmpDir.split('/').pop()}`);
    await expect(workspacePath).toBeVisible({ timeout: 5_000 });

    const confirmBtn = modal.locator('.arco-btn-primary');
    await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    await confirmBtn.click();

    await page.waitForURL(/\/team\//, { timeout: 15_000 });

    const wsTitle = page.locator('text=Workspace').or(page.locator('text=工作区'));
    await expect(wsTitle.first()).toBeVisible({ timeout: 10_000 });

    await cleanupTeamsByName(page, TEAM_WORKSPACE);

    await electronApp.evaluate(async (_ctx, dir) => {
      const fs = await import('fs');
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }, tmpDir);
  });
});
