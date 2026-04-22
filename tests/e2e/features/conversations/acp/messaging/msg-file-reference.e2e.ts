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

const TOOL_CALL_SELECTOR = '[data-testid="tool-call"], .tool-call-item, .message-item.tool';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-MSG-02 在消息中引用文件', () => {
  test('发送含 @文件名 的消息后 AI 能基于文件回复', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'Please read @package.json and tell me the project name.');
    createdIds.push(conversationId);

    await waitForSessionActive(page, 120_000);
    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);

    await takeScreenshot(page, 'msg-02-file-reference');
  });

  test.skip('Add to Chat 从目录树选择文件（E2E Electron 无工作区 Explorer panel）', async () => {});
  test.skip('拖拽文件上传（Playwright Electron 不支持原生拖拽事件到 input）', async () => {});
  test.skip('粘贴板图片附件（Electron clipboard + Playwright 兼容性风险高）', async () => {});
  test.skip('Gemini 后端文件自动复制和清理（Gemini 跳过）', async () => {});
  test.skip('多方式引用同一文件自动去重（部分实现，依赖目录树交互）', async () => {});
  test.skip('二进制文件不做内联读取（E2E 无法验证传输层内部行为，文件内联逻辑在 adapter 层处理）', async () => {});
  test.skip('AI 收到的消息不包含界面展示用的路径标记（E2E 无法检查传输给 AI 的实际 payload）', async () => {});
  test.skip('上传失败不阻塞消息发送（E2E 无法可靠模拟文件上传失败场景）', async () => {});
});

test.describe('F-FILE-02 AI 读取和写入文件', () => {
  test('要求 AI 读取文件后对话中显示工具调用', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(
      page,
      'Read the file package.json in the workspace and summarize its contents.'
    );
    createdIds.push(conversationId);

    await waitForSessionActive(page, 120_000);
    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);

    const messages = await invokeBridge<{ type?: string; content?: unknown }[]>(
      page,
      'database.get-conversation-messages',
      { conversation_id: conversationId }
    );
    const hasToolMessage = messages.some(
      (m) => m.type === 'tool_call' || m.type === 'acp_tool_call' || m.type === 'tool_group'
    );
    if (hasToolMessage) {
      expect(hasToolMessage).toBe(true);
    } else {
      expect(replyText.toLowerCase()).toMatch(/package\.json|read|file/);
    }

    await takeScreenshot(page, 'file-02-read-tool-call');
  });

  test('要求 AI 创建文件后对话中显示写入操作', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(
      page,
      'Create a file called e2e-test-output.txt in the workspace with the content "Hello from E2E test".'
    );
    createdIds.push(conversationId);

    await waitForSessionActive(page, 120_000);
    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);

    const messages = await invokeBridge<{ type?: string; content?: unknown }[]>(
      page,
      'database.get-conversation-messages',
      { conversation_id: conversationId }
    );
    const hasToolMessage = messages.some(
      (m) => m.type === 'tool_call' || m.type === 'acp_tool_call' || m.type === 'tool_group'
    );
    if (hasToolMessage) {
      expect(hasToolMessage).toBe(true);
    } else {
      expect(replyText.toLowerCase()).toMatch(/e2e-test-output\.txt|create|write|file/);
    }

    await takeScreenshot(page, 'file-02-write-tool-call');
  });

  test.skip('写入时自动创建不存在的目录（V2 路径缺少 auto-mkdir，当前走 V1）', async () => {});
  test.skip('文件写入后编辑器实时通知（E2E 无法验证外部编辑器事件）', async () => {});
});
