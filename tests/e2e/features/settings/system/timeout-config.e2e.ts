/**
 * Timeout Configuration E2E Tests
 *
 * Covers: prompt timeout (InputNumber, 30–3600s, step 30s),
 * agent idle timeout (InputNumber, 1–60min, step 5min).
 * All operations via UI — zero invokeBridge, zero mock.
 */

import { test, expect } from '../../../fixtures';
import { goToSettings, waitForSettle } from '../../../helpers/navigation';
import { takeScreenshot } from '../../../helpers/screenshots';

const PROMPT_TIMEOUT_DEFAULT = 300;
const AGENT_IDLE_TIMEOUT_DEFAULT = 5;

function promptTimeoutInput(page: import('@playwright/test').Page) {
  return page
    .locator('.arco-input-number')
    .filter({ has: page.locator('[class*="suffix"]:has-text("s")') })
    .first();
}

function agentIdleTimeoutInput(page: import('@playwright/test').Page) {
  return page
    .locator('.arco-input-number')
    .filter({ has: page.locator('[class*="suffix"]:has-text("min")') })
    .first();
}

function innerInput(wrapper: import('@playwright/test').Locator) {
  return wrapper.locator('input');
}

async function clearAndType(
  page: import('@playwright/test').Page,
  input: import('@playwright/test').Locator,
  value: string
) {
  await input.click();
  await page.keyboard.press('Meta+a');
  await input.fill(value);
}

async function readInputValue(input: import('@playwright/test').Locator): Promise<string> {
  return (await input.inputValue()).trim();
}

test.describe('Timeout Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page, 'system');
    await waitForSettle(page);
  });

  test.afterEach(async ({ page }) => {
    const promptInput = innerInput(promptTimeoutInput(page));
    await clearAndType(page, promptInput, String(PROMPT_TIMEOUT_DEFAULT));
    await promptInput.blur();
    await waitForSettle(page, 500);

    const agentInput = innerInput(agentIdleTimeoutInput(page));
    await clearAndType(page, agentInput, String(AGENT_IDLE_TIMEOUT_DEFAULT));
    await agentInput.blur();
    await waitForSettle(page, 500);
  });

  // ────────────────────────────────────────────────────────────────────────
  // TC-TIMEOUT-01: Prompt timeout — set a valid value
  // ────────────────────────────────────────────────────────────────────────

  test('TC-TIMEOUT-01: should update prompt timeout via InputNumber', async ({ page }) => {
    const wrapper = promptTimeoutInput(page);
    await expect(wrapper).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'timeout-config/tc-timeout-01/01-initial.png');

    const input = innerInput(wrapper);
    const initial = await readInputValue(input);
    expect(Number(initial)).toBe(PROMPT_TIMEOUT_DEFAULT);

    await clearAndType(page, input, '600');
    await input.blur();
    await waitForSettle(page, 500);

    const updated = await readInputValue(input);
    expect(Number(updated)).toBe(600);
    await takeScreenshot(page, 'timeout-config/tc-timeout-01/02-updated.png');
  });

  // ────────────────────────────────────────────────────────────────────────
  // TC-TIMEOUT-02: Agent idle timeout — set a valid value
  // ────────────────────────────────────────────────────────────────────────

  test('TC-TIMEOUT-02: should update agent idle timeout via InputNumber', async ({ page }) => {
    const wrapper = agentIdleTimeoutInput(page);
    await expect(wrapper).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'timeout-config/tc-timeout-02/01-initial.png');

    const input = innerInput(wrapper);
    const initial = await readInputValue(input);
    expect(Number(initial)).toBe(AGENT_IDLE_TIMEOUT_DEFAULT);

    await clearAndType(page, input, '30');
    await input.blur();
    await waitForSettle(page, 500);

    const updated = await readInputValue(input);
    expect(Number(updated)).toBe(30);
    await takeScreenshot(page, 'timeout-config/tc-timeout-02/02-updated.png');
  });

  // ────────────────────────────────────────────────────────────────────────
  // TC-TIMEOUT-03: Boundary clamping — prompt timeout
  // ────────────────────────────────────────────────────────────────────────

  test('TC-TIMEOUT-03: should clamp prompt timeout to boundaries on blur', async ({ page }) => {
    const wrapper = promptTimeoutInput(page);
    const input = innerInput(wrapper);
    await takeScreenshot(page, 'timeout-config/tc-timeout-03/01-initial.png');

    await clearAndType(page, input, '10');
    await input.blur();
    await waitForSettle(page, 500);

    const clampedLow = await readInputValue(input);
    expect(Number(clampedLow)).toBe(30);
    await takeScreenshot(page, 'timeout-config/tc-timeout-03/02-clamped-low.png');

    await clearAndType(page, input, '9999');
    await input.blur();
    await waitForSettle(page, 500);

    const clampedHigh = await readInputValue(input);
    expect(Number(clampedHigh)).toBe(3600);
    await takeScreenshot(page, 'timeout-config/tc-timeout-03/03-clamped-high.png');
  });

  // ────────────────────────────────────────────────────────────────────────
  // TC-TIMEOUT-04: Boundary clamping — agent idle timeout
  // ────────────────────────────────────────────────────────────────────────

  test('TC-TIMEOUT-04: should clamp agent idle timeout to boundaries on blur', async ({ page }) => {
    const wrapper = agentIdleTimeoutInput(page);
    const input = innerInput(wrapper);
    await takeScreenshot(page, 'timeout-config/tc-timeout-04/01-initial.png');

    await clearAndType(page, input, '0');
    await input.blur();
    await waitForSettle(page, 500);

    const clampedLow = await readInputValue(input);
    expect(Number(clampedLow)).toBeGreaterThanOrEqual(1);
    await takeScreenshot(page, 'timeout-config/tc-timeout-04/02-clamped-low.png');

    await clearAndType(page, input, '999');
    await input.blur();
    await waitForSettle(page, 500);

    const clampedHigh = await readInputValue(input);
    expect(Number(clampedHigh)).toBe(60);
    await takeScreenshot(page, 'timeout-config/tc-timeout-04/03-clamped-high.png');
  });
});
