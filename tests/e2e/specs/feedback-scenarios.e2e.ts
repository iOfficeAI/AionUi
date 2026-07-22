/**
 * Feedback button scenarios — walks each place in the product where the
 * "一键反馈" pill appears, verifies the pill shows up, clicks it, and
 * confirms the feedback modal opens with the correct module preselected.
 *
 * Covered scenarios:
 *   1. About → Bug Report (no module)
 *   3. MCP server connection error → mcp-tools
 *   4. System settings dir-change cancel → system-settings
 *   5. Agent test connection (CLI not found) → alert has NO feedback pill
 *   6. Agent test connection (CLI exists, ACP fails) → alert has NO feedback pill
 *      (the pill was removed from InlineAgentEditor in #3448; the unit test
 *      feedbackMountPoints.test.ts asserts the same at source level)
 *
 * Not covered here (verified via white-box unit tests instead):
 *   - MessageTips error (needs live model)
 *   - MessageToolGroup error (needs live tool call)
 *   - MessageAgentStatus error (needs broken agent session)
 */
import { test, expect, type Page } from '../fixtures';
import { goToSettings } from '../helpers';

// Label comes from i18n key settings.oneClickFeedback.
const FEEDBACK_PILL = 'button:has-text("反馈问题"), button:has-text("Report Issue")';
// The app can hold several FeedbackReportModal instances (FeedbackProvider's
// plus per-page ones like About's), and Arco keeps closed modals mounted but
// hidden — so always scope to the *visible* body, not the first in the DOM.
const MODAL_BODY = '[data-testid="feedback-report-scroll-body"]';
const VISIBLE_MODAL_BODY = `${MODAL_BODY}:visible`;

/** Close the feedback modal (AionModal sets closable=false so Escape is a no-op). */
async function closeFeedbackModal(page: Page) {
  // The feedback modal is an AionModal (standard variant); its header close
  // button carries aria-label='Close'. Scope to the modal that owns the
  // visible feedback scroll body so we never match another (hidden) instance.
  await page
    .locator('.arco-modal-wrapper', { has: page.locator(VISIBLE_MODAL_BODY) })
    .locator('button[aria-label="Close"]')
    .first()
    .click();
  await expect(page.locator(VISIBLE_MODAL_BODY)).toHaveCount(0, { timeout: 5_000 });
}

/** Close any open AionModal (e.g. the Agent editor) so the next test starts clean. */
async function closeAgentEditor(page: Page) {
  const closeBtn = page.locator('.arco-modal button[aria-label="Close"]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ timeout: 2_000 }).catch(() => {});
  }
  // Wait for modal backdrop to disappear.
  await page.waitForTimeout(300);
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: About → Bug Report
// ─────────────────────────────────────────────────────────────────────────────

test('[1] About → Bug Report entry opens feedback modal', async ({ page }) => {
  await goToSettings(page, 'about');

  const bugReportRow = page
    .locator('div')
    .filter({ hasText: /^Report Issue$|^反馈问题$|^問題を報告$|^문제 보고$/ })
    .first();
  await expect(bugReportRow).toBeVisible({ timeout: 10_000 });
  await bugReportRow.click();

  await expect(page.locator(VISIBLE_MODAL_BODY).first()).toBeVisible({ timeout: 5_000 });
  await closeFeedbackModal(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 (MCP error → mcp-tools) is covered by the component-level test
// tests/unit/feedback/McpServerHeaderFeedback.dom.test.tsx — it renders
// McpServerHeader with status='error' and asserts the feedback pill opens
// the modal with module=mcp-tools. Driving a real MCP connection failure
// via the UI proved too brittle (locale-dependent button labels, manual-add
// vs JSON-import dropdown, auto-test timing). The component test gives
// equivalent coverage of the regression-surface.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 (System settings form error) is covered by the static mount-point
// test in tests/unit/feedback/feedbackMountPoints.test.ts — the UI path to
// trigger the error requires mocking Electron's native dialog AND cancelling
// an Arco confirm modal, which is too brittle for a stable E2E. The white-box
// source assertion verifies the module tag stays correct on refactor.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Helper: open the inline custom-agent editor and fill the command field
// ─────────────────────────────────────────────────────────────────────────────

async function openCustomAgentEditor(page: Page, command: string) {
  // Defensive: close any AionModal left over from a prior test so the
  // sidebar/page buttons are clickable.
  await closeAgentEditor(page);

  await goToSettings(page, 'agent');

  // The "Add custom Agent" entry is a TalkToButlerButton dropdown; open it and
  // choose "Add manually" to mount the inline editor modal.
  const addButton = page.locator('button:has-text("添加自定义 Agent"), button:has-text("Add Custom Agent")').first();
  await expect(addButton).toBeVisible({ timeout: 10_000 });
  await addButton.click();
  const manualItem = page.locator('.arco-dropdown-menu-item', { hasText: /手动添加|Add manually/ }).first();
  await expect(manualItem).toBeVisible({ timeout: 5_000 });
  await manualItem.click();

  // Scope everything to the editor modal — the agent cards behind it also
  // carry "测试连接" buttons, which the modal backdrop makes unclickable.
  const editorModal = page.locator('.arco-modal-wrapper', {
    has: page.locator('input[placeholder*="my-agent"]'),
  });

  // Fill the command input — target it by its placeholder (settings.commandPlaceholder)
  // so index shifts in the form don't silently fill the wrong field.
  const commandInput = editorModal.locator('input[placeholder*="my-agent"]').first();
  await expect(commandInput).toBeVisible({ timeout: 5_000 });
  await commandInput.fill(command);

  // Click "Test Connection"
  const testBtn = editorModal.locator('button:has-text("测试连接"), button:has-text("Test Connection")').first();
  await testBtn.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Agent test connection — fail_cli → agent-detection
// ─────────────────────────────────────────────────────────────────────────────

test('[5] Agent fail_cli alert shows without feedback pill', async ({ page }) => {
  await openCustomAgentEditor(page, 'aionui-e2e-missing-binary-xyz');

  // Expect the fail_cli alert to appear — without the feedback pill, which
  // was deliberately removed from InlineAgentEditor (#3448).
  const alert = page.locator('.arco-alert-error').first();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert.locator(FEEDBACK_PILL)).toHaveCount(0);

  // Close the agent editor modal so the next test starts fresh.
  await closeAgentEditor(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Agent test connection — fail_acp → agent-detection
// ─────────────────────────────────────────────────────────────────────────────

test('[6] Agent fail_acp warning shows without feedback pill', async ({ page }) => {
  await openCustomAgentEditor(page, '/bin/echo');

  // Expect the fail_acp warning alert (warning, not error) — also without
  // the feedback pill (#3448).
  const alert = page.locator('.arco-alert-warning').first();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert.locator(FEEDBACK_PILL)).toHaveCount(0);

  await closeAgentEditor(page);
});
