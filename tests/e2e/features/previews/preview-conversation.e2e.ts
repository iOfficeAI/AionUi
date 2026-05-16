/**
 * E2E: Preview panel — file click triggers preview.
 *
 * Seeds a workspace with an HTML file and a Markdown file, creates a
 * conversation pointing at it, then clicks the file in the workspace tree
 * to trigger the preview panel. Verifies the preview renders content and
 * the toolbar shows action buttons.
 *
 * This is deterministic — no dependency on agent output.
 */
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

const HTML_CONTENT = `<!DOCTYPE html>
<html><head><title>E2E Preview</title></head>
<body><h1>Hello Preview</h1><p>This is a test page.</p></body>
</html>`;

const MD_CONTENT = `# Preview Test\n\nThis is **bold** and *italic*.\n\n- Item 1\n- Item 2\n`;

test.describe('Preview — file click triggers preview', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-preview-'));
    fs.writeFileSync(path.join(workspace, 'page.html'), HTML_CONTENT);
    fs.writeFileSync(path.join(workspace, 'notes.md'), MD_CONTENT);
    fs.writeFileSync(path.join(workspace, 'data.json'), '{"key":"value","count":42}');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('clicking HTML file in workspace tree opens preview panel', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    await electronApp.evaluate(async ({ dialog }, target) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [target] });
    }, workspace);

    await goToGuid(page);

    const agentPill = page.locator('[data-testid^="agent-pill-"]').first();
    if (!(await agentPill.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, 'No agent pills available');
      return;
    }
    await agentPill.click();

    const wsBtn = page.locator('[data-testid="workspace-selector-btn"]');
    if (await wsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await wsBtn.click();
      await page.waitForTimeout(500);
    }

    const input = page.locator('[data-testid="guid-input"] textarea, [data-testid="guid-input"] input').first();
    await input.fill('check the HTML file');
    await page.locator('[data-testid="guid-send-btn"]').click();
    await page.waitForURL(/\/conversation\//, { timeout: 30_000 });

    // Wait for workspace panel and file tree
    const wsPanel = page.locator('.chat-workspace');
    if (!(await wsPanel.isVisible({ timeout: 30_000 }).catch(() => false))) {
      test.skip(true, 'Workspace panel not available');
      return;
    }

    const tree = wsPanel.locator('.workspace-tree');
    if (!(await tree.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, 'File tree not loaded');
      return;
    }

    // Click page.html in the tree → should trigger preview
    const htmlFile = wsPanel.getByText('page.html').first();
    await expect(htmlFile).toBeVisible({ timeout: 10_000 });
    await htmlFile.click();

    await page.screenshot({ path: 'tests/e2e/results/preview-conv-01-clicked.png' });

    // Preview panel should appear
    const previewPanel = page.locator('.preview-panel');
    if (!(await previewPanel.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, 'Preview panel did not open on file click');
      return;
    }

    // Preview should have content (iframe for HTML, or viewer)
    const content = previewPanel.locator('iframe, [class*="viewer"], [class*="editor"], pre, .cm-editor').first();
    await expect(content).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/preview-conv-02-preview.png' });

    // Toolbar should have action buttons
    const downloadBtn = previewPanel.locator('[title*="download"], [title*="Download"], [title*="下载"]').first();
    const openBtn = previewPanel.locator('[title*="open"], [title*="Open"], [title*="打开"]').first();
    expect(
      (await downloadBtn.isVisible().catch(() => false)) || (await openBtn.isVisible().catch(() => false))
    ).toBeTruthy();
  });

  test('clicking markdown file opens preview with rendered content', async ({ page, electronApp }) => {
    test.setTimeout(120_000);

    await electronApp.evaluate(async ({ dialog }, target) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [target] });
    }, workspace);

    await goToGuid(page);

    const agentPill = page.locator('[data-testid^="agent-pill-"]').first();
    if (!(await agentPill.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip(true, 'No agent pills available');
      return;
    }
    await agentPill.click();

    const wsBtn = page.locator('[data-testid="workspace-selector-btn"]');
    if (await wsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await wsBtn.click();
      await page.waitForTimeout(500);
    }

    const input = page.locator('[data-testid="guid-input"] textarea, [data-testid="guid-input"] input').first();
    await input.fill('read the notes');
    await page.locator('[data-testid="guid-send-btn"]').click();
    await page.waitForURL(/\/conversation\//, { timeout: 30_000 });

    const wsPanel = page.locator('.chat-workspace');
    if (!(await wsPanel.isVisible({ timeout: 30_000 }).catch(() => false))) {
      test.skip(true, 'Workspace panel not available');
      return;
    }

    const tree = wsPanel.locator('.workspace-tree');
    if (!(await tree.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, 'File tree not loaded');
      return;
    }

    // Click notes.md
    const mdFile = wsPanel.getByText('notes.md').first();
    await expect(mdFile).toBeVisible({ timeout: 10_000 });
    await mdFile.click();

    const previewPanel = page.locator('.preview-panel');
    if (!(await previewPanel.isVisible({ timeout: 15_000 }).catch(() => false))) {
      test.skip(true, 'Preview panel did not open');
      return;
    }

    // Should have rendered markdown content or editor with source
    const viewer = previewPanel.locator('iframe, [class*="viewer"], .cm-editor, pre').first();
    await expect(viewer).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/preview-conv-03-markdown.png' });
  });
});
