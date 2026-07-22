/**
 * Titlebar report button — route → module preselection.
 *
 * The titlebar's "Report Issue" button opens the feedback modal with the
 * module preselected from the current route (resolveFeedbackModule). These
 * tests walk the pages that previously fell through to "no module" or the
 * blanket "system-settings" mapping and assert the right module shows up
 * in the select control.
 *
 * Complements tests/unit/feedback/resolveFeedbackModule.test.ts (full table
 * coverage) — here we verify the wiring end-to-end through the real titlebar
 * button on a representative sample of routes.
 */
import { test, expect, type Page } from '../fixtures';
import { goToSettings, navigateTo } from '../helpers';

// Several FeedbackReportModal instances can coexist in the DOM (the global
// FeedbackProvider's plus per-page ones like About's), and closed modals stay
// mounted but hidden — always scope to the *visible* body.
const MODAL_BODY = '[data-testid="feedback-report-scroll-body"]';
const VISIBLE_MODAL_BODY = `${MODAL_BODY}:visible`;
const TITLEBAR_FEEDBACK_BUTTON = 'button[aria-label="反馈问题"], button[aria-label="Report Issue"]';

// Tests share one Electron instance across spec files; a modal left open by a
// prior (possibly failed) test intercepts pointer events and poisons every
// test after it. Close all visible modals before each test.
test.beforeEach(async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    const closeBtn = page.locator('.arco-modal-wrapper:visible button[aria-label="Close"]').first();
    if (!(await closeBtn.isVisible().catch(() => false))) break;
    await closeBtn.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
});

async function openTitlebarFeedback(page: Page) {
  const btn = page.locator(TITLEBAR_FEEDBACK_BUTTON).first();
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
  await expect(page.locator(VISIBLE_MODAL_BODY).first()).toBeVisible({ timeout: 10_000 });
}

async function expectSelectedModule(page: Page, labelPattern: RegExp) {
  const select = page
    .locator('.arco-modal-wrapper', { has: page.locator(VISIBLE_MODAL_BODY) })
    .locator('.arco-select-view-value')
    .first();
  await expect(select).toContainText(labelPattern, { timeout: 5_000 });
}

async function closeFeedbackModal(page: Page) {
  await page
    .locator('.arco-modal-wrapper', { has: page.locator(VISIBLE_MODAL_BODY) })
    .locator('button[aria-label="Close"]')
    .first()
    .click();
  await expect(page.locator(VISIBLE_MODAL_BODY)).toHaveCount(0, { timeout: 5_000 });
}

test('scheduled tasks list preselects the scheduled-task module', async ({ page }) => {
  await navigateTo(page, '#/scheduled');
  await openTitlebarFeedback(page);
  await expectSelectedModule(page, /定时任务|Scheduled Tasks/);
  await closeFeedbackModal(page);
});

test('assistants page preselects the assistant-preset module', async ({ page }) => {
  await navigateTo(page, '#/assistants');
  await openTitlebarFeedback(page);
  await expectSelectedModule(page, /助手与预设|Assistants & Presets/);
  await closeFeedbackModal(page);
});

test('settings → agent preselects the agent-detection module', async ({ page }) => {
  await goToSettings(page, 'agent');
  await openTitlebarFeedback(page);
  await expectSelectedModule(page, /Agent 检测与连接|Agent Detection & Connection/);
  await closeFeedbackModal(page);
});

test('settings → model preselects the model-auth module', async ({ page }) => {
  await goToSettings(page, 'model');
  await openTitlebarFeedback(page);
  await expectSelectedModule(page, /模型与认证|Models & Authentication/);
  await closeFeedbackModal(page);
});

test('settings → system keeps the system-settings module', async ({ page }) => {
  await goToSettings(page, 'system');
  await openTitlebarFeedback(page);
  await expectSelectedModule(page, /系统设置|System Settings/);
  await closeFeedbackModal(page);
});
