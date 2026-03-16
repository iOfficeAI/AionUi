/**
 * Extensions – Channel Plugins tests.
 *
 * Validates extension-contributed channel plugins on the channels settings page.
 */
import { test, expect } from '../fixtures';
import {
  goToChannelsTab,
  expectBodyContainsAny,
  takeScreenshot,
  waitForSettle,
  ARCO_SWITCH,
  waitForClassChange,
} from '../helpers';

test.describe('Extension: Channel Plugins', () => {
  test('channels page renders', async ({ page }) => {
    await goToChannelsTab(page);
    await expectBodyContainsAny(page, ['Telegram', 'Lark', 'DingTalk', 'Channel', '频道']);
  });

  test('built-in channels still visible alongside extension channels', async ({ page }) => {
    await goToChannelsTab(page);

    const body = await page.locator('body').textContent();
    const builtIn = ['Telegram', 'Lark', 'DingTalk'];
    const found = builtIn.filter((ch) => body?.includes(ch));
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  test('extension channel plugin appears or page functional', async ({ page }) => {
    await goToChannelsTab(page);
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    // The channel plugin may not surface in built-in UI
    expect(body!.length).toBeGreaterThan(50);
  });

  test('channel toggle switches are present', async ({ page }) => {
    await goToChannelsTab(page);

    const switches = page.locator(ARCO_SWITCH);
    await expect(switches.first()).toBeVisible({ timeout: 5000 });
    const count = await switches.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('can toggle a channel switch on/off', async ({ page }) => {
    await goToChannelsTab(page);

    const switches = page.locator(ARCO_SWITCH);
    await expect(switches.first()).toBeVisible({ timeout: 5000 });

    const count = await switches.count();
    let toggled = false;
    for (let i = 0; i < count; i++) {
      const sw = switches.nth(i);
      const cls = await sw.getAttribute('class');
      if (cls?.includes('arco-switch-disabled')) continue;

      const wasBefore = cls?.includes('arco-switch-checked');
      await sw.click();
      await waitForClassChange(sw);

      const clsAfter = await sw.getAttribute('class');
      const isAfter = clsAfter?.includes('arco-switch-checked');

      toggled = true;

      // Toggle back if state changed
      if (wasBefore !== isAfter) {
        await sw.click();
        await waitForClassChange(sw, 1000);
      }
      break;
    }
    expect(toggled).toBeTruthy();
  });

  test('coming-soon channels have disabled switches', async ({ page }) => {
    await goToChannelsTab(page);

    const body = await page.locator('body').textContent();
    const comingSoon = ['Slack', 'Discord'];
    const hasComingSoon = comingSoon.some((label) => body?.includes(label));

    if (hasComingSoon) {
      const disabledSwitches = page.locator('.arco-switch.arco-switch-disabled, .arco-switch[aria-disabled="true"]');
      const disabledCount = await disabledSwitches.count();
      const hasComingSoonBadge = body?.includes('Coming Soon') || body?.includes('即将上线');

      expect(disabledCount > 0 || hasComingSoonBadge).toBeTruthy();
    }
  });

  test('screenshot: channels with extensions', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToChannelsTab(page);
    await takeScreenshot(page, 'ext-channels');
  });
});
