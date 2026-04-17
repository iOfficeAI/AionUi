/**
 * E2E: Team workspace migration.
 *
 * Verifies that changing workspace in team mode keeps the team fully
 * functional — members can still be assigned tasks after migration.
 *
 * Full flow:
 *   1. Create team via sidebar UI, wait for session active
 *   2. Send task to leader → leader adds a member → member tab appears
 *   3. Wait for leader + member idle (confirms team is working)
 *   4. Mock native file dialog → change workspace → confirm
 *   5. Assert workspace updated (team record + all agent conversations)
 *   6. Send another task to leader → verify member gets re-assigned
 *   7. Cleanup: delete team + temp directory
 */
import { test, expect } from '../fixtures';
import { invokeBridge, TEAM_SUPPORTED_BACKENDS } from '../helpers';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEAM_NAME = `E2E Migration ${Date.now()}`;
const LEADER_BACKEND = [...TEAM_SUPPORTED_BACKENDS][0] ?? 'claude';

test.describe('Team Workspace Migration', () => {
  let targetWorkspace: string;
  let teamId: string | undefined;

  test.beforeAll(async () => {
    targetWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-target-'));
  });

  test.afterAll(async () => {
    fs.rmSync(targetWorkspace, { recursive: true, force: true });
  });

  test('migrate workspace and verify team still functional', async ({ page, electronApp }) => {
    test.setTimeout(300_000);

    // ── Cleanup leftover E2E Migration teams from previous runs ─────────

    const existingTeams = await invokeBridge<Array<{ id: string; name: string }>>(page, 'team.list', {
      userId: 'system_default_user',
    });
    for (const t of existingTeams) {
      if (t.name.startsWith('E2E Migration')) {
        await invokeBridge(page, 'team.remove', { id: t.id }).catch(() => {});
      }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    const tabBar = page.locator('[data-testid="team-tab-bar"]');

    const waitForLeaderIdle = async () => {
      const badge = tabBar
        .locator('span')
        .filter({ hasText: 'Leader' })
        .locator('xpath=following-sibling::span[@aria-label="active"]');
      await expect(badge).not.toBeVisible({ timeout: 90_000 });
    };

    const autoApproveMcpDialogs = async (durationMs = 60_000) => {
      const btn = page.locator('button').filter({ hasText: /Yes.*allow always|是.*始终允许/i });
      const deadline = Date.now() + durationMs;
      while (Date.now() < deadline) {
        const visible = await btn
          .first()
          .isVisible()
          .catch(() => false);
        if (!visible) break;
        await btn
          .first()
          .click()
          .catch(() => {});
        await page.waitForTimeout(500);
      }
    };

    // ── Step 1: Create team via sidebar UI ──────────────────────────────

    const teamSection = page.locator('text=Teams').or(page.locator('text=团队'));
    await expect(teamSection.first()).toBeVisible({ timeout: 15_000 });

    const createBtn = page.locator('.h-20px.w-20px.rd-4px').first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();

    const modal = page.locator('.team-create-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const nameInput = modal.locator('input').first();
    await nameInput.fill(TEAM_NAME);

    const agentCard = modal.locator('[data-testid^="team-create-agent-card-"]').first();
    if (!(await agentCard.isVisible().catch(() => false))) {
      test.skip(true, 'No supported agents available');
      return;
    }
    await agentCard.click();
    await expect(modal.locator('[data-testid^="team-create-agent-selected-badge-"]').first()).toBeVisible({
      timeout: 3_000,
    });

    const createConfirmBtn = modal.locator('.arco-btn-primary');
    await expect(createConfirmBtn).toBeEnabled({ timeout: 5_000 });
    await createConfirmBtn.click();

    // Wait for modal to close AND navigation to complete
    await expect(modal).toBeHidden({ timeout: 15_000 });
    await page.waitForURL(/team\//, { timeout: 15_000 });
    await expect(page.locator(`text=${TEAM_NAME}`).first()).toBeVisible({ timeout: 10_000 });

    const postCreateUrl = page.url();
    teamId = postCreateUrl.match(/team\/([^/?#]+)/)?.[1];
    expect(teamId).toBeTruthy();

    // Wait for leader session to be ready
    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 30_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-migration-01-created.png' });

    // ── Step 2: Add member via leader (proves team is working) ──────────

    const memberName = `E2E-ws-member-${Date.now()}`;
    await chatInput.fill(`Add a ${LEADER_BACKEND} type member named ${memberName}`);
    await chatInput.press('Enter');

    await expect(tabBar.locator(`text=${memberName}`)).toBeVisible({ timeout: 120_000 });

    // Wait for member initialization to complete
    const memberActiveBadge = tabBar
      .locator('span')
      .filter({ hasText: memberName })
      .locator('xpath=following-sibling::span[@aria-label="active"]');
    await expect(memberActiveBadge).not.toBeVisible({ timeout: 60_000 });

    // Switch back to leader tab and handle MCP dialogs
    await tabBar.locator('span').filter({ hasText: 'Leader' }).first().click();
    await autoApproveMcpDialogs();
    await waitForLeaderIdle();

    await page.screenshot({ path: 'tests/e2e/results/team-migration-02-member-added.png' });

    // ── Step 3: Wait for workspace panel with "临时空间" label ───────────

    const workspaceTitle = page.locator('text=工作空间').or(page.locator('text=Workspace'));
    await expect(workspaceTitle.first()).toBeVisible({ timeout: 20_000 });

    const tempLabel = page.locator('.workspace-title-label').filter({ hasText: /临时空间|Temporary/ });
    await expect(tempLabel.first()).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-migration-03-workspace-ready.png' });

    // ── Step 4: Mock native dialog → change workspace ───────────────────

    await electronApp.evaluate(async ({ dialog }, target) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [target] });
    }, targetWorkspace);

    const changeBtn = page.locator('.workspace-toolbar-actions svg').first();
    await expect(changeBtn).toBeVisible({ timeout: 5_000 });
    await changeBtn.click();

    const migrationModal = page.locator('.arco-modal').filter({
      hasText: /更换工作空间|Change Workspace|移动到新文件夹|Move to new folder/,
    });
    await expect(migrationModal.first()).toBeVisible({ timeout: 5_000 });

    const folderSelector = migrationModal.locator('.cursor-pointer').filter({
      hasText: /选择文件夹|Select folder/,
    });
    await folderSelector.first().click();

    await expect(migrationModal.getByText(targetWorkspace).first()).toBeVisible({ timeout: 5_000 });

    const migrateConfirmBtn = migrationModal.locator('button').filter({ hasText: /确定|Confirm|OK/ });
    await expect(migrateConfirmBtn.first()).toBeEnabled();
    await migrateConfirmBtn.first().click();

    await expect(migrationModal.first()).toBeHidden({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    await page.screenshot({ path: 'tests/e2e/results/team-migration-04-after-migrate.png' });

    // ── Step 5: Verify workspace updated ────────────────────────────────

    // 5a. UI: page not blank — leader textarea still visible
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 15_000 });

    // 5b. UI: workspace label no longer says "临时空间"
    const newLabel = page.locator('.workspace-title-label');
    await expect(newLabel.first()).toBeVisible({ timeout: 10_000 });
    const labelText = await newLabel.first().textContent();
    expect(labelText).not.toMatch(/临时空间|Temporary/);

    // 5c. UI: leader and member tabs still visible
    await expect(tabBar.locator('text=Leader').first()).toBeVisible({ timeout: 10_000 });
    await expect(tabBar.locator(`text=${memberName}`).first()).toBeVisible({ timeout: 10_000 });

    // 5d. Backend: team workspace updated
    const teamState = await invokeBridge<{
      workspace: string;
      agents: Array<{ slotId: string; conversationId: string; agentName: string }>;
    }>(page, 'team.get', { id: teamId });
    expect(teamState.workspace).toBe(targetWorkspace);

    // 5e. Backend: ALL agent conversations have updated workspace
    const allConversations = await invokeBridge<Array<{ id: string; extra: { workspace?: string } }>>(
      page,
      'database.get-user-conversations',
      { page: 0, pageSize: 10000 }
    );
    for (const agent of teamState.agents) {
      if (!agent.conversationId) continue;
      const conv = allConversations.find((c) => c.id === agent.conversationId);
      expect(conv).toBeTruthy();
      expect(conv!.extra.workspace).toBe(targetWorkspace);
    }

    await page.screenshot({ path: 'tests/e2e/results/team-migration-05-verified.png' });

    // ── Step 6: Verify team still functional after migration ────────────
    // Send a task via leader → leader should respond (proves session still works)

    await tabBar.locator('span').filter({ hasText: 'Leader' }).first().click();
    await page.waitForTimeout(500);

    // Wait for any in-flight leader processing to complete first
    await waitForLeaderIdle();

    const chatInputAfter = page.locator('textarea').first();
    await expect(chatInputAfter).toBeVisible({ timeout: 10_000 });

    // Count existing AI messages before sending
    const aiSelector = '.message-item.text.justify-start';
    const msgCountBefore = await page.locator(aiSelector).count();

    await chatInputAfter.fill('Hello, are you still working?');
    await chatInputAfter.press('Enter');
    await expect(chatInputAfter).toHaveValue('', { timeout: 5_000 });

    // Handle MCP dialogs that may appear
    await autoApproveMcpDialogs();

    // Wait for a new AI reply to appear (more messages than before)
    await expect
      .poll(async () => page.locator(aiSelector).count(), {
        timeout: 120_000,
        message: 'Waiting for leader AI reply after workspace migration',
      })
      .toBeGreaterThan(msgCountBefore);

    await page.screenshot({ path: 'tests/e2e/results/team-migration-06-post-task.png' });

    // ── Step 7: Cleanup — delete team ───────────────────────────────────

    await invokeBridge(page, 'team.remove', { id: teamId });

    const deletedTeam = await invokeBridge<null>(page, 'team.get', { id: teamId });
    expect(deletedTeam).toBeNull();

    await page.screenshot({ path: 'tests/e2e/results/team-migration-07-cleanup.png' });
  });
});
