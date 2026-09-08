/**
 * Regional Approval Business acceptance E2E.
 *
 * Runs only against the deterministic local Fixture profile. Live sales-plan
 * adapter contracts remain in their dedicated query-enabled specs.
 */
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import os from 'os';
import { expect, test } from '../fixtures';
import { CHAT_INPUT, createErrorCollector, goToSettings } from '../helpers';
import { httpDelete, httpPost } from '../helpers/httpBridge';

const BUSINESS_SCREENSHOT_WIDTHS = [900, 1280, 1536] as const;

const setZoomFactor = async (electronApp: ElectronApplication, factor: number): Promise<void> => {
  await electronApp.evaluate(({ BrowserWindow }, nextFactor) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.webContents.isDevToolsOpened());
    window?.webContents.setZoomFactor(nextFactor);
  }, factor);
};

const conversationRegion = (page: Page): Locator => page.locator('aside[data-testid$="-conversation-region"]');

const fixtureQueueBody = (page: Page): Locator => page.getByRole('region', { name: '审批核对队列' }).locator('tbody');

const surfaceContextRevisionFromContent = (content: string): number => {
  const serialized = content.match(/\[\[AION_SURFACE_CONTEXT\]\]\n([^\n]+)\n\[\[\/AION_SURFACE_CONTEXT\]\]/)?.[1];
  return serialized ? Number((JSON.parse(serialized) as { revision?: number }).revision ?? 0) : 0;
};

const enterBusiness = async (page: Page): Promise<void> => {
  const switcher = page.getByTestId('assistant-surface-switcher');
  await expect(switcher).toContainText('GEAUi');
  await switcher.click();
  const modeDialog = page.locator('.arco-drawer-wrapper:visible').last();
  await expect(modeDialog.getByTestId('assistant-surface-option-general')).toHaveAttribute('aria-pressed', 'true');
  await modeDialog.getByTestId('assistant-surface-option-business').click();
  await expect(modeDialog).toBeHidden();
  await expect(page.locator('.arco-drawer-wrapper:visible')).toHaveCount(0);
  await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
};

const selectOption = async (page: Page, label: string, option: string): Promise<void> => {
  const combobox = page.getByRole('combobox', { name: label, exact: true });
  await combobox.click();
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  const popup = page.locator('.arco-trigger:visible:not([class*="exit"]) .arco-select-popup:visible').last();
  await expect(popup).toBeVisible();
  await popup.getByRole('option', { name: option, exact: true }).click();
  await expect(popup).toBeHidden();
  await expect(combobox).toContainText(option);
};

const writableQueueRows = async (page: Page): Promise<Locator[]> => {
  const rows = fixtureQueueBody(page).locator('label[aria-disabled="false"]:visible');
  await expect(rows).toHaveCount(2);
  return rows.all();
};

