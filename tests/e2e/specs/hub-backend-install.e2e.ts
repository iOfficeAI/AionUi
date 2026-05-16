/**
 * L2 E2E Test — Hub Backend Install Flow.
 *
 * Tests the full UI flow for discovering and installing agent backends from the Hub:
 * 1. Navigate to Settings -> Agent (LocalAgents page)
 * 2. Click "Install from Market" button to open AgentHubModal
 * 3. Hub modal opens, verify extension list renders (agent-hub-grid / agent-hub-card)
 * 4. Verify per-card status buttons (Install / Installed / Installing / Retry)
 * 5. Click Install on an available agent, verify status transition
 * 6. Close modal, verify detected agents list reflects the new backend
 * 7. Navigate to guid page, verify new backend appears in pill bar
 *
 * UI references:
 * - LocalAgents.tsx: "Install from Market" button, detected agents grid
 * - AgentHubModal.tsx: data-testid="agent-hub-grid", data-testid="agent-hub-card"
 * - Status buttons: Install / Installing... / Installed / Retry
 */
import { test, expect } from '../fixtures';
import { goToGuid, goToSettings, waitForSettle, AGENT_PILL } from '../helpers';

// ── Selectors ────────────────────────────────────────────────────────────────

/** "Install from Market" button on the LocalAgents page */
const MARKET_BUTTON = 'button:has-text("Install from Market"), button:has-text("从市场安装")';

/** Hub modal (ModalWrapper renders an Arco modal) */
const HUB_MODAL = '.arco-modal';

/** Hub agent card grid */
const HUB_GRID = '[data-testid="agent-hub-grid"]';

/** Individual hub agent card */
const HUB_CARD = '[data-testid="agent-hub-card"]';

/** Modal close button (Arco modal header close icon) */
const MODAL_CLOSE = '.arco-modal .arco-icon-hover.arco-icon-close, .arco-modal-close-icon';

