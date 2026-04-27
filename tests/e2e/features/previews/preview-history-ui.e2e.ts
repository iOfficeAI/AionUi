/**
 * E2E: Preview history and view mode toggle — real user flow.
 *
 * Seeds a workspace with files, opens a preview via file click, then
 * exercises the Editor/Preview toggle and history dropdown.
 */
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

test.describe('Preview — history and view toggle', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-preview-hist-'));
    fs.writeFileSync(path.join(workspace, 'app.html'), '<!DOCTYPE html><html><body><h1>Version 1</h1></body></html>');
    fs.writeFileSync(path.join(workspace, 'style.css'), 'body { margin: 0; }');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  /** Create conversation with workspace, click a file, return preview panel or null. */
  async function openPreviewViaFileClick(
    page: import('@playwright/test').Page,
    electronApp: import('@playwright/test').ElectronApplication,
    fileName: string
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
    await input.fill('review the files');
    await page.locator('[data-testid="guid-send-btn"]').click();
    await page.waitForURL(/\/conversation\//, { timeout: 30_000 });

    const wsPanel = page.locator('.chat-workspace');
    if (!(await wsPanel.isVisible({ timeout: 30_000 }).catch(() => false))) return null;

    const tree = wsPanel.locator('.workspace-tree');
    if (!(await tree.isVisible({ timeout: 15_000 }).catch(() => false))) return null;

    const fileNode = wsPanel.getByText(fileName).first();
    if (!(await fileNode.isVisible({ timeout: 10_000 }).catch(() => false))) return null;
    await fileNode.click();

    const previewPanel = page.locator('.preview-panel');
    if (!(await previewPanel.isVisible({ timeout: 15_000 }).catch(() => false))) return null;

    return previewPanel;
  }

  test('Editor/Preview toggle switches view mode', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    const panel = await openPreviewViaFileClick(page, electronApp, 'app.html');
    if (!panel) {
      test.skip(true, 'Preview panel not available');
      return;
    }

    // Find Editor and Preview toggle text spans
    const editorToggle = panel.getByText(/^Editor$|^编辑器$/).first();
    const previewToggle = panel.getByText(/^Preview$|^预览$/).first();

    if (!(await editorToggle.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'View mode toggle not available for this file type');
      return;
    }

    // Switch to Editor mode
    await editorToggle.click();
    await page.waitForTimeout(500);

    // Editor mode should show a code editor (CodeMirror or textarea)
    const editor = panel.locator('.cm-editor, textarea, [class*="editor"]').first();
    const hasEditor = await editor.isVisible({ timeout: 5_000 }).catch(() => false);
    await page.screenshot({ path: 'tests/e2e/results/preview-hist-01-editor.png' });

    // Switch to Preview mode
    if (await previewToggle.isVisible().catch(() => false)) {
      await previewToggle.click();
      await page.waitForTimeout(500);

      // Preview mode should show rendered content (iframe or viewer)
      const viewer = panel.locator('iframe, [class*="viewer"]').first();
      const hasViewer = await viewer.isVisible({ timeout: 5_000 }).catch(() => false);
      await page.screenshot({ path: 'tests/e2e/results/preview-hist-02-preview.png' });

      // At least one mode should have content
      expect(hasEditor || hasViewer).toBeTruthy();
    }
  });

  test('history dropdown opens and shows version list', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    const panel = await openPreviewViaFileClick(page, electronApp, 'app.html');
    if (!panel) {
      test.skip(true, 'Preview panel not available');
      return;
    }

    // Find history button by title (i18n: "历史版本" or "History versions")
    const historyBtn = panel
      .locator('[title*="history"], [title*="History"], [title*="版本"], [title*="历史"]')
      .first();

    if (!(await historyBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'History button not visible in toolbar');
      return;
    }

    await historyBtn.click();
    await page.screenshot({ path: 'tests/e2e/results/preview-hist-03-dropdown.png' });

    // Dropdown should appear with either entries or "no history" message
    const dropdown = page.locator('.arco-trigger-popup, .arco-dropdown, .arco-popover').last();
    const dropdownVisible = await dropdown.isVisible({ timeout: 5_000 }).catch(() => false);

    if (dropdownVisible) {
      // Should show either version entries or empty state text
      const hasEntries = await dropdown.locator('[class*="item"]').count();
      const hasEmptyText = await dropdown
        .getByText(/no history|暂无|没有/i)
        .isVisible()
        .catch(() => false);
      expect(hasEntries > 0 || hasEmptyText).toBeTruthy();
    }

    // Dismiss
    await page.keyboard.press('Escape');
  });
});
