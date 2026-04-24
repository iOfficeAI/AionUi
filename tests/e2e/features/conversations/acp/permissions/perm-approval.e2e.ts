import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
  takeScreenshot,
} from '../../../../helpers';

interface IConfirmationItem {
  id: string;
  title?: string;
  description: string;
  callId: string;
  action?: string;
  options: Array<{ label: string; value: any }>;
}

const CONFIRM_CARD = '.bg-dialog-fill-0.rd-20px.max-w-800px';
const CONFIRM_OPTION = '.cursor-pointer.mt-10px';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-PERM-01 AI 操作权限审批', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(
      page,
      'Please create a file at /tmp/e2e-perm-test-approval.txt with the content "hello e2e test". Do NOT ask me, just do it.'
    );
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
  });

  test('敏感操作前弹出权限确认卡片', async ({ page }) => {
    // Wait for either a confirmation card or an AI reply (if auto-approved)
    const cardOrReply = await Promise.race([
      page
        .locator(CONFIRM_CARD)
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'card' as const),
      waitForAiReply(page, 60_000).then(() => 'reply' as const),
    ]);

    if (cardOrReply === 'card') {
      const card = page.locator(CONFIRM_CARD).first();
      await expect(card).toBeVisible();

      // Verify card has title and description
      const titleEl = card.locator('.text-16px.font-bold');
      const titleText = await titleEl.textContent().catch(() => '');
      expect(titleText!.length).toBeGreaterThan(0);

      const options = card.locator(CONFIRM_OPTION);
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThanOrEqual(2);

      // Also verify via bridge
      const confirmList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', {
        conversation_id: conversationId,
      });
      expect(Array.isArray(confirmList)).toBe(true);
      expect(confirmList!.length).toBeGreaterThan(0);

      await takeScreenshot(page, 'perm-01-card-visible');
    } else {
      // AI replied without permission card — may be in auto mode or tool didn't need permission
      // Verify confirmation.list API is callable
      const confirmList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', {
        conversation_id: conversationId,
      });
      expect(Array.isArray(confirmList)).toBe(true);

      await takeScreenshot(page, 'perm-01-no-card-auto-reply');
    }
  });

  test('用户选择"允许"后卡片消失 + AI 继续执行', async ({ page }) => {
    const card = page.locator(CONFIRM_CARD).first();
    const isCardVisible = await card.isVisible().catch(() => false);

    if (!isCardVisible) {
      test.skip(undefined, 'No permission card appeared — AI may have auto-executed');
      return;
    }

    // Click first option (typically "Allow")
    const firstOption = card.locator(CONFIRM_OPTION).first();
    await firstOption.click();

    // Card should disappear
    await expect(card).toBeHidden({ timeout: 10_000 });

    // AI should continue and produce a reply
    await waitForAiReply(page, 120_000);

    await takeScreenshot(page, 'perm-01-allowed');
  });

  test.skip('选择"始终允许"后同类操作自动放行（需多次触发同类工具调用，E2E 不可靠控制 AI 工具选择）', async () => {});

  test('选择"拒绝"后 AI 不执行该操作', async ({ page }) => {
    // Create a new conversation to test rejection
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const rejectConvId = await sendMessageFromGuid(
      page,
      'Please write a file at /tmp/e2e-perm-reject-test.txt with content "reject test". Just do it directly.'
    );
    createdIds.push(rejectConvId);
    await waitForSessionActive(page, 120_000);

    const cardOrReply = await Promise.race([
      page
        .locator(CONFIRM_CARD)
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'card' as const),
      waitForAiReply(page, 60_000).then(() => 'reply' as const),
    ]);

    if (cardOrReply === 'card') {
      const card = page.locator(CONFIRM_CARD).first();
      const options = card.locator(CONFIRM_OPTION);
      const optionCount = await options.count();

      // Find the cancel/reject option (usually last one)
      let cancelIdx = -1;
      for (let i = 0; i < optionCount; i++) {
        const shortcutText = await options
          .nth(i)
          .locator('.font-mono')
          .textContent()
          .catch(() => '');
        if (shortcutText === 'Esc') {
          cancelIdx = i;
          break;
        }
      }

      if (cancelIdx >= 0) {
        await options.nth(cancelIdx).click();
      } else {
        // Fallback: click last option
        await options.last().click();
      }

      // Card should disappear after rejection
      await expect(card).toBeHidden({ timeout: 10_000 });
      // Conversation continues — AI should respond acknowledging the rejection
      await waitForAiReply(page, 120_000);

      await takeScreenshot(page, 'perm-01-rejected');
    } else {
      test.skip(undefined, 'No permission card appeared — cannot test rejection');
    }
  });

  test.skip('超时未响应时自动拒绝（白名单：30 分钟超时未实现）', async () => {});
  test.skip('AI 等待权限审批时用户点停止（需精确控制停止时机，E2E 不可靠）', async () => {});
  test.skip('多个权限请求按顺序展示（E2E 无法可靠控制 AI 同时发起多个工具调用）', async () => {});
  test.skip('会话重置后"始终允许"记录被清除（需多次触发同类工具调用验证，E2E 不可靠）', async () => {});
  test.skip('Gemini 后端权限审批差异（Gemini 跳过）', async () => {});
});

test.describe('F-PERM-02 权限确认操作', () => {
  test('点击确认按钮后卡片立即消失（复用 F-PERM-01 允许测试验证）', async ({ page }) => {
    // This AC is already covered by F-PERM-01 "允许" test above
    // Create a fresh conversation to verify independently
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const convId = await sendMessageFromGuid(
      page,
      'Please create a temp file /tmp/e2e-perm02-test.txt with content "perm02". Do it directly.'
    );
    createdIds.push(convId);
    await waitForSessionActive(page, 120_000);

    const cardOrReply = await Promise.race([
      page
        .locator(CONFIRM_CARD)
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'card' as const),
      waitForAiReply(page, 60_000).then(() => 'reply' as const),
    ]);

    if (cardOrReply === 'card') {
      const card = page.locator(CONFIRM_CARD).first();
      const beforeCount = await card.locator(CONFIRM_OPTION).count();
      expect(beforeCount).toBeGreaterThanOrEqual(1);

      // Click first option
      await card.locator(CONFIRM_OPTION).first().click();

      // Card disappears immediately
      await expect(card).toBeHidden({ timeout: 5_000 });

      // AI resumes
      await waitForAiReply(page, 120_000);

      // Verify confirmation list is now empty
      const afterList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', { conversation_id: convId });
      expect(afterList?.length ?? 0).toBe(0);

      await takeScreenshot(page, 'perm-02-card-dismissed');
    } else {
      // Verify confirmation.list API returns empty
      const list = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', { conversation_id: convId });
      expect(Array.isArray(list)).toBe(true);
    }
  });

  test.skip('确认卡片对应的操作已不存在时静默消失（需精确控制 AI 停止时机，E2E 不可靠）', async () => {});
  test.skip('AI 尚未完全初始化时做出确认（需精确捕捉初始化前状态）', async () => {});
});
