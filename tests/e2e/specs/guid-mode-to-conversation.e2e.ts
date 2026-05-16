/**
 * Guid Mode → Conversation Mode Sync — E2E tests.
 *
 * For each agent backend, verifies the permission mode set on the Guid page
 * is correctly carried into the conversation page.
 * Each agent runs TWO conversation cycles with different modes to confirm
 * mode switching works end-to-end.
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  deleteConversation,
  AGENT_PILL,
  agentPillByBackend,
  MODE_SELECTOR,
} from '../helpers';

test.describe.configure({ timeout: 240_000 });

/**
 * Open the mode dropdown and collect all available mode values.
 * Closes the dropdown afterward.
 */
async function getAvailableModes(page: import('@playwright/test').Page): Promise<string[]> {
  const selector = page.locator(MODE_SELECTOR);
  await selector.click();
  await page.locator('[data-mode-value]').first().waitFor({ state: 'visible', timeout: 5_000 });
  const modes = await page
    .locator('[data-mode-value]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-mode-value')).filter(Boolean) as string[]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return modes;
}

/**
 * Select a specific mode via the dropdown and wait for confirmation.
 */
async function selectMode(page: import('@playwright/test').Page, modeValue: string): Promise<void> {
  const selector = page.locator(MODE_SELECTOR);
  await selector.click();
  const menuItem = page.locator(`[data-mode-value="${modeValue}"]`);
  await menuItem.waitFor({ state: 'visible', timeout: 5_000 });
  await menuItem.click();
  await expect(selector).toHaveAttribute('data-current-mode', modeValue, { timeout: 5_000 });
}

/**
 * Wait for the conversation page's mode-selector to show the expected mode.
 */
async function waitForConversationMode(
  page: import('@playwright/test').Page,
  expectedMode: string,
  timeoutMs = 60_000
): Promise<void> {
  const selector = page.locator(MODE_SELECTOR);
  await expect
    .poll(
      async () => {
        const visible = await selector.isVisible().catch(() => false);
        if (!visible) return '__not_visible__';
        return (await selector.getAttribute('data-current-mode')) ?? '__no_attr__';
      },
      { timeout: timeoutMs, message: `Waiting for conversation mode to become "${expectedMode}"` }
    )
    .toBe(expectedMode);
}

/**
 * Run one conversation cycle: set mode on guid → send message → verify mode in conversation → cleanup.
 */
async function runModeVerificationCycle(
  page: import('@playwright/test').Page,
  backend: string,
  targetMode: string
): Promise<void> {
  await goToGuid(page);
  await selectAgent(page, backend);

  const modeSelector = page.locator(MODE_SELECTOR);
  await modeSelector.waitFor({ state: 'visible', timeout: 10_000 });

  await selectMode(page, targetMode);

  const conversationId = await sendMessageFromGuid(page, 'Hello, reply briefly.');
  expect(conversationId).toBeTruthy();

  try {
    await waitForSessionActive(page, 120_000);
    await waitForConversationMode(page, targetMode);
  } finally {
    await deleteConversation(page, conversationId);
  }
}

const BACKENDS = ['gemini', 'aionrs', 'codex', 'claude'] as const;

test.describe('Guid Mode → Conversation Sync', () => {
  for (const backend of BACKENDS) {
    test(`${backend}: two mode switches both carry into conversation`, async ({ page }) => {
      await goToGuid(page);

      // Check agent availability
      const pill = page.locator(agentPillByBackend(backend));
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {});
      if (!(await pill.isVisible().catch(() => false))) {
        test.skip(true, `${backend} agent not available`);
        return;
      }

      await selectAgent(page, backend);

      // Check mode selector visibility
      const modeSelector = page.locator(MODE_SELECTOR);
      const modeSelectorVisible = await modeSelector
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!modeSelectorVisible) {
        test.skip(true, `${backend} mode selector not visible on guid page`);
        return;
      }

      // Get available modes
      const availableModes = await getAvailableModes(page);
      if (availableModes.length < 2) {
        test.skip(true, `${backend} has fewer than 2 modes`);
        return;
      }

      // Pick two different modes to test
      const modeA = availableModes[availableModes.length - 1];
      const modeB = availableModes[0];

      // Cycle 1: set modeA → verify in conversation
      await runModeVerificationCycle(page, backend, modeA);

      // Cycle 2: set modeB → verify in conversation
      await runModeVerificationCycle(page, backend, modeB);
    });
  }
});
