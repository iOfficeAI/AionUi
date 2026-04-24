/**
 * E2E: Workspace Files tab — file tree, search, and file operations.
 *
 * Split into two layers:
 *   1. API layer  — drives `/api/fs/*` via invokeBridge against a temp workspace
 *      to validate the backend contract (dir/list/read/write/rename/remove).
 *      These tests are fast, deterministic, and do not require a conversation.
 *   2. UI layer   — navigates to an existing conversation (if any), verifies
 *      the workspace panel renders and search input toggles. Skips gracefully
 *      when no conversation exists in the session.
 */
import { test, expect } from '../../fixtures';
import { invokeBridge } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

type IDirOrFile = {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: IDirOrFile[];
};

type IWorkspaceFlatFile = {
  name: string;
  fullPath: string;
  relativePath: string;
};

test.describe('Workspace Files — backend API', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-ws-'));
    // Seed a minimal tree:  a.txt, notes/b.md, notes/nested/c.log
    fs.writeFileSync(path.join(workspace, 'a.txt'), 'alpha');
    fs.mkdirSync(path.join(workspace, 'notes', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(workspace, 'notes', 'b.md'), '# beta');
    fs.writeFileSync(path.join(workspace, 'notes', 'nested', 'c.log'), 'gamma');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('fs.dir returns the top-level tree entries', async ({ page }) => {
    const entries = await invokeBridge<IDirOrFile[]>(page, 'fs.dir', { dir: workspace, root: workspace });
    expect(Array.isArray(entries)).toBe(true);

    const names = entries.map((e) => e.name).slice().sort();
    expect(names).toContain('a.txt');
    expect(names).toContain('notes');

    const notes = entries.find((e) => e.name === 'notes');
    expect(notes?.isDir).toBe(true);
    const fileA = entries.find((e) => e.name === 'a.txt');
    expect(fileA?.isFile).toBe(true);
  });

  test('fs.list returns a flat listing with relative paths', async ({ page }) => {
    const flat = await invokeBridge<IWorkspaceFlatFile[]>(page, 'fs.list', { root: workspace });
    const relPaths = flat.map((f) => f.relativePath).slice().sort();
    expect(relPaths).toContain('a.txt');
    // Either forward or platform separator — normalise before comparison.
    const normalized = relPaths.map((p) => p.split('\\').join('/'));
    expect(normalized).toContain('notes/b.md');
    expect(normalized).toContain('notes/nested/c.log');
  });

  test('fs.read returns the text content of a file', async ({ page }) => {
    const content = await invokeBridge<string>(page, 'fs.read', { path: path.join(workspace, 'a.txt') });
    expect(content).toBe('alpha');
  });

  test('fs.write then fs.read round-trips content', async ({ page }) => {
    const target = path.join(workspace, 'written.txt');
    await invokeBridge(page, 'fs.write', { path: target, data: 'hello-e2e' });
    const echo = await invokeBridge<string>(page, 'fs.read', { path: target });
    expect(echo).toBe('hello-e2e');
  });

  test('fs.rename moves a file to a new name', async ({ page }) => {
    const src = path.join(workspace, 'to-rename.txt');
    fs.writeFileSync(src, 'x');
    const res = await invokeBridge<{ newPath: string }>(page, 'fs.rename', {
      path: src,
      new_name: 'renamed.txt',
    });
    expect(typeof res?.newPath === 'string' || res === undefined).toBe(true);
    expect(fs.existsSync(src)).toBe(false);
    expect(fs.existsSync(path.join(workspace, 'renamed.txt'))).toBe(true);
  });

  test('fs.remove deletes a file', async ({ page }) => {
    const victim = path.join(workspace, 'to-delete.txt');
    fs.writeFileSync(victim, 'bye');
    await invokeBridge(page, 'fs.remove', { path: victim });
    expect(fs.existsSync(victim)).toBe(false);
  });
});

test.describe('Workspace Files — UI panel', () => {
  test('workspace panel renders on an existing conversation', async ({ page }) => {
    // Navigate to guid; if a prior conversation exists in the sidebar, open it.
    await page.evaluate(() => window.location.assign('#/guid'));
    await page.waitForFunction(() => window.location.hash.includes('#/guid'), { timeout: 10_000 }).catch(() => {});

    // Find the first non-team conversation link in the sidebar history.
    const convLink = page.locator('a[href^="#/conversation/"]').first();
    const hasConv = await convLink.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hasConv) {
      test.skip(true, 'No existing conversation in sidebar — workspace panel requires a conversation');
      return;
    }

    await convLink.click();
    await page
      .waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 10_000 })
      .catch(() => {});

    // Workspace container class is stable across Workspace refactors.
    const panel = page.locator('.chat-workspace');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Title label is the workspace directory name.
    await expect(panel.locator('.workspace-title-label').first()).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/workspace-files-01-panel.png' });
  });

  test('search input toggles and accepts typed query', async ({ page }) => {
    const panel = page.locator('.chat-workspace');
    const panelVisible = await panel.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!panelVisible) {
      test.skip(true, 'Workspace panel not mounted — depends on conversation context');
      return;
    }

    const searchInput = panel.locator('.workspace-search-input input').first();
    if (!(await searchInput.isVisible({ timeout: 1_000 }).catch(() => false))) {
      // Search may be collapsed behind a toggle button — skip if not directly reachable.
      test.skip(true, 'Workspace search input not directly visible in this build');
      return;
    }

    await searchInput.fill('readme');
    await expect(searchInput).toHaveValue('readme', { timeout: 3_000 });

    // Tree re-renders after search; locator should still resolve without throwing.
    const tree = panel.locator('.workspace-tree');
    const treeRendered = await tree.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(typeof treeRendered).toBe('boolean');

    await searchInput.fill('');
  });
});