test.describe('Regional Approval Business', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      process.env.AIONUI_ASSISTANT_SURFACE_FIXTURES !== '1' ||
        process.env.AIONUI_E2E_AUTH_BYPASS !== '1' ||
        process.env.AIONUI_E2E_SALES_PLAN_QUERY === '1',
      'Run in the isolated Fixture profile without the live sales-plan query flag.'
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${page.url().split('#')[0]}#/guid`);
    await page.evaluate(() => {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('aionui:assistant-surface:')) sessionStorage.removeItem(key);
      }
    });
    await page.reload();
    await expect(page.getByTestId('assistant-surface-switcher')).toBeVisible();
  });

  test('keeps General unchanged and renders the three Business domains at every acceptance width', async ({ page }) => {
    await expect.poll(() => new URL(page.url()).hash).toBe('#/guid');
    const initialGeneralInput = page.locator(CHAT_INPUT).filter({ visible: true }).first();
    await initialGeneralInput.scrollIntoViewIfNeeded();
    await expect(initialGeneralInput).toBeVisible();
    await expect(initialGeneralInput).toBeEnabled();
    await expect(page.getByTestId('regional-approval-workbench')).toBeHidden();
    await expect(page.getByTestId('assistant-surface-switcher')).toContainText('GEAUi');

    const wideConnectorWidths = new Map<number, number>();

    /* oxlint-disable no-await-in-loop -- one shared Electron window must verify each acceptance width serially. */
    for (const width of BUSINESS_SCREENSHOT_WIDTHS) {
      await page.setViewportSize({ width, height: width === 900 ? 900 : 960 });
      await enterBusiness(page);

      const navigation = page.getByTestId('assistant-surface-navigation');
      const workbench = page.getByTestId('regional-approval-workbench');
      const conversation = conversationRegion(page);
      await expect(navigation).toBeVisible();
      await expect(workbench).toBeVisible();
      await expect(conversation).toBeVisible();

      const stageLane = page.getByRole('navigation', { name: '审批阶段' });
      const stageConnectors = stageLane.locator(':scope > span[aria-hidden="true"]');
      await expect(stageConnectors).toHaveCount(4);
      const stageGeometry = await stageLane.evaluate((lane) => {
        const viewport = lane.parentElement;
        if (!viewport) return null;
        const laneRect = lane.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();
        const buttons = [...lane.querySelectorAll(':scope > button')].map((button) => button.getBoundingClientRect());
        const connectors = [...lane.querySelectorAll(':scope > span[aria-hidden="true"]')].map((connector) =>
          connector.getBoundingClientRect()
        );
        return {
          viewportWidth: viewportRect.width,
          laneWidth: laneRect.width,
          leftInset: buttons[0]?.left - viewportRect.left,
          rightInset: viewportRect.right - buttons.at(-1)!.right,
          connectorWidths: connectors.map((connector) => connector.width),
          scrollWidth: viewport.scrollWidth,
          clientWidth: viewport.clientWidth,
        };
      });
      expect(stageGeometry).not.toBeNull();
      if (width >= 1280) {
        expect(stageGeometry!.laneWidth).toBeGreaterThanOrEqual(stageGeometry!.viewportWidth - 1);
        expect(stageGeometry!.leftInset).toBeGreaterThanOrEqual(10);
        expect(stageGeometry!.leftInset).toBeLessThanOrEqual(18);
        expect(stageGeometry!.rightInset).toBeGreaterThanOrEqual(10);
        expect(stageGeometry!.rightInset).toBeLessThanOrEqual(18);
        expect(Math.max(...stageGeometry!.connectorWidths) - Math.min(...stageGeometry!.connectorWidths)).toBeLessThan(
          1
        );
        expect(Math.min(...stageGeometry!.connectorWidths)).toBeGreaterThanOrEqual(20);
        wideConnectorWidths.set(
          width,
          stageGeometry!.connectorWidths.reduce((sum, connectorWidth) => sum + connectorWidth, 0) /
            stageGeometry!.connectorWidths.length
        );
      } else {
        expect(stageGeometry!.scrollWidth).toBeGreaterThan(stageGeometry!.clientWidth);
      }
      await expect(navigation.getByTestId('assistant-surface-navigation-group-contracts')).toHaveCount(0);
      await expect(navigation.getByTestId('assistant-surface-navigation-contract')).toHaveCount(0);
      await expect(navigation.getByText('合同管理', { exact: true })).toHaveCount(0);
      await expect(navigation.getByText('合同审查 Agent', { exact: true })).toHaveCount(0);
      await expect(page.getByText('当前 4 条 · 待审批 2 条', { exact: true })).toBeVisible();
      await expect(page.locator('.arco-drawer-wrapper:visible')).toHaveCount(0);

      const conversationHeader = conversation.locator('header');
      const conversationHistory = conversationHeader.getByLabel('历史对话');
      const conversationSelect = conversationHeader.getByTestId('forecast-conversation-select');
      const newConversation = conversationHeader.getByTestId('forecast-new-conversation');
      await expect(conversationHeader).toBeVisible();
      await expect(conversationHistory).toBeVisible();
      await expect(conversationSelect).toBeVisible();
      await expect(conversationSelect).toBeEnabled();
      await expect(newConversation).toBeVisible();
      await expect(newConversation).toBeEnabled();

      const [
        navigationBox,
        workbenchBox,
        conversationBox,
        conversationHeaderBox,
        conversationHistoryBox,
        conversationSelectBox,
        newConversationBox,
      ] = await Promise.all([
        navigation.boundingBox(),
        workbench.boundingBox(),
        conversation.boundingBox(),
        conversationHeader.boundingBox(),
        conversationHistory.boundingBox(),
        conversationSelect.boundingBox(),
        newConversation.boundingBox(),
      ]);
      expect(navigationBox).not.toBeNull();
      expect(workbenchBox).not.toBeNull();
      expect(conversationBox).not.toBeNull();
      expect(conversationHeaderBox).not.toBeNull();
      expect(conversationHistoryBox).not.toBeNull();
      expect(conversationSelectBox).not.toBeNull();
      expect(newConversationBox).not.toBeNull();
      expect(navigationBox!.x).toBeLessThan(workbenchBox!.x);
      expect(workbenchBox!.x).toBeLessThan(conversationBox!.x);
      for (const controlBox of [conversationHistoryBox!, conversationSelectBox!, newConversationBox!]) {
        expect(controlBox.x).toBeGreaterThanOrEqual(conversationHeaderBox!.x - 1);
        expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
          conversationHeaderBox!.x + conversationHeaderBox!.width + 1
        );
        expect(controlBox.y).toBeGreaterThanOrEqual(conversationHeaderBox!.y - 1);
        expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
          conversationHeaderBox!.y + conversationHeaderBox!.height + 1
        );
      }
      const controlsOverlap =
        conversationHistoryBox!.x + conversationHistoryBox!.width > newConversationBox!.x + 1 &&
        newConversationBox!.x + newConversationBox!.width > conversationHistoryBox!.x + 1 &&
        conversationHistoryBox!.y + conversationHistoryBox!.height > newConversationBox!.y + 1 &&
        newConversationBox!.y + newConversationBox!.height > conversationHistoryBox!.y + 1;
      expect(controlsOverlap).toBe(false);
      expect(await conversation.evaluate((element) => Boolean(element.closest('.arco-drawer')))).toBe(false);

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(overflow.document).toBeLessThanOrEqual(1);
      expect(overflow.body).toBeLessThanOrEqual(1);

      const tableHasInternalScroll = await page
        .getByRole('region', { name: '审批核对队列' })
        .locator('.arco-table-container')
        .evaluate((table) => {
          let current: HTMLElement | null = table.parentElement;
          while (current) {
            const overflowX = window.getComputedStyle(current).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll') return true;
            current = current.parentElement;
          }
          return false;
        });
      expect(tableHasInternalScroll).toBe(true);

      await page.screenshot({ path: `tests/e2e/results/regional-approval-business-${width}.png` });
      await page.getByTestId('assistant-surface-switcher').click();
      await page.getByTestId('assistant-surface-option-general').click();
      await expect.poll(() => new URL(page.url()).hash).toBe('#/guid');
      const generalInput = page.locator(CHAT_INPUT).filter({ visible: true }).first();
      await generalInput.scrollIntoViewIfNeeded();
      await expect(generalInput).toBeVisible();
      await expect(generalInput).toBeEnabled();
      await expect(page.getByTestId('regional-approval-workbench')).toBeHidden();
      await expect(page.getByTestId('assistant-surface-switcher')).toContainText('GEAUi');
    }
    /* oxlint-enable no-await-in-loop */
    expect(wideConnectorWidths.get(1536)).toBeGreaterThan(wideConnectorWidths.get(1280)!);
  });

  test('covers stages, dimensions, versions, six filters, queue evidence, and pagination', async ({ page }) => {
    await enterBusiness(page);
    const queue = page.getByRole('region', { name: '审批核对队列' });
    const stageLane = page.getByRole('navigation', { name: '审批阶段' });

    const clippedStageLabels = await stageLane.locator('button').evaluateAll((buttons) => {
      const viewport = buttons[0]?.closest('nav')?.parentElement;
      if (!viewport) return [{ stage: 'missing-viewport' }];
      const viewportRect = viewport.getBoundingClientRect();
      return buttons.flatMap((button) => {
        const title = button.querySelector('strong');
        const copy = title?.parentElement;
        const progress = copy?.querySelector('small');
        if (!copy || !title || !progress) return [{ stage: button.textContent?.trim() ?? 'unknown' }];

        const elements = { button, copy, title, progress };
        const clipped = Object.entries(elements).flatMap(([part, element]) => {
          const rect = element.getBoundingClientRect();
          return rect.top < viewportRect.top - 0.5 || rect.bottom > viewportRect.bottom + 0.5 ? [part] : [];
        });
        const copyRect = copy.getBoundingClientRect();
        const progressRect = progress.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        return clipped.length > 0
          ? [
              {
                stage: title.textContent?.trim() ?? 'unknown',
                clipped,
                viewportHeight: viewportRect.height,
                buttonHeight: buttonRect.height,
                buttonTop: buttonRect.top - viewportRect.top,
                buttonBottom: buttonRect.bottom - viewportRect.bottom,
                buttonDisplay: getComputedStyle(button).display,
                buttonAlignItems: getComputedStyle(button).alignItems,
                copyHeight: copyRect.height,
                copyTop: copyRect.top - viewportRect.top,
                copyBottomOverflow: copyRect.bottom - viewportRect.bottom,
                copyDisplay: getComputedStyle(copy).display,
                copyParentDisplay: getComputedStyle(copy.parentElement!).display,
                copyParentLineHeight: getComputedStyle(copy.parentElement!).lineHeight,
                progressHeight: progressRect.height,
                progressBottomOverflow: progressRect.bottom - viewportRect.bottom,
                progressLineHeight: getComputedStyle(progress).lineHeight,
                viewportOverflowY: getComputedStyle(viewport).overflowY,
              },
            ]
          : [];
      });
    });
    expect(clippedStageLabels).toEqual([]);

    await Promise.all(
      [
        '组织 / 范围',
        'AI 核对意见',
        '计划数量',
        '计划金额',
        '数量 / 金额进度',
        '调整',
        '版本对比',
        '退回原因',
        '审批状态',
      ].map((heading) => expect(queue.getByRole('columnheader', { name: heading })).toBeVisible())
    );
    await expect(queue.getByText('3 家客户未提报；2 个 SKU 偏离历史销量')).toBeVisible();

    const dimensions = page.getByRole('tablist', { name: '审批队列维度' });
    await expect(dimensions.getByRole('tab', { name: '按省区' })).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('regional-approval-stage-category').click();
    await expect(page.getByTestId('regional-approval-current-stage')).toHaveText('品类计划审核');
    await expect(page.getByTestId('regional-approval-stage-province')).toHaveAttribute('data-state', 'completed');
    await expect(page.getByTestId('regional-approval-stage-area')).toHaveAttribute('data-state', 'completed');
    await Promise.all(
      ['按大区', '按省区', '按区域', '按基地', '按客户'].map((dimension) =>
        expect(dimensions.getByRole('tab', { name: dimension })).toBeVisible()
      )
    );
    await page.getByTestId('regional-approval-stage-customer').click();
    await expect(dimensions.getByRole('tab')).toHaveCount(1);
    await expect(dimensions.getByRole('tab', { name: '按客户' })).toBeVisible();
    await page.getByTestId('regional-approval-stage-area').click();

    await page.getByRole('switch', { name: '启用品类比较维度' }).click();
    await expect(queue.getByRole('columnheader', { name: '比较类目' })).toBeVisible();
    await selectOption(page, '大区', '华北大区');
    await selectOption(page, '省区', '河北省区');
    await selectOption(page, '区域', '石家庄经销分区');
    await selectOption(page, '客户', '10154901 · 北辰食品商贸');
    await selectOption(page, '审批状态', '待审批');
    await selectOption(page, '健康度', '预警');
    await expect(page.getByText('草稿待应用', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '查询' }).click();
    await expect(page.getByText('当前 1 条 · 待审批 1 条', { exact: true })).toBeVisible();
    await selectOption(page, '当前查看版本', '上一版');
    await expect(page.getByRole('combobox', { name: '对比版本' })).toContainText('最新版');

    await page.getByRole('button', { name: '重置' }).click();
    const warningShortcut = fixtureQueueBody(page).getByRole('button', { name: '按预警筛选' });
    await warningShortcut.scrollIntoViewIfNeeded();
    await warningShortcut.click();
    await expect(page.getByRole('combobox', { name: '健康度' })).toContainText('预警');
    await expect(page.getByText('当前 1 条 · 待审批 1 条', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重置' }).click();

    await page.getByRole('combobox', { name: '每页条数' }).click();
    const sizePopup = page.locator('.arco-select-popup:visible').last();
    await Promise.all(
      ['10 条/页', '20 条/页', '50 条/页', '100 条/页'].map((size) =>
        expect(sizePopup.getByRole('option', { name: size, exact: true })).toBeVisible()
      )
    );
    await sizePopup.getByRole('option', { name: '100 条/页', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '每页条数' })).toContainText('100 条/页');
  });

  test('supports complete whole-plan and SKU adjustment evidence', async ({ page }) => {
    const errors = createErrorCollector(page);
    const assistantSurfaceConsoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('[AssistantSurface]')) {
        assistantSurfaceConsoleErrors.push(message.text());
      }
    });
    await enterBusiness(page);
    await page.getByRole('switch', { name: '启用品类比较维度' }).click();
    const openDetail = fixtureQueueBody(page).getByRole('button', {
      name: '查看 华北大区 证据与调整',
    });
    await openDetail.scrollIntoViewIfNeeded();
    await openDetail.click();
    await expect.poll(() => errors.critical()).toEqual([]);
    await expect.poll(() => assistantSurfaceConsoleErrors).toEqual([]);
    await expect.poll(() => new URL(page.url()).hash).toBe('#/assistant-surface/forecast');

    const dialog = page.getByRole('dialog', { name: '组织计划证据与 SKU 调整' });
    await expect(dialog).toContainText('当前证据、AI 建议和保存均为样例数据，不连接生产');
    await Promise.all(
      ['按省区', '按区域', '按客户', '按品类'].map((dimension) =>
        expect(dialog.getByRole('tab', { name: dimension })).toBeVisible()
      )
    );

    const planQuantity = dialog.getByRole('spinbutton', { name: '调整后的计划数量' });
    const planAmount = dialog.getByRole('spinbutton', { name: '调整后的计划金额' });
    await planQuantity.fill('12000');
    await planAmount.fill('920000');
    await dialog.getByRole('textbox', { name: '业务调整原因' }).fill('E2E Fixture 整单促销调整');

    const firstSku = page.getByTestId('approval-detail-north-area-FSKU001');
    await firstSku.getByRole('spinbutton', { name: 'FSKU001 编辑数量' }).fill('75');
    await firstSku.getByRole('spinbutton', { name: 'FSKU001 编辑金额' }).fill('6200');
    await firstSku.getByRole('button', { name: '采纳' }).click();
    await expect(firstSku.getByText('已采纳', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '整单采纳 AI 建议' }).click();
    await expect(dialog.getByText('已采纳', { exact: true })).not.toHaveCount(0);
    await firstSku.getByRole('textbox', { name: 'FSKU001 调整原因' }).fill('E2E Fixture 节庆备货调整');
    await dialog.getByRole('button', { name: '保存调整（仅本地）' }).click();
    await expect(dialog.getByText('调整已保存到本地看板草稿；尚未发送或提交。')).toBeVisible();
  });

  test('returns and submits both selected writable Fixture organizations', async ({ page }) => {
    const selectActionOption = async (label: string, option: string) => {
      const dialog = page.getByRole('dialog', { name: '区域计划审批操作' });
      const combobox = dialog.getByRole('combobox', { name: label });
      await combobox.click();
      const popup = page.locator('.arco-select-popup:visible').last();
      await popup.getByRole('option', { name: option, exact: true }).click();
      await expect(popup).toBeHidden();
    };

    await enterBusiness(page);
    const rows = await writableQueueRows(page);
    expect(rows).toHaveLength(2);
    await rows[0].click();
    await rows[1].click();
    await expect(page.getByText('已选择 2 个组织', { exact: true })).toBeVisible();

    const actionEntry = page.getByRole('button', { name: '退回', exact: true });
    await actionEntry.click();
    const actionDialog = page.getByRole('dialog', { name: '区域计划审批操作' });
    await expect(actionDialog).toContainText('2 个组织');
    await actionDialog.getByRole('button', { name: '确认退回（仅本地）' }).click();
    await selectActionOption('退回目标（必填）', '上一审批节点');
    await actionDialog.getByRole('textbox', { name: '退回原因（必填）' }).fill('补齐当前版本高偏差证据');
    await actionDialog.getByRole('button', { name: '确认退回（仅本地）' }).click();
    await expect(actionDialog.getByText('批量操作完成：成功 2 个，失败 0 个。')).toBeVisible();
    await actionDialog.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByText('已退回 · 本地样例')).toHaveCount(2);

    await actionEntry.click();
    await actionDialog.getByRole('tab', { name: '提交审批' }).click();
    const confirmationText = '我确认当前组织、版本和已保存调整摘要无误；仅生成本地样例结果。';
    const confirmationInput = actionDialog.getByRole('checkbox', { name: confirmationText });
    await expect(confirmationInput).toHaveAccessibleName(confirmationText);
    const confirmationLabel = confirmationInput.locator('xpath=ancestor::label[1]');
    await expect(confirmationLabel).toBeVisible();
    await confirmationLabel.click();
    await expect(confirmationInput).toBeChecked();
    await actionDialog.getByRole('button', { name: '确认提交（仅本地）' }).click();
    await expect(actionDialog.getByText('批量操作完成：成功 2 个，失败 0 个。')).toBeVisible();
    await actionDialog.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByText('已提交 · 本地样例')).toHaveCount(2);
  });

  test('freezes Context in one real ChatConversation and isolates another Conversation receipt', async ({ page }) => {
    const firstName = `E2E Regional Approval A ${Date.now()}`;
    const secondName = `E2E Regional Approval B ${Date.now()}`;
    const conversations = await Promise.all(
      [firstName, secondName].map((name) =>
        httpPost<{ id?: string }>(page, '/api/conversations', {
          name,
          type: 'acp',
          extra: { workspace: os.tmpdir(), custom_workspace: true, backend: 'codex', session_mode: 'full-access' },
        })
      )
    );
    const [firstId, secondId] = conversations.map(({ id }) => id);
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();

    await page.evaluate(
      ({ conversationIds }) => {
        type SentTurn = { text: string; content: string; turnId: string };
        type FetchState = { originalFetch: typeof window.fetch; turns: Record<string, SentTurn> };
        const host = window as typeof window & { __regionalApprovalFetchStub?: FetchState };
        const originalFetch = window.fetch.bind(window);
        const turns: Record<string, SentTurn> = {};
        host.__regionalApprovalFetchStub = { originalFetch, turns };
        window.fetch = async (input, init) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          const match = new URL(url, window.location.href).pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
          const conversationId = match ? decodeURIComponent(match[1]) : null;
          if (!conversationId || !conversationIds.includes(conversationId)) return originalFetch(input, init);

          const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
          if (method === 'POST') {
            const content = (JSON.parse(String(init?.body ?? '{}')) as { content?: string }).content ?? '';
            const turnId = `turn-${conversationId}`;
            turns[conversationId] = { text: content.split('\n\n[[AION_SURFACE_CONTEXT]]')[0] ?? '', content, turnId };
            return new Response(
              JSON.stringify({
                msg_id: `message-${conversationId}`,
                turn_id: turnId,
                runtime: {
                  state: 'running',
                  can_send_message: true,
                  has_task: true,
                  task_status: 'running',
                  is_processing: true,
                  pending_confirmations: 0,
                  turn_id: turnId,
                  supports_midturn_delivery: true,
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }

          const turn = turns[conversationId];
          return new Response(
            JSON.stringify({
              items: turn
                ? [
                    {
                      id: `message-${conversationId}`,
                      msg_id: `message-${conversationId}`,
                      conversation_id: conversationId,
                      type: 'text',
                      content: { content: turn.text },
                      position: 'right',
                      status: 'finish',
                      backend_turn_id: turn.turnId,
                      created_at: Date.now(),
                    },
                  ]
                : [],
              oldest_cursor: null,
              newest_cursor: null,
              has_more_before: false,
              has_more_after: false,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        };
      },
      { conversationIds: [firstId!, secondId!] }
    );

    const selectConversation = async (name: string) => {
      await page.getByTestId('forecast-conversation-select').click();
      await page.getByText(new RegExp(name)).last().click();
    };
    const sentTurn = (conversationId: string) =>
      page.evaluate((id) => {
        const host = window as typeof window & {
          __regionalApprovalFetchStub?: { turns: Record<string, { text: string; content: string; turnId: string }> };
        };
        return host.__regionalApprovalFetchStub?.turns[id] ?? null;
      }, conversationId);
    const sharedRevision = (conversationId: string) =>
      page.evaluate((id) => {
        const entry = Object.entries(sessionStorage).find(([key]) =>
          key.includes(`:conversation:${id}:last-shared-revision`)
        );
        return Number(entry ? ((JSON.parse(entry[1]) as { value?: number }).value ?? 0) : 0);
      }, conversationId);

    try {
      await enterBusiness(page);
      await selectConversation(firstName);
      const [firstWritable] = await writableQueueRows(page);
      await firstWritable.click();
      await expect(page.getByText('已选择 1 个组织', { exact: true })).toBeVisible();

      const firstText = 'Conversation A 审批核对';
      const sendbox = page.getByTestId('sendbox-input');
      const firstRevision = Number(
        (await page.getByTestId('forecast-context-status').textContent())?.match(/v(\d+)/)?.[1]
      );
      await sendbox.fill(firstText);
      await page.getByTestId('sendbox-send-btn').click();
      await expect.poll(async () => (await sentTurn(firstId!))?.text).toBe(firstText);
      const frozenFirstTurn = await sentTurn(firstId!);
      expect(frozenFirstTurn?.content).toContain('[[AION_SURFACE_CONTEXT]]');
      expect(surfaceContextRevisionFromContent(frozenFirstTurn?.content ?? '')).toBe(firstRevision);
      await expect.poll(() => sharedRevision(firstId!)).toBe(firstRevision);
      await expect.poll(() => sharedRevision(secondId!)).toBe(0);

      await page.getByTestId('regional-approval-stage-category').click();
      await expect(page.getByTestId('regional-approval-current-stage')).toHaveText('品类计划审核');
      expect(surfaceContextRevisionFromContent(frozenFirstTurn?.content ?? '')).toBe(firstRevision);

      await selectConversation(secondName);
      await expect(page.getByText(firstText, { exact: true })).toHaveCount(0);
      const secondText = 'Conversation B 审批核对';
      const secondRevision = Number(
        (await page.getByTestId('forecast-context-status').textContent())?.match(/v(\d+)/)?.[1]
      );
      await sendbox.fill(secondText);
      await page.getByTestId('sendbox-send-btn').click();
      await expect.poll(async () => (await sentTurn(secondId!))?.text).toBe(secondText);
      await expect.poll(() => sharedRevision(secondId!)).toBe(secondRevision);

      await selectConversation(firstName);
      await expect(page.getByText(firstText, { exact: true })).toBeVisible();
      await expect(page.getByText(secondText, { exact: true })).toHaveCount(0);
      expect(surfaceContextRevisionFromContent((await sentTurn(firstId!))?.content ?? '')).toBe(firstRevision);
    } finally {
      await page.evaluate(() => {
        const host = window as typeof window & { __regionalApprovalFetchStub?: { originalFetch: typeof window.fetch } };
        if (host.__regionalApprovalFetchStub) window.fetch = host.__regionalApprovalFetchStub.originalFetch;
        delete host.__regionalApprovalFetchStub;
      });
      await Promise.all(
        conversations.map(({ id }) =>
          id ? httpDelete(page, `/api/conversations/${encodeURIComponent(id)}`).catch(() => {}) : Promise.resolve()
        )
      );
    }
  });

  test('keeps keyboard controls and all three domains usable in dark mode at 200% zoom', async ({
    electronApp,
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await goToSettings(page, 'system');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    try {
      await page.goto(`${page.url().split('#')[0]}#/guid`);
      const switcher = page.getByTestId('assistant-surface-switcher');
      await switcher.focus();
      await switcher.press('Enter');
      const businessOption = page.getByTestId('assistant-surface-option-business');
      await businessOption.focus();
      await expect(businessOption).toBeFocused();
      await businessOption.press('Enter');
      await expect(page.locator('.arco-drawer-wrapper:visible')).toHaveCount(0);

      await page.setViewportSize({ width: 1800, height: 900 });
      await setZoomFactor(electronApp, 2);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(900);
      await expect(page.getByTestId('assistant-surface-navigation')).toBeVisible();
      await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
      await expect(conversationRegion(page)).toBeVisible();
      await expect(page.getByTestId('regional-approval-stage-area')).toBeVisible();
      await expect(page.locator('.arco-drawer-wrapper:visible')).toHaveCount(0);

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(overflow.document).toBeLessThanOrEqual(1);
      expect(overflow.body).toBeLessThanOrEqual(1);
    } finally {
      await setZoomFactor(electronApp, 1);
      await page.setViewportSize({ width: 1280, height: 800 });
      await (async () => {
        await page.goto(`${page.url().split('#')[0]}#/settings/system`);
        await expect(page.getByTestId('theme-toggle')).toBeVisible();
        if ((await page.locator('html').getAttribute('data-theme')) === 'dark') {
          await page.getByTestId('theme-toggle').click();
        }
      })().catch(() => {});
    }
  });

  test('keeps compact approval controls and all four totals usable across widths and themes', async ({
    page,
  }, testInfo) => {
    /* oxlint-disable no-await-in-loop -- exercise one shared Electron window serially across themes and sizes. */
    for (const theme of ['light', 'dark']) {
      await page.goto(`${page.url().split('#')[0]}#/settings/system`);
      const toggle = page.getByTestId('theme-toggle');
      await expect(toggle).toBeVisible();
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) await toggle.click();
      await page.goto(`${page.url().split('#')[0]}#/guid`);
      if (!(await page.getByTestId('assistant-surface-navigation').isVisible())) {
        await page.getByTestId('assistant-surface-switcher').click();
        await page.getByTestId('assistant-surface-option-business').click();
      }
      await page.getByTestId('assistant-surface-navigation-forecast').click();
      for (const width of [1920, 1280, 900]) {
        await page.setViewportSize({ width, height: 1000 });
        const board = page.getByTestId('regional-approval-workbench');
        await expect(board).toBeVisible();
        await expect(page.getByRole('button', { name: '配置模型', exact: true })).toBeVisible();
        await expect(page.locator('.arco-message-error').filter({ hasText: '未配置模型' })).toHaveCount(0);
        await expect(page.getByTestId('regional-approval-current-stage')).toHaveCount(0);
        const totals = page.getByRole('region', { name: '当前筛选范围统计' });
        for (const label of ['目标数量', '目标金额', '当前数量', '当前金额']) {
          await expect(totals.getByText(label, { exact: true })).toBeVisible();
        }
        const filterToggle = page.getByRole('button', { name: '筛选条件', exact: true });
        if (width === 900) {
          await expect(filterToggle).toBeVisible();
          await expect(filterToggle).toHaveAttribute('aria-expanded', 'false');
          const table = await page.getByRole('region', { name: '审批核对队列' }).locator('.arco-table').boundingBox();
          expect(table!.y).toBeLessThan(817);
          await filterToggle.click();
          await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
        }
        await selectOption(page, '健康度', '预警');
        const query = page.getByRole('button', { name: '查询', exact: true });
        await query.focus();
        await expect(query).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: '重置', exact: true })).toBeFocused();
        await selectOption(page, '健康度', '全部健康度');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(1);
        if (width === 900) await filterToggle.click();
        await page.screenshot({ path: testInfo.outputPath(`approval-${theme}-${width}.png`), fullPage: true });
      }
    }
    /* oxlint-enable no-await-in-loop */
  });
});
