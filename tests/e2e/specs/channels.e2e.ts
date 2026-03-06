/**
 * Channels – enable / disable toggle tests.
 *
 * Covers:
 *  - Navigating to the channels settings (webui tab → channels sub-tab)
 *  - Channel list renders with known channels
 *  - Toggle switches are visible for active channels
 *  - "Coming soon" channels have disabled toggles
 */
import { test, expect } from '../fixtures';
import { goToChannelsTab, expectBodyContainsAny, ARCO_SWITCH, takeScreenshot, waitForClassChange } from '../helpers';

test.describe('Channels', () => {
  // ── Channel list ─────────────────────────────────────────────────────────

  test('channels settings page renders', async ({ page }) => {
    await goToChannelsTab(page);
    await expectBodyContainsAny(page, ['Telegram', 'Lark', 'DingTalk', 'Slack', 'Discord', '频道', 'Channel']);
  });

  test('known channels are listed', async ({ page }) => {
    await goToChannelsTab(page);
    const body = await page.locator('body').textContent();

    // At least two of the active channels should appear
    const activeChannels = ['Telegram', 'Lark', 'DingTalk'];
    const found = activeChannels.filter((ch) => body?.includes(ch));
    expect(found.length, `Expected at least 2 active channels, found: ${found.join(', ')}`).toBeGreaterThanOrEqual(2);
  });

  test('toggle switches are visible for channels', async ({ page }) => {
    await goToChannelsTab(page);

    // Each channel item is inside a Collapse, with a Switch in the header
    const switches = page.locator(ARCO_SWITCH);
    await expect(switches.first()).toBeVisible({ timeout: 5000 });

    const count = await switches.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('can toggle a channel switch', async ({ page }) => {
    await goToChannelsTab(page);

    const switches = page.locator(ARCO_SWITCH);
    await expect(switches.first()).toBeVisible({ timeout: 5000 });

    // Find the first enabled (not disabled) switch
    const count = await switches.count();
    let toggled = false;
    for (let i = 0; i < count; i++) {
      const sw = switches.nth(i);
      const isDisabled = await sw.getAttribute('class');
      if (isDisabled?.includes('arco-switch-disabled')) continue;

      // Read initial state
      const wasBefore = isDisabled?.includes('arco-switch-checked');
      await sw.click();

      // Wait for class to change (state transition)
      await waitForClassChange(sw);

      const classAfter = await sw.getAttribute('class');
      const isAfter = classAfter?.includes('arco-switch-checked');

      toggled = true;

      // Toggle back to restore state
      if (wasBefore !== isAfter) {
        await sw.click();
        await waitForClassChange(sw, 1000);
      }
      break;
    }
    // At least one non-disabled switch was found and clicked
    expect(toggled).toBeTruthy();
  });

  test('coming-soon channels have disabled switches', async ({ page }) => {
    await goToChannelsTab(page);

    const body = await page.locator('body').textContent();

    // If Slack or Discord is visible, coming-soon channels should be represented
    // by disabled switches and/or coming-soon badges (depends on Arco class output).
    const comingSoonLabels = ['Slack', 'Discord'];
    const hasComingSoon = comingSoonLabels.some((label) => body?.includes(label));

    if (hasComingSoon) {
      const disabledSwitches = page.locator('.arco-switch.arco-switch-disabled, .arco-switch[aria-disabled="true"]');
      const disabledCount = await disabledSwitches.count();
      const hasComingSoonBadge = body?.includes('Coming Soon') || body?.includes('即将上线');

      expect(disabledCount > 0 || hasComingSoonBadge).toBeTruthy();
    }
  });

  test('screenshot: channels settings', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToChannelsTab(page);
    await takeScreenshot(page, 'channels-settings');
  });
});
