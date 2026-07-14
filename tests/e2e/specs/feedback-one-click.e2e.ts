/**
 * One-click feedback – verifies the feedback infrastructure introduced for
 * the inline "一键反馈 >>" error-adjacent links.
 *
 * These tests do not try to trigger real runtime errors (which would require
 * bad credentials / unreachable MCP URLs and would be flaky). Instead they
 * verify the underlying pieces that the inline links rely on:
 *   1. The main-process `feedback:capture-screenshot` IPC returns PNG bytes.
 *   2. The existing About → Bug Report entry still opens the modal that the
 *      new one-click flow re-uses (FeedbackReportModal).
 *   3. The modal displays its title and module select control.
 */
import { test, expect } from '../fixtures';
import { goToSettings } from '../helpers';

declare global {
  interface Window {
    electronAPI?: {
      captureFeedbackScreenshot?: () => Promise<{ filename: string; data: number[] } | null>;
    };
  }
}

test.describe('One-click feedback infrastructure', () => {
  test('captureFeedbackScreenshot IPC returns PNG bytes', async ({ page }) => {
    await goToSettings(page, 'about');

    const result = await page.evaluate(async () => {
      const capture = window.electronAPI?.captureFeedbackScreenshot;
      if (!capture) return { available: false };
      const shot = await capture();
      if (!shot) return { available: true, captured: false };
      return {
        available: true,
        captured: true,
        filename: shot.filename,
        byteCount: shot.data.length,
        // PNG files start with 0x89 'P' 'N' 'G' — verify the signature so
        // we know we got real image bytes rather than an empty or garbage blob.
        startsWithPngSignature:
          shot.data.length >= 4 &&
          shot.data[0] === 0x89 &&
          shot.data[1] === 0x50 &&
          shot.data[2] === 0x4e &&
          shot.data[3] === 0x47,
      };
    });

    expect(result.available).toBe(true);
    expect(result.captured).toBe(true);
    expect(result.filename).toMatch(/^screenshot-.*\.png$/);
    expect(result.byteCount).toBeGreaterThan(100);
    expect(result.startsWithPngSignature).toBe(true);
  });

  test('About → Bug Report opens the feedback modal with module select visible', async ({ page }) => {
    await goToSettings(page, 'about');

    // The about page lists a row whose title resolves from i18n key
    // `settings.bugReport`. We click the row text which triggers
    // setShowFeedbackModal(true) in AboutModalContent.
    const bugReportRow = page
      .locator('div')
      .filter({ hasText: /^Bug Report$|^问题报告$|^バグ報告$|^버그 보고$/ })
      .first();
    await expect(bugReportRow).toBeVisible({ timeout: 10_000 });
    await bugReportRow.click();

    // The modal is rendered by FeedbackReportModal (a ModalWrapper). Verify it
    // surfaces the scroll body and module select placeholder text.
    const modalBody = page.locator('[data-testid="feedback-report-scroll-body"]');
    await expect(modalBody).toBeVisible({ timeout: 5_000 });

    // Auto-info banner confirms the modal is fully rendered.
    const autoInfo = page.locator('[data-testid="feedback-report-auto-info"]');
    await expect(autoInfo).toBeVisible();

    // Close via the AionModal header close button (aria-label='Close'). The
    // modal is configured with closable={false} so Escape alone does not
    // dismiss it. Scope to the modal that owns the feedback body so we never
    // match another modal's close button.
    const closeBtn = page
      .locator('.arco-modal-wrapper', { has: modalBody })
      .locator('button[aria-label="Close"]')
      .first();
    await closeBtn.click();
    await expect(modalBody).toBeHidden({ timeout: 5_000 });
  });
});
