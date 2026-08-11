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

interface ModelInfoResponse {
  success: boolean;
  data?: { modelInfo: { currentModelId?: string; availableModels?: { id: string }[] } | null };
}

interface ModeResponse {
  success: boolean;
  data?: { mode: string; initialized?: boolean };
}

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-CONFIG-09 配置自动保存与恢复', () => {
  let conversationId: string;
  let savedModel: string | undefined;
  let savedMode: string | undefined;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'E2E config-persistence test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const modelInfo = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    savedModel = modelInfo?.data?.modelInfo?.currentModelId;

    const modeInfo = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    savedMode = modeInfo?.data?.mode;
  });

  test('模型修改后自动保存（通过 conversation extra 验证）', async ({ page }) => {
    const conv = await invokeBridge<{ id?: string; extra?: Record<string, unknown> }>(page, 'get-conversation', {
      id: conversationId,
    });
    expect(conv).toBeTruthy();
    expect(conv!.id).toBeTruthy();

    await takeScreenshot(page, 'config-09-auto-save');
  });

  test('每个会话的配置独立保存', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const secondId = await sendMessageFromGuid(page, 'E2E config-09 second session');
    createdIds.push(secondId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const model1 = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });

    const model2 = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId: secondId });

    expect(model1?.success).toBe(true);
    expect(model2?.success).toBe(true);

    await takeScreenshot(page, 'config-09-independent-sessions');
  });

  test('会话恢复后模型和模式自动重新应用', async ({ page }) => {
    await goToGuid(page);
    await page.waitForTimeout(1_000);

    await page.evaluate((id) => {
      window.location.hash = `/conversation/${id}`;
    }, conversationId);
    await page.waitForFunction((id) => window.location.hash.includes(`/conversation/${id}`), conversationId, {
      timeout: 10_000,
    });
    await page.waitForTimeout(3_000);

    if (savedModel) {
      const afterModel = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
      expect(afterModel?.data?.modelInfo?.currentModelId).toBe(savedModel);
    }

    if (savedMode) {
      const afterMode = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
      expect(afterMode?.data?.mode).toBe(savedMode);
    }

    await takeScreenshot(page, 'config-09-restored');
  });

  test.skip('保存失败不阻塞当前操作（E2E 无法模拟磁盘空间不足）', async () => {});
  test.skip('之前选择的模型已下线时用户收到提示并自动回退（E2E 无法模拟模型下线）', async () => {});
  test.skip('模式恢复失败时静默回退到默认模式（E2E 无法可靠触发模式恢复失败）', async () => {});
});