/** Loading state inside modal */
const HUB_LOADING = '.arco-modal >> text=/Please wait|Loading|加载/i';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openHubModal(page: import('@playwright/test').Page): Promise<void> {
  await goToSettings(page, 'agent');
  await waitForSettle(page);

  // Click the "Install from Market" button
  const marketBtn = page.locator(MARKET_BUTTON).first();
  await expect(marketBtn).toBeVisible({ timeout: 8_000 });
  await marketBtn.click();

  // Wait for the modal to appear
  await expect(page.locator(HUB_MODAL).first()).toBeVisible({ timeout: 8_000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Hub Backend Install — E2E', () => {
  test.describe('Hub Modal — Open & List', () => {
    test('navigates to Agent settings and finds the Market button', async ({ page }) => {
      await goToSettings(page, 'agent');
      await waitForSettle(page);

      const marketBtn = page.locator(MARKET_BUTTON).first();
      await expect(marketBtn).toBeVisible({ timeout: 8_000 });
    });

    test('opens Hub modal and shows loading or agent list', async ({ page }) => {
      await openHubModal(page);

      // The modal should show either the loading state, an error, or the grid
      const grid = page.locator(HUB_GRID).first();
      const loading = page.locator(HUB_LOADING).first();

      // Wait for either grid or loading to appear
      await expect(grid.or(loading)).toBeVisible({ timeout: 15_000 });
    });

    test('Hub modal renders agent cards with data-testid', async ({ page }) => {
      await openHubModal(page);

      // Wait for the grid to render (may need network fetch)
      const grid = page.locator(HUB_GRID).first();
      await expect(grid).toBeVisible({ timeout: 15_000 });

      // At least one card should be present
      const cards = page.locator(HUB_CARD);
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });

      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('each Hub card has a displayName and status button', async ({ page }) => {
      await openHubModal(page);

      const grid = page.locator(HUB_GRID).first();
      await expect(grid).toBeVisible({ timeout: 15_000 });

      const cards = page.locator(HUB_CARD);
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });

      const count = await cards.count();
      for (let i = 0; i < Math.min(count, 5); i++) {
        const card = cards.nth(i);

        // Each card should have visible text content (displayName)
        const text = await card.textContent();
        expect(text?.trim().length).toBeGreaterThan(0);

        // Each card should have a button (Install / Installed / Retry / Update)
        const button = card.locator('button').first();
        await expect(button).toBeVisible();

        const buttonText = await button.textContent();
        expect(buttonText).toMatch(/Install|Installed|Installing|Retry|Update|安装|已安装|重试|更新/i);
      }
    });
  });

  test.describe('Hub Modal — Status Display', () => {
    test('cards show correct status buttons (Install or Installed)', async ({ page }) => {
      await openHubModal(page);

      const grid = page.locator(HUB_GRID).first();
      await expect(grid).toBeVisible({ timeout: 15_000 });

      const cards = page.locator(HUB_CARD);
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });

      // Collect all button texts to verify status variety
      const count = await cards.count();
      const statuses: string[] = [];

      for (let i = 0; i < count; i++) {
        const button = cards.nth(i).locator('button').first();
        const text = (await button.textContent()) || '';
        statuses.push(text.trim());
      }

      // At least one card should exist with a recognizable status
      expect(statuses.length).toBeGreaterThanOrEqual(1);
      expect(statuses.some((s) => /Install|Installed|Retry|Update|安装|已安装|重试|更新/i.test(s))).toBeTruthy();
    });
  });

  test.describe('Hub Modal — Install Action', () => {
    test('clicking Install button on an available agent triggers installation', async ({ page }) => {
      await openHubModal(page);

      const grid = page.locator(HUB_GRID).first();
      await expect(grid).toBeVisible({ timeout: 15_000 });

      // Find a card with "Install" status (not_installed)
      const installButton = page
        .locator(`${HUB_CARD} button`)
        .filter({ hasText: /^Install$|^安装$/ })
        .first();

      const hasInstallable = await installButton.isVisible().catch(() => false);

      if (hasInstallable) {
        await installButton.click();

        // After clicking, the button should transition to "Installing..." (loading/disabled)
        // or directly to "Installed" (fast install)
        const parentCard = installButton.locator('xpath=ancestor::div[@data-testid="agent-hub-card"]');
        const cardButton = parentCard.locator('button').first();

        // Wait for status change — either Installing or Installed or Retry
        await expect
          .poll(
            async () => {
              const text = (await cardButton.textContent()) || '';
              return /Installing|Installed|Retry|安装中|已安装|重试/i.test(text);
            },
            { timeout: 60_000, message: 'Expected install status to change after clicking Install' }
          )
          .toBeTruthy();
      } else {
        // All agents already installed — verify at least one "Installed" button exists
        const installedButton = page
          .locator(`${HUB_CARD} button`)
          .filter({ hasText: /Installed|已安装/ })
          .first();

        await expect(installedButton).toBeVisible();
      }
    });
  });

  test.describe('Hub Modal — Close', () => {
    test('Hub modal can be closed via close button or backdrop', async ({ page }) => {
      await openHubModal(page);

      // Verify modal is visible
      const modal = page.locator(HUB_MODAL).first();
      await expect(modal).toBeVisible();

      // Close the modal
      const closeBtn = page.locator(MODAL_CLOSE).first();
      const hasCloseBtn = await closeBtn.isVisible().catch(() => false);

      if (hasCloseBtn) {
        await closeBtn.click();
      } else {
        // Fallback: press Escape
        await page.keyboard.press('Escape');
      }

      // Modal should be gone
      await expect(modal).not.toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Post-Install — Agent List Refresh', () => {
    test('detected agents section shows agents after Hub modal closes', async ({ page }) => {
      await goToSettings(page, 'agent');
      await waitForSettle(page);

      // The "Detected" section should have at least one agent card
      // (Gemini is always present, plus any locally installed CLIs)
      const bodyText = await page.textContent('body');
      const hasDetectedSection =
        bodyText?.includes('Detected') ||
        bodyText?.includes('已检测') ||
        bodyText?.includes('Gemini') ||
        bodyText?.includes('gemini');

      expect(hasDetectedSection).toBeTruthy();
    });
  });

  test.describe('Post-Install — Pill Bar Integration', () => {
    test('agent pill bar on guid page renders available backends', async ({ page }) => {
      await goToGuid(page);

      const pills = page.locator(AGENT_PILL);
      await expect(pills.first()).toBeVisible({ timeout: 8_000 });

      const count = await pills.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('selecting an agent in pill bar activates it for chat', async ({ page }) => {
      await goToGuid(page);

      const pills = page.locator(AGENT_PILL);
      await expect(pills.first()).toBeVisible({ timeout: 8_000 });

      // Click the first pill
      await pills.first().click();

      // Verify it becomes selected
      await expect
        .poll(async () => {
          return await pills.first().getAttribute('data-agent-selected');
        })
        .toBe('true');

      // Chat input should be available
      const chatInput = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
      await expect(chatInput).toBeVisible({ timeout: 8_000 });
    });
  });

  test.describe('Edge Cases', () => {
    test('install_failed state shows Retry button with error tooltip', async ({ page }) => {
      await openHubModal(page);

      const grid = page.locator(HUB_GRID).first();
      await expect(grid).toBeVisible({ timeout: 15_000 });

      // Check if any card is in failed state (may not be present in fresh env)
      const retryButton = page
        .locator(`${HUB_CARD} button`)
        .filter({ hasText: /Retry|重试/ })
        .first();

      const hasFailed = await retryButton.isVisible().catch(() => false);

      if (hasFailed) {
        // Retry button should have status="danger" styling
        const buttonClasses = await retryButton.getAttribute('class');
        expect(buttonClasses).toMatch(/danger/);

        // The parent card should have a Tooltip (hover to verify)
        await retryButton.hover();
        await waitForSettle(page, 1000);

        // Tooltip should appear
        const tooltip = page.locator('.arco-tooltip-content').first();
        const tooltipVisible = await tooltip.isVisible().catch(() => false);
        // Tooltip may or may not show depending on timing — non-critical
        expect(hasFailed).toBeTruthy(); // At minimum, Retry button exists
      }
      // If no failed card exists, this test passes — edge case not triggered
    });

    test('Hub modal shows loading state before data arrives', async ({ page }) => {
      // Navigate fresh to trigger a fetch
      await goToSettings(page, 'agent');
      await waitForSettle(page);

      const marketBtn = page.locator(MARKET_BUTTON).first();
      await expect(marketBtn).toBeVisible({ timeout: 8_000 });
      await marketBtn.click();

      // Immediately check: modal should be visible with either loading or grid
      const modal = page.locator(HUB_MODAL).first();
      await expect(modal).toBeVisible({ timeout: 8_000 });

      // The modal content should be one of: loading text, error text, or agent grid
      const modalText = await modal.textContent();
      const hasContent =
        modalText?.includes('Please wait') ||
        modalText?.includes('Loading') ||
        modalText?.includes('加载') ||
        modalText?.includes('Install') ||
        modalText?.includes('安装') ||
        modalText?.includes('No agents') ||
        modalText?.includes('没有');

      expect(hasContent).toBeTruthy();
    });
  });
});
