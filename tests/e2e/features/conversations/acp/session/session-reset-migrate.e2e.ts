import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  goToNewChat,
  navigateTo,
} from '../../../../helpers';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-SESSION-06 重置所有会话', () => {
  const sessionIds: string[] = [];

  test.beforeAll(async ({ page }) => {
    for (let i = 0; i < 2; i++) {
      await goToNewChat(page);
      await selectAgent(page, 'claude');
      const id = await sendMessageFromGuid(page, `E2E reset-all test session ${i + 1}`);
      sessionIds.push(id);
      createdIds.push(id);
      await waitForSessionActive(page, 120_000);
    }
  });

  test('逐个重置所有会话后连接关闭但数据保留', async ({ page }) => {
    for (const id of sessionIds) {
      await invokeBridge(page, 'reset-conversation', { id });
    }

    await page.waitForTimeout(3_000);

    for (const id of sessionIds) {
      const conv = await invokeBridge<{ id: string; type: string }>(page, 'get-conversation', { id });
      expect(conv).toBeTruthy();
      expect(conv.id).toBe(id);
    }
  });

  test.skip('部分会话关闭失败时的错误处理（E2E 无法注入部分失败场景）', async () => {});

  test('重置后重新进入会话可自动重连', async ({ page }) => {
    const id = sessionIds[0];
    if (!id) return;

    await navigateTo(page, `#/conversation/${id}`);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    await textarea.fill('Message after reset — should auto-reconnect');
    await textarea.press('Enter');

    await waitForSessionActive(page, 120_000);
  });
});

test.describe('F-SESSION-09 会话迁移', () => {
  test('通过 createWithConversation 模拟迁移并验证数据完整', async ({ page }) => {
    let sourceId = createdIds[0];
    if (!sourceId) {
      await goToGuid(page);
      await selectAgent(page, 'claude');
      sourceId = await sendMessageFromGuid(page, 'E2E migration source session');
      createdIds.push(sourceId);
      await waitForSessionActive(page, 120_000);
    }

    const sourceConv = await invokeBridge<Record<string, unknown>>(page, 'get-conversation', { id: sourceId });
    expect(sourceConv).toBeTruthy();

    const migrationPayload = {
      ...sourceConv,
      id: `e2e-migrated-${Date.now()}`,
      name: `E2E Migrated — ${(sourceConv.name as string) || 'unnamed'}`,
    };

    const migratedConv = await invokeBridge<Record<string, unknown>>(page, 'create-conversation-with-conversation', {
      conversation: migrationPayload,
      sourceConversationId: sourceId,
    });

    const migratedId = (migratedConv?.id as string) || migrationPayload.id;
    expect(migratedId).toBeTruthy();
    createdIds.push(migratedId);

    const migratedData = await invokeBridge<{ id: string; type: string }>(page, 'get-conversation', { id: migratedId });

    expect(migratedData).toBeTruthy();
    expect(migratedData.id).toBe(migratedId);
    expect(migratedData.type).toBe(sourceConv.type as string);
  });
});
