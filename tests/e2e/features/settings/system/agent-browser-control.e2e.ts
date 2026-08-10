/**
 * Agent browser control toggle — the production-visible switch.
 *
 * Regression coverage for a specific gap: agent browser control defaults to on, but the
 * only switch for it used to live in developer settings, a section that returns `null` in
 * packaged builds. Production users therefore had no way to turn off a capability that was
 * already enabled.
 *
 * These tests assert the switch is reachable in the always-mounted in-app browser section,
 * defaults to on, and explains itself — driven through the UI, no bridge invokes.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle } from '../../../helpers/navigation';

/** The in-app browser section, located by its heading rather than DOM position. */
function browserSection(page: import('@playwright/test').Page) {
  return page
    .locator('div.bg-2')
    .filter({ hasText: /应用內瀏覽器|应用内浏览器|In-app browser/i })
    .first();
}

/** The row whose label is the agent-control toggle. */
function agentControlRow(page: import('@playwright/test').Page) {
  return browserSection(page)
    .locator('div.flex.items-center.justify-between')
    .filter({ hasText: /允許 Agent|允许 Agent|agent use the in-app browser/i })
    .first();
}

test.describe('Agent browser control toggle', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'system');
    await waitForSettle(page);
  });

  test('is visible outside developer settings', async ({ page }) => {
    /**
     * The core of the regression: this row must live in a section that renders in packaged
     * builds. Developer settings returns null there, so a switch placed inside it would be
     * unreachable for exactly the users who need it.
     */
    await expect(browserSection(page)).toBeVisible({ timeout: 15_000 });
    await expect(agentControlRow(page)).toBeVisible({ timeout: 15_000 });
  });

  test('defaults to on and carries an explanation', async ({ page }) => {
    const row = agentControlRow(page);
    await expect(row).toBeVisible({ timeout: 15_000 });

    /**
     * Default-on is a deliberate product decision, so it is worth pinning: the capability
     * ships enabled, and the switch exists so users can opt out.
     */
    await expect(row.locator('.arco-switch')).toHaveClass(/arco-switch-checked/, { timeout: 10_000 });

    /**
     * A security switch with no explanation is not a real choice. Assert the description
     * exists and is substantive rather than matching exact copy, which would break on any
     * wording change.
     */
    const description = await row.locator('.text-12px').first().innerText();
    expect(description.trim().length).toBeGreaterThan(30);
  });

  test('keeps the browsing-data control alongside it', async ({ page }) => {
    // The section previously held only "clear browsing data"; adding the toggle must not
    // have displaced it.
    const section = browserSection(page);
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section.locator('.arco-btn-status-danger')).toBeVisible({ timeout: 10_000 });
  });
});
