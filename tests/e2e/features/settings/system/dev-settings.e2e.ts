/**
 * DevSettings E2E Tests
 *
 * Covers: DevTools toggle, CDP switch, CDP URL display, MCP config collapse.
 * Only visible in dev mode — gracefully skips when hidden.
 * All operations via UI — zero invokeBridge, zero mock.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle, waitForClassChange } from '../../../helpers/navigation';
import { takeScreenshot } from '../../../helpers/screenshots';
import { ARCO_SWITCH } from '../../../helpers/selectors';

async function scrollToDevSettings(page: import('@playwright/test').Page): Promise<boolean> {
  const btn = page.locator('button:has-text("DevTools")').first();
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  return btn.isVisible({ timeout: 3_000 }).catch(() => false);
}

function devSection(page: import('@playwright/test').Page) {
  const btn = page.locator('button:has-text("DevTools")').first();
  return btn.locator('xpath=ancestor::div[contains(@class,"space-y-12px")]').first();
}

test.describe('DevSettings', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'system');
    await waitForSettle(page);
  });

  test('TC-DEV-01: DevTools button is visible with correct label', async ({ page }) => {
    const visible = await scrollToDevSettings(page);
    if (!visible) {
      test.skip(true, 'DevSettings not visible — not in dev mode');
      return;
    }

    const btn = page.locator('button:has-text("DevTools")').first();
    await expect(btn).toBeVisible();
    const text = await btn.textContent();
    expect(text).toBeTruthy();
    expect(text).toMatch(/DevTools/i);
    await takeScreenshot(page, 'dev-settings/tc-dev-01/01-visible.png');
  });

  test('TC-DEV-02: should toggle CDP switch', async ({ page }) => {
    const visible = await scrollToDevSettings(page);
    if (!visible) {
      test.skip(true, 'DevSettings not visible — not in dev mode');
      return;
    }

    const section = devSection(page);
    const cdpSwitch = section.locator(ARCO_SWITCH).first();
    await expect(cdpSwitch).toBeVisible();
    const wasChecked = await cdpSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    await takeScreenshot(page, 'dev-settings/tc-dev-02/01-before.png');

    await cdpSwitch.click();
    await waitForClassChange(cdpSwitch);
    expect(await cdpSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'))).toBe(!wasChecked);
    await takeScreenshot(page, 'dev-settings/tc-dev-02/02-toggled.png');

    await cdpSwitch.click();
    await waitForClassChange(cdpSwitch);
    expect(await cdpSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'))).toBe(wasChecked);
    await takeScreenshot(page, 'dev-settings/tc-dev-02/03-restored.png');
  });

  test('TC-DEV-03: should display CDP URL with port, Link and Copy buttons', async ({ page }) => {
    const visible = await scrollToDevSettings(page);
    if (!visible) {
      test.skip(true, 'DevSettings not visible — not in dev mode');
      return;
    }

    const section = devSection(page);
    const cdpSwitch = section.locator(ARCO_SWITCH).first();
    const wasChecked = await cdpSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    if (!wasChecked) {
      await cdpSwitch.click();
      await waitForClassChange(cdpSwitch);
    }

    const portText = section.locator('text=/127\\.0\\.0\\.1:\\d+/').first();
    const portVisible = await portText.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!portVisible) {
      if (!wasChecked) {
        await cdpSwitch.click();
        await waitForClassChange(cdpSwitch);
      }
      test.skip(true, 'CDP port not available');
      return;
    }

    await expect(portText).toBeVisible();
    const urlRow = portText.locator('xpath=ancestor::div[contains(@class,"flex")]').first();
    const btnCount = await urlRow.locator('button').count();
    expect(btnCount).toBe(2);
    await takeScreenshot(page, 'dev-settings/tc-dev-03/01-url-and-buttons.png');

    if (!wasChecked) {
      await cdpSwitch.click();
      await waitForClassChange(cdpSwitch);
    }
  });

  test('TC-DEV-04: should expand MCP config and show code block with Copy', async ({ page }) => {
    const visible = await scrollToDevSettings(page);
    if (!visible) {
      test.skip(true, 'DevSettings not visible — not in dev mode');
      return;
    }

    const section = devSection(page);
    const cdpSwitch = section.locator(ARCO_SWITCH).first();
    const wasChecked = await cdpSwitch.evaluate((el) => el.classList.contains('arco-switch-checked'));
    if (!wasChecked) {
      await cdpSwitch.click();
      await waitForClassChange(cdpSwitch);
    }

    const collapseHeaders = section.locator('.arco-collapse-item-header');
    const headerCount = await collapseHeaders.count().catch(() => 0);
    if (headerCount === 0) {
      if (!wasChecked) {
        await cdpSwitch.click();
        await waitForClassChange(cdpSwitch);
      }
      test.skip(true, 'MCP Collapse not available — CDP port may not be active');
      return;
    }

    const firstHeader = collapseHeaders.first();
    await expect(firstHeader).toBeVisible();
    const copyBtn = firstHeader.locator('button').first();
    await expect(copyBtn).toBeVisible();
    await takeScreenshot(page, 'dev-settings/tc-dev-04/01-collapsed.png');

    await firstHeader.click();
    const preBlock = section.locator('pre').first();
    await expect(preBlock).toBeVisible();
    expect(await preBlock.textContent()).toContain('mcpServers');
    await takeScreenshot(page, 'dev-settings/tc-dev-04/02-expanded.png');

    await firstHeader.click();
    await page
      .waitForFunction((sel) => document.querySelector(sel)?.clientHeight === 0, '.arco-collapse-item-content', {
        timeout: 3_000,
      })
      .catch(() => {});

    if (!wasChecked) {
      await cdpSwitch.click();
      await waitForClassChange(cdpSwitch);
    }
  });
});
