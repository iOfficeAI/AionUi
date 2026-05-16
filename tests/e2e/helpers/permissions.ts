import type { Locator, Page } from '@playwright/test';

const PERMISSION_CARD_SELECTOR = '[data-testid="message-permission-card"], [data-testid="message-acp-permission-card"]';

async function clickPreferredPermissionOption(card: Locator): Promise<boolean> {
  const preferredById = card
    .locator(
      '[data-testid*="option-proceed_always"], [data-testid*="option-always"], [data-testid*="option_proceed_always"]'
    )
    .first();
  if (await preferredById.isVisible().catch(() => false)) {
    await preferredById.click().catch(() => {});
    return true;
  }

  const preferredByText = card
    .locator('[data-testid*="option-"]')
    .filter({ hasText: /always|始终|永远/i })
    .first();
  if (await preferredByText.isVisible().catch(() => false)) {
    await preferredByText.click().catch(() => {});
    return true;
  }

  const fallback = card.locator('[data-testid*="option-"]').first();
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.click().catch(() => {});
    return true;
  }

  return false;
}

async function confirmPermissionCard(card: Locator): Promise<boolean> {
  const confirmButton = card
    .locator('[data-testid="message-permission-confirm"], [data-testid="message-acp-permission-confirm"]')
    .first();
  if (!(await confirmButton.isVisible().catch(() => false))) {
    return false;
  }

  await clickPreferredPermissionOption(card);

  if (!(await confirmButton.isEnabled().catch(() => false))) {
    return false;
  }

  await confirmButton.click().catch(() => {});
  return true;
}

export function startAutoApprovePermissionMessages(page: Page, intervalMs = 500): () => void {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const cards = page.locator(PERMISSION_CARD_SELECTOR);
        const count = await cards.count();
        for (let index = 0; index < count; index++) {
          const card = cards.nth(index);
          if (!(await card.isVisible().catch(() => false))) {
            continue;
          }
          await confirmPermissionCard(card);
        }
      } catch {
        // Page may be navigating between conversation/scheduled routes.
      }

      await page.waitForTimeout(intervalMs).catch(() => {});
    }
  };

  void loop();
  return () => {
    running = false;
  };
}

export async function waitForPermissionMessageCard(
  page: Page,
  timeoutMs = 30_000
): Promise<'message-permission-card' | 'message-acp-permission-card'> {
  const cards = page.locator(PERMISSION_CARD_SELECTOR);
  await cards.first().waitFor({ state: 'visible', timeout: timeoutMs });
  const testId = (await cards.first().getAttribute('data-testid')) as
    | 'message-permission-card'
    | 'message-acp-permission-card'
    | null;
  if (!testId) {
    throw new Error('Permission card became visible without data-testid');
  }
  return testId;
}
