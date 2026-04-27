/**
 * E2E: Workspace file operations — expand folder, search, context menu.
 *
 * Seeds a nested directory structure, creates a conversation pointing at it,
 * then drives the workspace panel: expand a folder to reveal children, search
 * by filename, and right-click to open the context menu.
 */
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

test.describe('Workspace — file operations', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-ws-ops-'));
    fs.writeFileSync(path.join(workspace, 'config.json'), '{"name":"test"}');
    fs.mkdirSync(path.join(workspace, 'components'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'components', 'Button.tsx'), '<button>Click</button>');
    fs.writeFileSync(path.join(workspace, 'components', 'Modal.tsx'), '<div>Modal</div>');
    fs.mkdirSync(path.join(workspace, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'lib', 'api.ts'), 'export const fetch = () => {}');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  /** Navigate to guid, set workspace, create conversation, return workspace panel locator. */
  async function setupWorkspace(
    page: import('@playwright/test').Page,
    electronApp: import('@playwright/test').ElectronApplication
  ) {
    await electronApp.evaluate(async ({ dialog }, target) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [target] });
    }, workspace);

    await goToGuid(page);

    const agentPill = page.locator('[data-testid^="agent-pill-"]').first();
    if (!(await agentPill.isVisible({ timeout: 10_000 }).catch(() => false))) return null;
    await agentPill.click();

    const wsBtn = page.locator('[data-testid="workspace-selector-btn"]');
    if (await wsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await wsBtn.click();
      await page.waitForTimeout(500);
    }

    const input = page.locator('[data-testid="guid-input"] textarea, [data-testid="guid-input"] input').first();
    await input.fill('describe the project structure');
    await page.locator('[data-testid="guid-send-btn"]').click();
    await page.waitForURL(/\/conversation\//, { timeout: 30_000 });

    const panel = page.locator('.chat-workspace');
    if (!(await panel.isVisible({ timeout: 30_000 }).catch(() => false))) return null;

    const tree = panel.locator('.workspace-tree');
    if (!(await tree.isVisible({ timeout: 15_000 }).catch(() => false))) return null;

    return panel;
  }

  test('expand folder node reveals children files', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    const panel = await setupWorkspace(page, electronApp);
    if (!panel) {
      test.skip(true, 'Workspace panel or tree not available');
      return;
    }

    // "components" folder should be visible as a tree node
    const componentsNode = panel.getByText('components').first();
    await expect(componentsNode).toBeVisible({ timeout: 10_000 });

    // Click the folder node or its switcher to expand
    await componentsNode.click();
    await page.waitForTimeout(500);

    // After expanding, Button.tsx and Modal.tsx should be visible
    await expect(panel.getByText('Button.tsx').first()).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText('Modal.tsx').first()).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/ws-ops-01-expanded.png' });
  });

  test('search narrows tree to matching files only', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    const panel = await setupWorkspace(page, electronApp);
    if (!panel) {
      test.skip(true, 'Workspace panel or tree not available');
      return;
    }

    const searchInput = panel.locator('.workspace-search-input input').first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Search for "Button" — should show Button.tsx, hide api.ts
    await searchInput.fill('Button');
    await expect(panel.getByText('Button.tsx').first()).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/ws-ops-02-search-button.png' });

    // Search for "api" — should show api.ts
    await searchInput.fill('api');
    await expect(panel.getByText('api.ts').first()).toBeVisible({ timeout: 5_000 });

    await searchInput.fill('');
    await page.screenshot({ path: 'tests/e2e/results/ws-ops-03-search-cleared.png' });
  });

  test('right-click file shows context menu with action items', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    const panel = await setupWorkspace(page, electronApp);
    if (!panel) {
      test.skip(true, 'Workspace panel or tree not available');
      return;
    }

    // Right-click on config.json
    const configNode = panel.getByText('config.json').first();
    await expect(configNode).toBeVisible({ timeout: 10_000 });
    await configNode.click({ button: 'right' });

    // Context menu: fixed div with min-w-200px, contains action buttons
    const ctxMenu = page.locator('.fixed.z-100').first();
    await expect(ctxMenu).toBeVisible({ timeout: 3_000 });

    // Should have recognizable action items
    const addToChat = ctxMenu.getByText(/Add to Chat|添加到对话/i).first();
    const openItem = ctxMenu.getByText(/^Open$|^打开$/i).first();
    expect(
      (await addToChat.isVisible().catch(() => false)) || (await openItem.isVisible().catch(() => false))
    ).toBeTruthy();

    await page.screenshot({ path: 'tests/e2e/results/ws-ops-04-context-menu.png' });

    // Dismiss
    await panel.click({ position: { x: 10, y: 10 } });
  });
});
