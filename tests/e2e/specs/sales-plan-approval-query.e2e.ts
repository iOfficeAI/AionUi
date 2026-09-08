import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invokeBridge } from '../helpers';
import { startMockGeaLarkServer, type MockGeaLarkServer } from '../helpers/mock-gea-lark-server';
import { expect, test } from '../fixtures';

const PERIOD_ID = '9007199254740993';

test.describe('Sales-plan approval query', () => {
  let mockGea: MockGeaLarkServer;
  let certificate: string;
  let tlsDirectory: string;
  let previousGeaUrl: string | undefined;
  test.beforeAll(async () => {
    previousGeaUrl = process.env.AIONUI_GEA_BASE_URL;
    tlsDirectory = mkdtempSync(join(tmpdir(), 'aionui-sales-plan-tls-'));
    const key = join(tlsDirectory, 'key.pem');
    const cert = join(tlsDirectory, 'cert.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
      ],
      { stdio: 'ignore' }
    );
    certificate = readFileSync(cert, 'utf8');
    mockGea = await startMockGeaLarkServer(['sales-plan:plan:category-approve'], {
      key: readFileSync(key, 'utf8'),
      cert: certificate,
    });
    process.env.AIONUI_GEA_BASE_URL = mockGea.baseUrl;
  });
  test.afterAll(async () => {
    await mockGea?.close();
    if (tlsDirectory) rmSync(tlsDirectory, { recursive: true, force: true });
    if (previousGeaUrl === undefined) delete process.env.AIONUI_GEA_BASE_URL;
    else process.env.AIONUI_GEA_BASE_URL = previousGeaUrl;
  });
  test.beforeEach(async ({ page, electronApp }, testInfo) => {
    await electronApp.evaluate(({ session }, cert) => {
      session.defaultSession.setCertificateVerifyProc((request, callback) => {
        const pinned =
          request.hostname === '127.0.0.1' && request.certificate.data.replace(/\s/g, '') === cert.replace(/\s/g, '');
        callback(pinned ? 0 : -3);
      });
    }, certificate);
    await page.setViewportSize({ width: 1280, height: 1000 });
    test.skip(
      process.env.AIONUI_ASSISTANT_SURFACE_FIXTURES !== '1' ||
        process.env.AIONUI_E2E_AUTH_BYPASS !== '1' ||
        process.env.AIONUI_E2E_SALES_PLAN_QUERY !== '1',
      'Run with the isolated Assistant Surface, E2E auth-bypass, and sales-plan query flags.'
    );
    await page.addInitScript(
      ({ periodId, saveStatus }) => {
        const originalFetch = window.fetch.bind(window);
        const e2eWindow = window as Window & {
          __salesPlanQueryRequests?: string[];
          __salesPlanActionBodies?: unknown[];
        };
        e2eWindow.__salesPlanQueryRequests = [];
        e2eWindow.__salesPlanActionBodies = [];
        // oxlint-disable-next-line eslint-plugin-unicorn/consistent-function-scoping -- addInitScript serializes only this closure.
        const sku = (versionId: string, skuCode: string, qty: string) => ({
          id: `${versionId}-${skuCode}`,
          versionId,
          skuCode,
          productCategName: 'E2E 饮品',
          baseQty: '10',
          qty,
          price: '8.50',
          amt: '102.00',
          amtBase: '85.00',
        });
        window.fetch = async (input, init) => {
          const rawUrl =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
          const url = new URL(rawUrl, window.location.href);
          if (url.protocol === 'aionui-core:' || !url.pathname.startsWith('/api/gea/sales-plan/')) {
            return originalFetch(input, init);
          }
          e2eWindow.__salesPlanQueryRequests?.push(url.toString());
          const requestedPage = Number(url.searchParams.get('pageNo') ?? '1');
          const version = (id: string, seq: number, effective: boolean) => ({
            id,
            planId: 'e2e-plan',
            seq,
            periodId,
            planTypeCode: 'MONTHLY',
            dealerCode: '9007199254740997',
            orgCode: 'ORG-E2E',
            provinceCode: 'PROVINCE-E2E',
            areaCode: 'AREA-E2E',
            baseName: 'E2E 第 1 页基地',
            status: saveStatus ?? 2,
            effective,
            targetAmount: seq === 2 ? '9999999999999999.99' : '9999999999999982.99',
            targetQty: seq === 2 ? '123456789012.345' : '123456789010.345',
            submitter: `E2E 提交人 ${seq}`,
            submitTime: `2026-09-0${seq}T08:00:00Z`,
          });
          const versions = [version('e2e-version-2', 2, true), version('e2e-version-1', 1, false)];
          let data: unknown;
          if (url.pathname.endsWith('/periods')) {
            data = {
              records: [
                {
                  periodId,
                  tenantId: '9007199254740994',
                  periodMonth: '2026-09',
                  planType: '月度计划',
                  planTypeCode: 'MONTHLY',
                  status: 'OPEN',
                },
              ],
              total: 1,
              size: 100,
              current: 1,
              pages: 1,
            };
          } else if (url.pathname.endsWith('/e2e-version-2/actions')) {
            const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            const rawBody =
              typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.text() : '{}';
            const body = JSON.parse(rawBody);
            e2eWindow.__salesPlanActionBodies?.push(body);
            data = {
              planId: 'e2e-plan',
              versionId: 'e2e-version-2',
              fromStatus: saveStatus ?? 2,
              toStatus: saveStatus ?? 3,
              replayed: false,
              requestId: headers.get('X-Request-Id'),
              traceId: 'trace-e2e-action',
              auditId: 'sales-plan-log:42',
            };
          } else if (url.pathname.endsWith('/e2e-plan/versions')) {
            data = versions;
          } else if (url.pathname.endsWith('/e2e-plan/logs')) {
            data = [
              {
                id: 'e2e-log-1',
                planId: 'e2e-plan',
                versionId: 'e2e-version-1',
                fromStatus: 3,
                toStatus: 4,
                actionCode: 'SUBMIT',
                operatorCode: 'operator-e2e',
                operatorName: 'E2E 审批人',
                remark: 'E2E 操作日志',
                actionAt: '2026-09-01T08:00:00Z',
              },
            ];
          } else if (url.pathname.includes('/plans/versions/') && url.pathname.endsWith('/skus')) {
            const versionId = decodeURIComponent(url.pathname.split('/').at(-2)!);
            data = [sku(versionId, versionId === 'e2e-version-2' ? 'REAL-E2E-SKU' : 'OLDER-E2E-SKU', '12')];
          } else if (url.pathname.endsWith('/e2e-plan/compare')) {
            data = [
              {
                skuCode: 'REAL-E2E-SKU',
                changeType: 'UPDATED',
                before: sku(url.searchParams.get('fromVersionId')!, 'REAL-E2E-SKU', '10'),
                after: sku(url.searchParams.get('toVersionId')!, 'REAL-E2E-SKU', '12'),
                qtyDelta: '2',
                amountDelta: '17.00',
              },
            ];
          } else if (url.pathname.endsWith('/e2e-plan')) {
            data = {
              currentVersion: versions[0],
              skus: saveStatus
                ? [
                    {
                      ...sku('e2e-version-2', '10001', '10'),
                      areaConfirmedQty: '12',
                      categoryConfirmedQty: '13',
                      categoryConfirmedAmount: '110.50',
                    },
                  ]
                : [sku('stale-nested-version', 'NESTED-E2E-SKU', '999')],
              versions: [],
              logs: [],
            };
          } else {
            const requestedStatus = url.searchParams.get('status');
            const statusTotals: Record<string, number> = {
              '1': 0,
              '2': 25,
              '3': 0,
              '4': 58,
              '5': 9,
              '6': 6,
              '7': 0,
              '8': 0,
              '9': 1,
              '10': 1,
            };
            const isQueueRequest = requestedStatus === null;
            data = {
              records: isQueueRequest
                ? [
                    {
                      planId: 'e2e-plan',
                      versionId: 'e2e-version-2',
                      seq: 2,
                      periodId,
                      planTypeCode: 'MONTHLY',
                      dealerCode: '9007199254740997',
                      orgCode: 'ORG-E2E',
                      provinceCode: 'PROVINCE-E2E',
                      areaCode: 'AREA-E2E',
                      baseName: `E2E 第 ${requestedPage} 页基地`,
                      status: saveStatus ?? 2,
                      returnReason: null,
                      targetQty: '123456789012.345',
                      targetAmount: '9999999999999999.99',
                      skuCount: 3,
                      currentQty: '123456789012.340',
                      currentAmount: '9999999999999999.90',
                    },
                  ]
                : [],
              total: isQueueRequest ? 100 : (statusTotals[requestedStatus] ?? 0),
              size: Number(url.searchParams.get('pageSize') ?? '20'),
              current: requestedPage,
              pages: isQueueRequest ? 5 : 1,
            };
            if (isQueueRequest && Number(url.searchParams.get('pageSize')) === 200) {
              const summaryPage = data as { records: Array<Record<string, unknown>>; pages: number };
              const template = summaryPage.records[0];
              summaryPage.records = Array.from({ length: 100 }, (_, index) => ({
                ...template,
                planId: `progress-plan-${index}`,
                versionId: `progress-version-${index}`,
                dealerCode: `progress-dealer-${index}`,
                dealerName: `E2E 客户 ${index}`,
                areaName: 'E2E 华东大区',
                provinceName: 'E2E 江苏省区',
                orgName: 'E2E 苏南区域',
                status: index < 25 ? 2 : index < 83 ? 4 : index < 92 ? 5 : index < 98 ? 6 : index === 98 ? 9 : 10,
              }));
              summaryPage.pages = 1;
            }
          }
          return new Response(JSON.stringify({ data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        };
      },
      {
        periodId: PERIOD_ID,
        saveStatus: testInfo.title.includes('standalone SAVE status 5')
          ? 5
          : testInfo.title.includes('standalone SAVE status 10')
            ? 10
            : undefined,
      }
    );
    await page.evaluate(() => {
      for (const key of Object.keys(window.sessionStorage)) {
        if (key.startsWith('aionui:assistant-surface:v1:forecast:')) window.sessionStorage.removeItem(key);
      }
    });
    const created = await invokeBridge<{ success: boolean; data: { qrcodeId: string } }>(
      page,
      'lark-auth.create-qr-session'
    );
    expect(created.success).toBe(true);
    const authenticated = await invokeBridge<{ success: boolean }>(
      page,
      'lark-auth.poll-qr-session',
      { qrcodeId: created.data.qrcodeId },
      60_000
    );
    expect(authenticated, JSON.stringify(authenticated)).toMatchObject({ success: true });
    await page.goto(`${page.url().split('#')[0]}#/guid`);
    await page.reload();
    await expect(page.getByTestId('assistant-surface-switcher')).toBeVisible();
  });

  test('keeps General unchanged and loads the Business queue through the Renderer HTTP adapter', async ({ page }) => {
    await page.getByTestId('assistant-surface-switcher').click();
    let modeDrawer = page.locator('.arco-drawer-wrapper:visible').last();
    await modeDrawer.getByTestId('assistant-surface-option-general').click();
    await expect(page.getByTestId('regional-approval-workbench')).toBeHidden();
    await expect.poll(() => new URL(page.url()).hash).toBe('#/guid');
    await expect(page.getByTestId('assistant-surface-switcher')).toBeVisible();

    await page.getByTestId('assistant-surface-switcher').click();
    modeDrawer = page.locator('.arco-drawer-wrapper:visible').last();
    await modeDrawer.getByTestId('assistant-surface-option-business').click();

    await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
    await expect(page.getByText('GEA · 用户会话队列', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '销售计划周期' })).toHaveText('2026-09');
    await expect(page.getByText('E2E 第 1 页基地', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/9,999,999,999,999,999\.90/).first()).toBeVisible();
    await expect(page.getByText(/AI 建议和组织候选/)).toHaveCount(0);
    await expect(page.getByTestId('regional-approval-current-stage')).toHaveCount(0);
    await expect(page.getByText('审批操作已安全关闭')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '各节点数据状态' })).toBeVisible();
    await expect(page.getByTestId('regional-approval-stage-customer')).toContainText('进度 94%');
    await expect(page.getByTestId('regional-approval-stage-region')).toHaveAttribute('data-state', 'partial');
    await expect(page.getByTestId('regional-approval-stage-province')).toHaveAttribute('data-state', 'partial');
    await expect(page.getByTestId('regional-approval-stage-area')).toHaveAttribute('data-state', 'critical');
    await expect(page.getByTestId('regional-approval-stage-province')).not.toHaveAttribute('aria-current');
    await expect(page.getByTestId('regional-approval-stage-area')).toBeEnabled();
    await expect(page.getByRole('button', { name: '退回' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '通过' })).toBeDisabled();
    await expect(page.getByRole('columnheader', { name: '审批操作' })).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: '审批队列维度' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '大区' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '查询' })).toBeDisabled();
    const requests = await page.evaluate(
      () => (window as Window & { __salesPlanQueryRequests?: string[] }).__salesPlanQueryRequests ?? []
    );
    const queueRequest = new URL(
      requests.find((url) => url.includes('/api/gea/sales-plan/plans?') && url.includes('pageSize=20'))!
    );
    expect(queueRequest.searchParams.get('periodId')).toBe(PERIOD_ID);
    expect(queueRequest.searchParams.get('planTypeCode')).toBe('MONTHLY');
    expect(queueRequest.searchParams.has('status')).toBe(false);
    expect(queueRequest.searchParams.get('pageNo')).toBe('1');
    expect(queueRequest.searchParams.get('pageSize')).toBe('20');
    expect(queueRequest.searchParams.has('areaCode')).toBe(false);
    expect(queueRequest.searchParams.has('provinceCode')).toBe(false);
    expect(queueRequest.searchParams.has('orgCode')).toBe(false);
    expect(queueRequest.searchParams.has('dealerCode')).toBe(false);

    await page.getByTestId('regional-approval-stage-province').click();
    await expect(page.getByTestId('regional-approval-stage-province')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const currentRequests = await page.evaluate(
          () => (window as Window & { __salesPlanQueryRequests?: string[] }).__salesPlanQueryRequests ?? []
        );
        const statusRequests = new Set(
          currentRequests
            .map((requestUrl) => new URL(requestUrl))
            .filter(
              (requestUrl) =>
                requestUrl.pathname.endsWith('/api/gea/sales-plan/plans') &&
                requestUrl.searchParams.get('pageSize') === '20'
            )
            .map((requestUrl) => requestUrl.searchParams.get('status'))
        );
        return statusRequests.has('3');
      })
      .toBe(true);
    await expect(page.getByText('当前账户在本周期没有可见审批数据。')).toBeVisible();
    await page.getByRole('button', { name: '重置' }).click();
    await expect(page.getByTestId('regional-approval-stage-province')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('E2E 第 1 页基地', { exact: true }).first()).toBeVisible();

    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    await page.getByRole('combobox', { name: '对比版本', exact: true }).click();
    await page
      .locator('.arco-select-popup:visible')
      .last()
      .getByRole('option', { name: '最新版', exact: true })
      .click();
    const detailDialog = page.getByRole('dialog', { name: '销售计划详情与版本证据' });
    await expect(detailDialog).toBeVisible();
    await detailDialog.getByRole('tab', { name: '版本 SKU' }).click();
    await expect(detailDialog.getByText('REAL-E2E-SKU', { exact: true })).toBeVisible();
    await expect(detailDialog.getByText('NESTED-E2E-SKU', { exact: true })).toHaveCount(0);
    await expect(detailDialog.getByText(/AI 建议暂无真实接口/)).toHaveCount(0);

    await detailDialog.getByRole('combobox', { name: 'SKU 版本' }).click();
    const visibleVersionPopup = page.locator('.arco-select-popup:visible').last();
    await visibleVersionPopup.getByRole('option', { name: /第 1 版 · e2e-version-1/ }).click();
    await expect(detailDialog.getByText('OLDER-E2E-SKU', { exact: true })).toBeVisible();
    await detailDialog.getByRole('tab', { name: '历史版本' }).click();
    await expect(detailDialog.getByText('E2E 提交人 1 · 2026-09-01T08:00:00Z')).toBeVisible();
    await detailDialog.getByRole('tab', { name: '审批日志' }).click();
    await expect(detailDialog.getByText('E2E 操作日志', { exact: true })).toBeVisible();
    await detailDialog.getByRole('tab', { name: '版本比较' }).click();
    await detailDialog.getByRole('combobox', { name: '基准版本' }).click();
    await page
      .locator('.arco-select-popup:visible')
      .last()
      .getByRole('option', { name: /第 1 版 · e2e-version-1/ })
      .click();
    await expect(detailDialog.getByText('10 → 12 (2)', { exact: true })).toBeVisible();

    const detailRequests = await page.evaluate(
      () => (window as Window & { __salesPlanQueryRequests?: string[] }).__salesPlanQueryRequests ?? []
    );
    expect(detailRequests.some((url) => new URL(url).pathname.endsWith('/plans/e2e-plan'))).toBe(true);
    expect(detailRequests.some((url) => new URL(url).pathname.endsWith('/plans/e2e-plan/versions'))).toBe(true);
    expect(detailRequests.some((url) => new URL(url).pathname.endsWith('/plans/e2e-plan/logs'))).toBe(true);
    expect(detailRequests.some((url) => new URL(url).pathname.endsWith('/versions/e2e-version-1/skus'))).toBe(true);
    expect(
      detailRequests.some((requestUrl) => {
        const url = new URL(requestUrl);
        return (
          url.pathname.endsWith('/plans/e2e-plan/compare') &&
          url.searchParams.get('fromVersionId') === 'e2e-version-1' &&
          url.searchParams.get('toVersionId') === 'e2e-version-2'
        );
      })
    ).toBe(true);
    await detailDialog.getByRole('button', { name: '关闭' }).click();
    await expect(detailDialog).toBeHidden();

    await page
      .getByTestId('regional-approval-queue-footer')
      .locator('.arco-pagination-item', { hasText: /^3$/ })
      .click();
    await expect(page.getByText('E2E 第 3 页基地', { exact: true }).first()).toBeVisible();
    await expect
      .poll(async () => {
        const currentRequests = await page.evaluate(
          () => (window as Window & { __salesPlanQueryRequests?: string[] }).__salesPlanQueryRequests ?? []
        );
        const queueRequests = currentRequests.filter((url) => url.includes('/api/gea/sales-plan/plans?'));
        return new URL(queueRequests.at(-1)!).searchParams.get('pageNo');
      })
      .toBe('3');
    const finalRequests = await page.evaluate(
      () => (window as Window & { __salesPlanQueryRequests?: string[] }).__salesPlanQueryRequests ?? []
    );
    const finalQueueRequest = new URL(
      finalRequests.findLast((requestUrl) => {
        const url = new URL(requestUrl);
        return (
          url.pathname.endsWith('/api/gea/sales-plan/plans') &&
          url.searchParams.get('pageSize') === '20' &&
          !url.searchParams.has('status')
        );
      })!
    );
    expect(finalQueueRequest.searchParams.get('pageNo')).toBe('3');

    await page.setViewportSize({ width: 760, height: 720 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(760);
    await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '各节点数据状态' })).toBeVisible();
    await page.getByRole('button', { name: '筛选条件', exact: true }).click();
    await expect(page.getByRole('button', { name: '重置' })).toBeVisible();
    const narrowBounds = await page.getByTestId('regional-approval-workbench').boundingBox();
    expect(narrowBounds).not.toBeNull();
    expect(narrowBounds!.width).toBeLessThanOrEqual(760);

    const darkColors = await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      document.body.setAttribute('arco-theme', 'dark');
      const workbench = document.querySelector<HTMLElement>('[data-testid="regional-approval-workbench"]');
      const styles = workbench ? getComputedStyle(workbench) : undefined;
      return { background: styles?.backgroundColor, foreground: styles?.color };
    });
    expect(darkColors.background).toBeTruthy();
    expect(darkColors.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(darkColors.foreground).toBeTruthy();
    expect(darkColors.foreground).not.toBe(darkColors.background);
  });
  for (const status of [5, 10]) {
    test(`standalone SAVE status ${status} preserves its version and approval state`, async ({ page }, testInfo) => {
      await page.goto(`${page.url().split('#')[0]}#/assistant-surface/forecast`);
      const board = page.getByTestId('regional-approval-workbench');
      await page.reload();
      await expect(board.getByText('可保存本地草稿', { exact: true })).toBeVisible();
      const planRow = board.getByRole('row').filter({ hasText: 'E2E 第 1 页基地' }).first();
      await planRow.locator('.arco-checkbox').click();
      await expect(board.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
      await board.getByRole('button', { name: '保存调整', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '保存本地调整草稿' });
      await dialog.getByRole('textbox', { name: 'SKU 10001 调整量' }).fill('2.125');
      await expect(dialog.getByLabel('审批节点差异汇总')).toContainText(status === 5 ? '14.125' : '15.125');
      await page.screenshot({ path: testInfo.outputPath(`save-${status}.png`), animations: 'disabled' });
      await dialog.getByRole('button', { name: '保存到本地', exact: true }).click();
      await expect(dialog).toBeHidden();
      expect(
        await page.evaluate(() => (window as Window & { __salesPlanActionBodies?: unknown[] }).__salesPlanActionBodies)
      ).toEqual([]);
      await page.reload();
      await expect(board.getByText('可保存本地草稿', { exact: true })).toBeVisible();
      if (!(await planRow.getByRole('checkbox').isChecked())) await planRow.locator('.arco-checkbox').click();
      await board.getByRole('button', { name: '保存调整', exact: true }).click();
      await expect(dialog.getByRole('textbox', { name: 'SKU 10001 调整量' })).toHaveValue('2.125');
      await expect(dialog.getByLabel('审批节点差异汇总')).toContainText(
        status === 5 ? '当前基准数量 / 金额12' : '当前基准数量 / 金额13'
      );
      await dialog.getByRole('button', { name: '保存到本地', exact: true }).click();
      expect(
        await page.evaluate(() => (window as Window & { __salesPlanActionBodies?: unknown[] }).__salesPlanActionBodies)
      ).toEqual([]);
    });
  }

  test('drills through the complete organization scope in both themes and all acceptance widths', async ({
    page,
  }, testInfo) => {
    /* oxlint-disable no-await-in-loop -- a shared Electron window checks themes and widths serially. */
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.goto(`${page.url().split('#')[0]}#/settings/system`);
      // Mobile layouts collapse the sidebar; restore the desktop host before switching themes.
      await page.reload();
      const toggle = page.getByTestId('theme-toggle');
      await expect(toggle).toBeVisible();
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) await toggle.click();
      await page.goto(`${page.url().split('#')[0]}#/assistant-surface/forecast`);
      await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
      await page.getByRole('button', { name: '查看提报进度', exact: true }).click();
      const tree = page.getByRole('region', { name: '组织审核进度' });
      await expect(tree).toBeVisible();
      await tree.getByText('E2E 华东大区', { exact: true }).click();
      await tree.getByText('E2E 江苏省区', { exact: true }).click();
      await tree.getByText('E2E 苏南区域', { exact: true }).click();
      await expect(tree.getByText('E2E 客户 0', { exact: true })).toBeVisible();
      await expect(tree.getByText('E2E 客户 99', { exact: true })).toHaveCount(0);
      await tree.getByText('仅显示未审核', { exact: true }).click();
      await expect(tree.getByRole('checkbox')).not.toBeChecked();
      await expect(tree.getByText('E2E 客户 99', { exact: true })).toBeAttached();
      for (const width of [480, 1920, 1280, 900]) {
        await page.setViewportSize({ width, height: 1000 });
        const bounds = await tree.evaluate((element) => ({ scroll: element.scrollWidth, width: element.clientWidth }));
        expect(bounds.scroll - bounds.width).toBeLessThanOrEqual(1);
        const metricColumns = await tree
          .locator('[class*="progressTreeCompletion"]')
          .evaluateAll((elements) => elements.slice(0, 5).map((element) => element.getBoundingClientRect().x));
        expect(Math.max(...metricColumns) - Math.min(...metricColumns)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath(`progress-${theme}-${width}.png`) });
      }
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    /* oxlint-enable no-await-in-loop */
  });
});
