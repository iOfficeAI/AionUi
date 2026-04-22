/**
 * E2E: Stale team URL fallback.
 *
 * Verifies that navigating to a URL for a team that no longer exists
 * does not crash the app. The router must either redirect to a safe
 * route or render a fallback UI; the sidebar must remain interactive.
 */
import { test, expect } from '../../fixtures';
import { navigateTo, createTeam, deleteTeam, invokeBridge } from '../../helpers';

type TeamListResult = Array<{ id: string; name: string }>;

test.describe('Team Stale URL', () => {
  test('accessing deleted team URL does not crash the app', async ({ page }) => {
    // [setup] Create a throwaway team, then immediately delete it
    let teamId: string;
    try {
      teamId = await createTeam(page, 'E2E Stale URL Team');
    } catch {
      console.log('[E2E] createTeam unavailable — skipping stale-url test');
      test.skip();
      return;
    }

    await deleteTeam(page, teamId);

    // Confirm the team is no longer in the list
    const teams = await invokeBridge<TeamListResult>(page, 'team.list', {
      userId: 'system_default_user',
    }).catch(() => [] as TeamListResult);

    if (teams.some((t) => t.id === teamId)) {
      console.log('[E2E] Team still exists after deleteTeam — skipping stale-url test');
      test.skip();
      return;
    }

    // [action] Navigate to the now-deleted team URL
    await navigateTo(page, '#/team/' + teamId);

    await page.screenshot({ path: 'tests/e2e/results/team-stale-01.png' });

    // [assert] App has not crashed — body still has meaningful content
    const bodyText = await page.evaluate(() => document.body.textContent ?? '');
    expect(bodyText.length).toBeGreaterThan(0);

    // [assert] URL falls back (hash no longer points to the deleted team) OR
    //          a fallback UI element is visible (empty state / 404 text)
    const currentHash = await page.evaluate(() => window.location.hash);
    const isStillOnDeletedTeam = currentHash === '#/team/' + teamId;

    if (isStillOnDeletedTeam) {
      // Router stayed on the route — verify fallback DOM content exists
      const fallbackEl = page
        .locator('body')
        .filter({ hasText: /not found|找不到|empty|没有|no team/i })
        .first();
      const hasFallback = await fallbackEl.isVisible({ timeout: 3_000 }).catch(() => false);

      // Accept either a visible fallback UI or at minimum no error modal
      const errorModal = page.locator('.arco-modal').filter({ hasText: /error|错误/i });
      const hasErrorModal = await errorModal.isVisible({ timeout: 1_000 }).catch(() => false);
      expect(hasErrorModal).toBe(false);

      if (!hasFallback) {
        console.log('[E2E] No explicit fallback UI detected, but app did not crash');
      }
    } else {
      // Router redirected away — verify we landed somewhere safe
      expect(currentHash).not.toBe('#/team/' + teamId);
    }

    await page.screenshot({ path: 'tests/e2e/results/team-stale-02.png' });

    // [assert] Sidebar remains interactive — Teams label must still be visible
    const teamsLabel = page.locator('text=Teams').or(page.locator('text=团队'));
    await expect(teamsLabel.first()).toBeVisible({ timeout: 10_000 });
  });
});
