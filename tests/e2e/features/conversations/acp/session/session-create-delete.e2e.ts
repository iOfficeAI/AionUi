import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  deleteConversation,
  goToNewChat,
  waitForSessionActive,
  takeScreenshot,
  AGENT_PILL,
  agentPillByBackend,
} from '../../../../helpers';

const BACKENDS = ['claude', 'codex'] as const;
const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-SESSION-01 创建新会话', () => {
  test('guid 页面显示可用 agent pill', async ({ page }) => {
    await goToGuid(page);
    await expect(page.locator(AGENT_PILL).first()).toBeVisible({ timeout: 15_000 });
  });

  for (const backend of BACKENDS) {
    test(`选择 ${backend} 后端并创建会话`, async ({ page }) => {
      if (backend === 'codex') test.setTimeout(240_000);

      await goToGuid(page);
      await selectAgent(page, backend);

      const selectedPill = page.locator(`${agentPillByBackend(backend)}[data-agent-selected="true"]`);
      await expect(selectedPill).toBeVisible({ timeout: 5_000 });

      const conversationId = await sendMessageFromGuid(page, `E2E session create test — ${backend}`);
      createdIds.push(conversationId);

      expect(conversationId).toBeTruthy();
      expect(conversationId.length).toBeGreaterThan(0);

      await expect(page.locator(`#c-${conversationId}`)).toBeVisible({ timeout: 15_000 });

      const timeout = backend === 'codex' ? 180_000 : 120_000;
      await waitForSessionActive(page, timeout);
    });
  }

  test('创建成功后侧边栏截图', async ({ page }) => {
    await takeScreenshot(page, 'session-01-sidebar-after-create');
  });

  test.skip('通过托盘菜单新建会话（E2E 无法操作系统级托盘菜单）', async () => {});
  test.skip('传入无效 agent type 创建会话（防御性边界，E2E 不覆盖）', async () => {});

  test('通过 bridge 验证会话数据存在', async ({ page }) => {
    for (const id of createdIds) {
      const conv = await invokeBridge<{ id: string; type: string }>(page, 'get-conversation', { id });
      expect(conv).toBeTruthy();
      expect(conv.id).toBe(id);
    }
  });
});

test.describe('F-SESSION-07 删除会话', () => {
  let deleteTargetId: string;

  test.beforeAll(async ({ page }) => {
    await goToNewChat(page);
    await selectAgent(page, 'claude');
    deleteTargetId = await sendMessageFromGuid(page, 'E2E session delete test');
    createdIds.push(deleteTargetId);
    await waitForSessionActive(page, 120_000);
  });

  test('通过 bridge 删除会话并验证消失', async ({ page }) => {
    const row = page.locator(`#c-${deleteTargetId}`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    const msgsBefore = await invokeBridge<unknown[]>(page, 'database.get-conversation-messages', {
      conversation_id: deleteTargetId,
    }).catch(() => []);
    expect(msgsBefore.length).toBeGreaterThan(0);

    await invokeBridge(page, 'remove-conversation', { id: deleteTargetId });
    await page.waitForTimeout(3_000);

    await expect(row).not.toBeVisible({ timeout: 10_000 });

    const idx = createdIds.indexOf(deleteTargetId);
    if (idx !== -1) createdIds.splice(idx, 1);
  });

  test('删除后消息历史一并清除', async ({ page }) => {
    const msgsAfter = await invokeBridge<unknown[]>(page, 'database.get-conversation-messages', {
      conversation_id: deleteTargetId,
    }).catch(() => []);
    expect(msgsAfter.length).toBe(0);
  });

  test('删除后 bridge 查询返回空', async ({ page }) => {
    const conv = await invokeBridge<Record<string, unknown> | null>(page, 'get-conversation', {
      id: deleteTargetId,
    }).catch(() => null);
    const isGone = !conv || !conv.id;
    expect(isGone).toBe(true);
  });

  test.skip('通过托盘菜单删除（E2E 无法操作系统级托盘菜单）', async () => {});
  test.skip('无效 id 删除（边界场景，E2E 不覆盖）', async () => {});
});
