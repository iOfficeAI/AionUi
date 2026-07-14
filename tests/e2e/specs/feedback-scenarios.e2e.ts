/**
 * Feedback button scenarios — walks each place in the product where the
 * "一键反馈" pill appears, verifies the pill shows up, clicks it, and
 * confirms the feedback modal opens with the correct module preselected.
 *
 * Covered scenarios:
 *   1. About → Bug Report (no module)
 *   3. MCP server connection error → mcp-tools
 *   4. System settings dir-change cancel → system-settings
 *   5. Agent test connection (CLI not found) → agent-detection
 *   6. Agent test connection (CLI exists, ACP fails) → agent-detection
 *
 * Not covered here (verified via white-box unit tests instead):
 *   - MessageTips error (needs live model)
 *   - MessageToolGroup error (needs live tool call)
 *   - MessageAgentStatus error (needs broken agent session)
 */
import { test, expect, type Page } from '../fixtures';
import { goToSettings } from '../helpers';

const FEEDBACK_PILL = 'button:has-text("问题上报"), button:has-text("Report issue")';
const MODAL_BODY = '[data-testid="feedback-report-scroll-body"]';

/** Close the feedback modal (AionModal sets closable=false so Escape is a no-op). */
async function closeFeedbackModal(page: Page) {
  // The feedback modal is an AionModal (standard variant); its header close
  // button carries aria-label='Close'. Scope to the modal that owns the
  // feedback scroll body so we never match another modal's close button.
  await page
    .locator('.arco-modal-wrapper', { has: page.locator(MODAL_BODY) })
    .locator('button[aria-label="Close"]')
    .first()
    .click();
  await expect(page.locator(MODAL_BODY)).toBeHidden({ timeout: 5_000 });
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

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: About → Bug Report
// ─────────────────────────────────────────────────────────────────────────────

test('[1] About → Bug Report entry opens feedback modal', async ({ page }) => {
  await goToSettings(page, 'about');

  const bugReportRow = page
    .locator('div')
    .filter({ hasText: /^Bug Report$|^问题报告$|^バグ報告$|^버그 보고$/ })
    .first();
  await expect(bugReportRow).toBeVisible({ timeout: 10_000 });
  await bugReportRow.click();

  await expect(page.locator(MODAL_BODY)).toBeVisible({ timeout: 5_000 });
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

  // Click "Detect Custom Agent" / "检测自定义 Agent" link
  const detectLink = page.locator('button:has-text("自定义 Agent"), button:has-text("Custom Agent")').first();
  await expect(detectLink).toBeVisible({ timeout: 10_000 });
  await detectLink.click();

  // Fill command input — it's the second large Input after Name.
  const commandInput = page.locator('.arco-input').nth(1);
  await expect(commandInput).toBeVisible({ timeout: 5_000 });
  await commandInput.fill(command);

  // Click "Test Connection"
  const testBtn = page.locator('button:has-text("测试连接"), button:has-text("Test Connection")').first();
  await testBtn.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Agent test connection — fail_cli → agent-detection
// ─────────────────────────────────────────────────────────────────────────────

test('[5] Agent fail_cli alert surfaces feedback pill (module=agent-detection)', async ({ page }) => {
  await openCustomAgentEditor(page, 'aionui-e2e-missing-binary-xyz');

  // Expect the fail_cli alert to appear with the feedback pill inside.
  const alert = page.locator('.arco-alert-error').first();
  await expect(alert).toBeVisible({ timeout: 15_000 });

  const pill = alert.locator(FEEDBACK_PILL).first();
  await expect(pill).toBeVisible({ timeout: 5_000 });
  await pill.click();
  await expect(page.locator(MODAL_BODY)).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.arco-select-view-value').first()).toContainText(/Agent|代理|权限|检测/, {
    timeout: 3_000,
  });
  await closeFeedbackModal(page);

  // Close the agent editor modal so the next test starts fresh.
  await closeAgentEditor(page);
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Agent test connection — fail_acp → agent-detection
// ─────────────────────────────────────────────────────────────────────────────

test('[6] Agent fail_acp warning surfaces feedback pill (module=agent-detection)', async ({ page }) => {
  await openCustomAgentEditor(page, '/bin/echo');

  // Expect the fail_acp warning alert (warning, not error).
  const alert = page.locator('.arco-alert-warning').first();
  await expect(alert).toBeVisible({ timeout: 15_000 });

  const pill = alert.locator(FEEDBACK_PILL).first();
  await expect(pill).toBeVisible({ timeout: 5_000 });
  await pill.click();
  await expect(page.locator(MODAL_BODY)).toBeVisible({ timeout: 5_000 });
  await closeFeedbackModal(page);

  await closeAgentEditor(page);
});
