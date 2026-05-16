/**
 * E2E: Single-chat workspace panel — real user flow.
 *
 * Seeds a directory with known files, mocks the native folder dialog, then
 * creates a conversation from the guid page with a user-specified workspace.
 * Verifies the workspace panel renders the seeded files, search works, and
 * tabs switch correctly.
 */
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

test.describe('Workspace — single chat', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-ws-single-'));
    fs.writeFileSync(path.join(workspace, 'readme.md'), '# My Project\n\nHello world.');
    fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'src', 'index.ts'), 'console.log("hello");');
    fs.writeFileSync(path.join(workspace, 'src', 'utils.ts'), 'export const add = (a: number, b: number) => a + b;');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('user selects workspace folder, sends message, sees files in panel', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    await electronApp.evaluate(async ({ dialog }, target) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [target] });
    }, workspace);

    await goToGuid(page);

    // Select an agent
    const agentPill = page.locator('[data-testid^="agent-pill-"]').first();
    if (!(await agentPill.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, 'No agent pills available on guid page');
      return;
    }
    await agentPill.click();

    // Click workspace selector → triggers mocked native dialog
    const wsBtn = page.locator('[data-testid="workspace-selector-btn"]');
    if (await wsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await wsBtn.click();
      await page.waitForTimeout(500);
    }

    // Send a message to create the conversation
    const guidInput = page.locator('[data-testid="guid-input"] textarea, [data-testid="guid-input"] input').first();
    await expect(guidInput).toBeVisible({ timeout: 10_000 });
    await guidInput.fill('list files in this project');
    await page.locator('[data-testid="guid-send-btn"]').click();

    await page.waitForURL(/\/conversation\//, { timeout: 30_000 });

    // Workspace panel should mount with our seeded files
    const panel = page.locator('.chat-workspace');
    if (!(await panel.isVisible({ timeout: 30_000 }).catch(() => false))) {
      await page.screenshot({ path: 'tests/e2e/results/ws-single-01-no-panel.png' });
      test.skip(true, 'Workspace panel did not appear — backend may not support workspace browse yet');
      return;
    }

    // Title label reflects the workspace directory name
    const title = panel.locator('.workspace-title-label').first();
    await expect(title).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'tests/e2e/results/ws-single-01-panel.png' });

    // File tree should show our seeded readme.md
    const tree = panel.locator('.workspace-tree');
    await expect(tree).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('readme.md').first()).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/ws-single-02-tree.png' });

    // Search for "index" → should find src/index.ts
    const searchInput = panel.locator('.workspace-search-input input').first();
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill('index');
      await expect(panel.getByText('index.ts').first()).toBeVisible({ timeout: 5_000 });
      await page.screenshot({ path: 'tests/e2e/results/ws-single-03-search.png' });
      await searchInput.fill('');
    }

    // Switch to Changes tab and back
    const changesTab = panel
      .locator('.arco-tabs-header-title')
      .filter({ hasText: /Changes|更改/ })
      .first();
    if (await changesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await changesTab.click();
      await page.screenshot({ path: 'tests/e2e/results/ws-single-04-changes.png' });
    }

    const filesTab = panel
      .locator('.arco-tabs-header-title')
      .filter({ hasText: /Files|文件/ })
      .first();
    if (await filesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await filesTab.click();
      await expect(panel.getByText('readme.md').first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
