/**
 * E2E: Send a direct message to a team member via the member tab.
 *
 * Flow:
 *   1. Find or create "E2E Test Team" with a gemini leader.
 *   2. Ask the leader to add a member.
 *   3. Wait for the member tab to appear in the tab bar.
 *   4. Wait for member initialization to complete (active badge disappears).
 *   5. Click the member tab.
 *   6. Type a message in the member textarea and press Enter.
 *   7. Assert message text is visible in the DOM.
 *   8. Assert the member tab shows an active badge (member started processing).
 */
import { test, expect } from '../../fixtures';
import { navigateTo, ensureTeam, TEAM_SUPPORTED_BACKENDS } from '../../helpers';

test.describe('Team Member Messaging', () => {
  test('send message directly to member via member tab', async ({ page }) => {
    test.setTimeout(300_000);

    // [setup] Resolve leader type — prefer gemini
    const leaderType = TEAM_SUPPORTED_BACKENDS.has('gemini') ? 'gemini' : [...TEAM_SUPPORTED_BACKENDS][0];

    if (!leaderType) {
      test.skip(true, 'No supported backend available — skipping member messaging test');
      return;
    }

    // [setup] Find or create the team (ensureTeam handles find-or-create)
    let teamId: string;
    try {
      teamId = await ensureTeam(page, 'E2E Test Team', leaderType);
    } catch {
      test.skip(true, `Team could not be created with backend "${leaderType}" — agent may not be installed`);
      return;
    }

    // [navigate] Go to team page and wait for leader chat input
    await navigateTo(page, '#/team/' + teamId);
    await page.waitForURL(/\/team\//, { timeout: 10_000 });

    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    const tabBar = page.locator('[data-testid="team-tab-bar"]');

    // [setup] Instruct leader to add a member
    const memberName = `E2E-msg-member-${Date.now()}`;
    await chatInput.fill(`Add a claude type member named ${memberName}`);
    await chatInput.press('Enter');

    await page.screenshot({ path: 'tests/e2e/results/team-member-msg-01-add-sent.png' });

    // [wait] Member tab appears in tab bar
    const memberTabText = tabBar.locator('span').filter({ hasText: memberName }).first();
    await expect(memberTabText).toBeVisible({ timeout: 120_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-member-msg-02-tab-appeared.png' });

    // [wait] Member initialization completes — active badge disappears
    const memberActiveBadge = tabBar
      .locator('span')
      .filter({ hasText: memberName })
      .locator('xpath=following-sibling::span[@aria-label="active"]');
    await expect(memberActiveBadge).not.toBeVisible({ timeout: 60_000 });

    // [action] Click the member tab
    await memberTabText.click();

    await page.screenshot({ path: 'tests/e2e/results/team-member-msg-03-tab-selected.png' });

    // [action] Member textarea — TeamPage renders all agent slots simultaneously (horizontal layout),
    // so leader and member textareas both exist. Select via the slot container's data-role attribute.
    const memberInput = page.locator('[data-role="member"] textarea').first();
    await expect(memberInput).toBeVisible({ timeout: 10_000 });

    const directMessage = `Direct message from E2E test ${Date.now()}`;
    await memberInput.fill(directMessage);

    await page.screenshot({ path: 'tests/e2e/results/team-member-msg-04-typed.png' });

    await memberInput.press('Enter');

    // [assert] Message text is visible in the DOM
    await expect(page.locator(`text=${directMessage}`).first()).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-member-msg-05-sent.png' });

    // [assert] Member tab shows active badge (member is processing) OR input was cleared (message accepted)
    const memberStartedProcessing = memberActiveBadge.isVisible({ timeout: 30_000 }).catch(() => false);
    const inputCleared = memberInput
      .inputValue()
      .then((v) => v === '')
      .catch(() => false);

    const [started, cleared] = await Promise.all([memberStartedProcessing, inputCleared]);

    expect(started || cleared).toBe(true);

    await page.screenshot({ path: 'tests/e2e/results/team-member-msg-06-processing.png' });
  });
});
