import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
  takeScreenshot,
  MODEL_SELECTOR_BTN,
} from '../../../../helpers';

interface AcpModelInfo {
  currentModelId?: string;
  currentModelLabel?: string;
  canSwitch?: boolean;
  availableModels: { id: string; label?: string; name?: string }[];
  source?: string;
}

interface ModelInfoResponse {
  success: boolean;
  data?: { modelInfo: AcpModelInfo | null };
}

interface ConfigOptionsResponse {
  success: boolean;
  data?: { configOptions: unknown[] };
}

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-CONFIG-01 切换 AI 模型', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'E2E config-model test: Hello');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);
  });

  test('模型列表中可以看到当前后端所有可用模型', async ({ page }) => {
    const result = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    expect(result?.success).toBe(true);
    expect(result?.data?.modelInfo).toBeTruthy();
    expect(result!.data!.modelInfo!.availableModels.length).toBeGreaterThan(0);

    await takeScreenshot(page, 'config-01-model-list');
  });

  test('通过 UI 切换模型后后续对话使用新模型', async ({ page }) => {
    const beforeInfo = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    const modelInfo = beforeInfo?.data?.modelInfo;
    const currentModelId = modelInfo?.currentModelId;
    const currentLabel = modelInfo?.currentModelLabel ?? currentModelId ?? '';
    const available = modelInfo?.availableModels ?? [];

    if (available.length < 2) {
      test.skip();
      return;
    }

    const modelBtn = page.locator('button.sendbox-model-btn.header-model-btn');
    const isBtnVisible = await modelBtn.isVisible().catch(() => false);
    if (!isBtnVisible) {
      test.skip();
      return;
    }

    await modelBtn.click();
    await page.waitForTimeout(500);

    const targetModel = available.find((m) => m.id !== currentModelId);
    if (!targetModel) {
      await page.keyboard.press('Escape');
      test.skip();
      return;
    }

    const targetLabel = targetModel.label ?? targetModel.id;
    const menuItem = page.locator('.arco-dropdown-menu-item, .arco-menu-item').filter({ hasText: targetLabel }).first();
    const isMenuItemVisible = await menuItem.isVisible().catch(() => false);
    if (!isMenuItemVisible) {
      await page.keyboard.press('Escape');
      test.skip();
      return;
    }

    await menuItem.click();
    await page.waitForTimeout(1_000);

    const afterInfo = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    expect(afterInfo?.data?.modelInfo?.currentModelId).toBe(targetModel.id);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('After model switch: what model are you?');
    await textarea.press('Enter');
    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);

    await takeScreenshot(page, 'config-01-model-switched');
  });

  test('模型选择在会话关闭重开后仍然保持', async ({ page }) => {
    const beforeInfo = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    const modelBeforeNav = beforeInfo?.data?.modelInfo?.currentModelId;

    await goToGuid(page);
    await page.waitForTimeout(1_000);

    await page.evaluate((id) => {
      window.location.hash = `/conversation/${id}`;
    }, conversationId);
    await page.waitForFunction((id) => window.location.hash.includes(`/conversation/${id}`), conversationId, {
      timeout: 10_000,
    });
    await page.waitForTimeout(3_000);

    const afterInfo = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    expect(afterInfo?.data?.modelInfo?.currentModelId).toBe(modelBeforeNav);

    await takeScreenshot(page, 'config-01-model-persisted');
  });

  test.skip('当所选模型不可用时自动回退（E2E 无法模拟模型下线）', async () => {});
  test.skip('AI 会话尚未完成初始化时切换模型（竞态时序难以可靠复现）', async () => {});
  test.skip('切换失败时模型保持不变（E2E 无法可靠触发切换失败）', async () => {});
});

test.describe('F-CONFIG-04 查看模型信息', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'E2E config-04 model info test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);
  });

  test('AI 初始化后可以看到当前模型名称', async ({ page }) => {
    const result = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    expect(result?.success).toBe(true);
    expect(result?.data?.modelInfo).toBeTruthy();
    expect(result!.data!.modelInfo!.currentModelId).toBeTruthy();
    expect(result!.data!.modelInfo!.currentModelId!.length).toBeGreaterThan(0);

    await takeScreenshot(page, 'config-04-model-info');
  });

  test('模型列表仅展示实际可用的模型', async ({ page }) => {
    const result = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    const models = result?.data?.modelInfo?.availableModels ?? [];
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.id).toBeTruthy();
      expect(m.id.length).toBeGreaterThan(0);
    }
  });

  test.skip('不支持模型切换时用户无法触发切换操作（需要不支持模型切换的后端）', async () => {});
  test.skip('AI 尚未初始化且从未使用过时不显示模型信息（需要精确捕捉初始化前状态）', async () => {});
});

test.describe('F-CONFIG-10 后端能力信息缓存', () => {
  test('首次连接后可获取到后端能力信息', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E config-10 cache test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const modelInfo = await invokeBridge<ModelInfoResponse>(page, 'acp.get-model-info', { conversationId });
    expect(modelInfo?.success).toBe(true);
    expect(modelInfo?.data?.modelInfo).toBeTruthy();
    expect(modelInfo!.data!.modelInfo!.availableModels.length).toBeGreaterThan(0);

    const configOptions = await invokeBridge<ConfigOptionsResponse>(page, 'acp.get-config-options', { conversationId });
    expect(configOptions?.success).toBe(true);

    await takeScreenshot(page, 'config-10-capability-cache');
  });

  test.skip('连接建立前显示缓存数据（需要精确捕捉连接建立前 UI 状态，时序不可靠）', async () => {});
  test.skip('连接建立后缓存自动更新为最新数据（需要对比缓存前后差异，不可靠）', async () => {});
});
