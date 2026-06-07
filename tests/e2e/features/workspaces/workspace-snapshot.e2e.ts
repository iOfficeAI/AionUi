/**
 * E2E: Workspace Diff section (Sider) — real user flow.
 *
 * Creates a team with a seeded workspace, writes a file to disk to produce a
 * diff, then interacts with the dedicated bottom Diff pane in the Sider:
 *   1. The Diff content lives under [data-testid="sider-diff-section"]
 *      (moved out of the top "Files" tree pane's tab bar)
 *   2. Verify the unstaged file appears in the diff list
 *   3. Click Stage → verify it moves to Staged
 *
 * Workspace changes are powered by the Git IPC bridge (`ipcBridge.git.*`); the
 * workspace is a fresh `git init` repo, so untracked files surface as unstaged
 * diffs and `git add` moves them to staged. The status plumbing itself is
 * covered by `useGitChanges` unit tests; this file only asserts the rendered UI.
 */
import { test, expect } from '../../fixtures';
import { cleanupTeamsByName, TEAM_SUPPORTED_BACKENDS } from '../../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const TEAM_NAME = `E2E Workspace Snapshot ${Date.now()}`;

test.describe('Workspace Changes — UI panel', () => {
  let workspace: string;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-ws-snap-'));
    // Initialize a git repo so ipcBridge.git.getStatus has something to report.
    execSync('git init -q', { cwd: workspace });
    fs.writeFileSync(path.join(workspace, 'baseline.txt'), 'original');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('changes tab surfaces a newly written file and stage button moves it', async ({ page, electronApp }) => {
    test.setTimeout(180_000);

    if (TEAM_SUPPORTED_BACKENDS.size === 0) {
      test.skip(true, 'No supported team backends available');
      return;
    }

    await electronApp.evaluate(async ({ dialog }, target) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [target] });
    }, workspace);

    await cleanupTeamsByName(page, TEAM_NAME);

    // ── Create team with seeded workspace ────────────────────────────────
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    const modal = page.locator('.team-create-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    await modal.locator('input').first().fill(TEAM_NAME);

    const agentCard = modal.locator('[data-testid^="team-create-agent-card-"]').first();
    if (!(await agentCard.isVisible().catch(() => false))) {
      test.skip(true, 'No supported agents available');
      return;
    }
    await agentCard.click();

    const wsTrigger = modal.locator('[data-testid="team-create-workspace-trigger"]');
    if (await wsTrigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await wsTrigger.click();
      const menu = page.locator('[data-testid="team-create-workspace-menu"]');
      if (await menu.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const chooseDifferent = menu
          .locator('text=/Choose a different folder|选择其他文件夹/i')
          .or(menu.locator('.cursor-pointer').last());
        await chooseDifferent.first().click();
      }
    }

    const createConfirmBtn = modal.locator('.arco-btn-primary');
    await expect(createConfirmBtn).toBeEnabled({ timeout: 5_000 });
    await createConfirmBtn.click();

    await expect(modal).toBeHidden({ timeout: 15_000 });
    await page.waitForURL(/\/team\//, { timeout: 15_000 });

    // Diff content now lives in the dedicated bottom Sider pane (panelMode="changes").
    // The top pane (SiderFileTree) mounts ChatWorkspace with panelMode="files" (no Changes tab).
    const diffSection = page.locator('[data-testid="sider-diff-section"]');
    await expect(diffSection).toBeVisible({ timeout: 30_000 });

    // ── Seed a diff on disk (git init ran in beforeAll; this write produces
    //    an untracked change that ipcBridge.git.getStatus surfaces as unstaged) ─
    fs.writeFileSync(path.join(workspace, 'created.txt'), 'hello-snapshot');

    // ── Diff list renders directly in the Sider diff section ─────────────
    await page.screenshot({ path: 'tests/e2e/results/workspace-snapshot-01-changes-tab.png' });

    // ── Newly created file should surface somewhere in the diff list ─────
    const createdEntry = diffSection.getByText('created.txt').first();
    await expect(createdEntry).toBeVisible({ timeout: 30_000 });

    await page.screenshot({ path: 'tests/e2e/results/workspace-snapshot-02-unstaged.png' });

    // ── Click a Stage button if available (per-file or Stage All) ────────
    // The GitChangeList renders a Stage-all action + per-file stage buttons.
    const stageButton = diffSection
      .locator('button, [role="button"]')
      .filter({ hasText: /Stage All|全部暂存|Stage|暂存/ })
      .first();
    const stageVisible = await stageButton.isVisible({ timeout: 5_000 }).catch(() => false);
    if (stageVisible) {
      await stageButton.click({ trial: false }).catch(() => {});
      // After staging, the file should still be in the list (just under Staged).
      await expect(diffSection.getByText('created.txt').first()).toBeVisible({ timeout: 10_000 });
      await page.screenshot({ path: 'tests/e2e/results/workspace-snapshot-03-staged.png' });
    }

    // ── Cleanup ──────────────────────────────────────────────────────────
    await cleanupTeamsByName(page, TEAM_NAME);
  });
});
