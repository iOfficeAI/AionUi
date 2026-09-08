import type { TFunction } from 'i18next';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type {
  GeaSalesPlanListItem,
  GeaSalesPlanDetail,
  GeaSalesPlanSku,
  GeaSalesPlanPage,
  GeaSalesPlanPageQuery,
  GeaSalesPlanVersion,
} from '@/common/adapter/ipcBridge';
import RegionalApprovalWorkbench, {
  type RegionalApprovalWorkbenchContext,
} from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/RegionalApprovalWorkbench';
import type { SalesPlanQueryClient } from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/useRegionalApprovalQuery';
import type { SalesPlanDetailClient } from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/hooks/useSalesPlanDetail';
import zhCN from '@/renderer/services/i18n/locales/zh-CN/common.json';
import * as XLSX from 'xlsx-republish';

vi.mock('@/renderer/pages/assistantSurface/components/BusinessSurfaceShell', () => ({
  useBusinessSurfaceSession: () => ({ conversationId: 'conversation-query' }),
}));

const t = ((key: string, options?: Record<string, string | number>) => {
  const value = key
    .replace(/^common\./, '')
    .split('.')
    .reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[segment];
    }, zhCN);
  return Object.entries(options ?? {}).reduce(
    (text, [name, replacement]) => text.replaceAll(`{{${name}}}`, String(replacement)),
    typeof value === 'string' ? value : key
  );
}) as TFunction;

const periodPage = {
  records: [
    {
      periodId: '9007199254740993',
      tenantId: '9007199254740994',
      periodMonth: '2026-08',
      planType: '月度计划',
      planTypeCode: 'MONTHLY',
      status: 'CLOSED',
    },
    {
      periodId: '9007199254740995',
      tenantId: '9007199254740994',
      periodMonth: '2026-09',
      planType: '月度计划',
      planTypeCode: 'MONTHLY',
      status: 'OPEN',
    },
  ],
  total: 2,
  size: 100,
  current: 1,
  pages: 1,
};

const liveRow = (planId: string, status = 4): GeaSalesPlanListItem => ({
  planId,
  versionId: `${planId}-version`,
  seq: 3,
  periodId: '9007199254740995',
  planTypeCode: 'MONTHLY',
  dealerCode: '9007199254740997',
  orgCode: 'ORG-001',
  provinceCode: 'PROVINCE-01',
  areaCode: 'AREA-01',
  areaName: '华东大区',
  provinceName: '浙江省区',
  orgName: `${planId} 经销分区`,
  baseName: `${planId} 基地`,
  dealerName: `${planId} 经销商`,
  status,
  returnReason: null,
  targetQty: '123456789012.345',
  targetAmount: '9999999999999999.99',
  skuCount: 3,
  currentQty: '123456789012.340',
  currentAmount: '9999999999999999.90',
});

const liveVersion = (planId: string, id: string, seq: number): GeaSalesPlanVersion => ({
  id,
  planId,
  seq,
  periodId: '9007199254740995',
  planTypeCode: 'MONTHLY',
  dealerCode: '9007199254740997',
  status: 2,
  effective: true,
  targetAmount: '9999999999999999.99',
  targetQty: '123456789012.345',
});

const queuePage = (
  records: GeaSalesPlanListItem[],
  pagination: Partial<Pick<GeaSalesPlanPage<GeaSalesPlanListItem>, 'total' | 'size' | 'current' | 'pages'>> = {}
): GeaSalesPlanPage<GeaSalesPlanListItem> => ({
  records,
  total: pagination.total ?? records.length,
  size: pagination.size ?? 20,
  current: pagination.current ?? 1,
  pages: pagination.pages ?? 1,
});

const filteredRows = (rows: readonly GeaSalesPlanListItem[], query?: GeaSalesPlanPageQuery) =>
  rows.filter(
    (row) =>
      (query?.status === undefined || row.status === query.status) &&
      (query?.areaCode === undefined || row.areaCode === query.areaCode) &&
      (query?.provinceCode === undefined || row.provinceCode === query.provinceCode) &&
      (query?.orgCode === undefined || row.orgCode === query.orgCode) &&
      (query?.dealerCode === undefined || row.dealerCode === query.dealerCode)
  );

const listMockFor = (rows: readonly GeaSalesPlanListItem[]) =>
  vi.fn(async (query?: GeaSalesPlanPageQuery) => {
    const matches = filteredRows(rows, query);
    if (query?.pageSize === 1) return queuePage([], { total: matches.length, size: 1 });
    return queuePage(matches, {
      total: matches.length,
      size: query?.pageSize ?? 20,
      current: query?.pageNo ?? 1,
    });
  });

describe('RegionalApprovalWorkbench live sales-plan query', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('persists a local draft across remounts, isolates users and submits it only with APPROVE', async () => {
    window.localStorage.clear();
    const row = liveRow('draft-plan', 5);
    const sku = {
      id: 'sku',
      versionId: row.versionId,
      skuCode: '10001',
      qty: '10',
      areaConfirmedQty: '12',
      price: '2',
    } as GeaSalesPlanSku;
    const version = { ...liveVersion(row.planId, row.versionId, 3), status: 5 };
    const detail = { currentVersion: version, skus: [sku], versions: [version], logs: [] } as GeaSalesPlanDetail;
    const queryClient: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: listMockFor([row]) },
    };
    const detailClient: SalesPlanDetailClient = {
      detail: { invoke: vi.fn().mockResolvedValue(detail) },
      versions: { invoke: vi.fn().mockResolvedValue([version]) },
      logs: { invoke: vi.fn().mockResolvedValue([]) },
      versionSkus: { invoke: vi.fn().mockResolvedValue([sku]) },
      compare: { invoke: vi.fn().mockResolvedValue([]) },
    };
    const invoke = vi.fn(async (params) => ({
      planId: row.planId,
      versionId: row.versionId,
      fromStatus: 5,
      toStatus: 10,
      requestId: params.requestId,
      traceId: 'trace',
      auditId: 'audit',
      replayed: false,
    }));
    const props = {
      stateScope: 'draft-integration',
      t,
      onContextChange: vi.fn(),
      queryClient,
      detailClient,
      liveActionClient: { action: { invoke } },
      liveActionsEnabled: true,
      permissionCodes: ['sales-plan:plan:category-approve', 'sales-plan:plan:approve'],
    };
    const openSave = async () => {
      await screen.findAllByText('draft-plan 基地');
      const selection = screen.getByRole('checkbox');
      if (!(selection as HTMLInputElement).checked) fireEvent.click(selection);
      const button = screen.getByRole('button', { name: '保存调整' });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      return screen.findByRole('textbox', { name: 'SKU 10001 调整量' });
    };
    let view = render(<RegionalApprovalWorkbench {...props} draftStorageScope='env:tenant:user-a' />);
    fireEvent.change(await openSave(), { target: { value: '2.125' } });
    fireEvent.click(screen.getByRole('button', { name: '保存到本地' }));
    await screen.findByText('调整已保存到本地看板草稿；尚未发送或提交。');
    expect(invoke).not.toHaveBeenCalled();
    view.unmount();
    view = render(<RegionalApprovalWorkbench {...props} draftStorageScope='env:tenant:user-b' />);
    expect(await openSave()).toHaveValue('');
    view.unmount();
    view = render(<RegionalApprovalWorkbench {...props} draftStorageScope='env:tenant:user-a' />);
    expect(await openSave()).toHaveValue('2.125');
    fireEvent.click(screen.getByRole('button', { name: '保存到本地' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const approve = screen.getByRole('button', { name: '通过' });
    fireEvent.click(approve);
    expect(await screen.findByRole('textbox', { name: 'SKU 10001 调整量' })).toHaveValue('2.125');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '确认通过' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][0].request).toEqual({
      action: 'APPROVE',
      expectedStatus: 5,
      adjustments: [{ skuCode: '10001', adjustQty: '2.125' }],
    });
    await waitFor(() =>
      expect(window.localStorage.getItem('aionui:sales-plan-local-drafts:v1:env%3Atenant%3Auser-a')).toBe('{}')
    );
  });

  it('shows all four filtered-scope totals including records beyond the visible page', async () => {
    const first = {
      ...liveRow('summary-a'),
      targetQty: '10',
      targetAmount: '100.01',
      currentQty: '3',
      currentAmount: '30.01',
    };
    const second = {
      ...liveRow('summary-b'),
      targetQty: '20',
      targetAmount: '200.02',
      currentQty: '4',
      currentAmount: '40.02',
    };
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: {
        invoke: vi.fn(async (query) =>
          query?.pageSize === 200
            ? queuePage(query.pageNo === 2 ? [second] : [first], { total: 2, size: 1, current: query.pageNo, pages: 2 })
            : queuePage([first], { total: 2 })
        ),
      },
    };
    render(
      <RegionalApprovalWorkbench stateScope='scope-totals' t={t} onContextChange={vi.fn()} queryClient={client} />
    );
    const totals = await screen.findByRole('region', { name: '当前筛选范围统计' });
    await waitFor(() => expect(totals).toHaveTextContent('目标数量30'));
    expect(totals).toHaveTextContent('目标金额¥300.03');
    expect(totals).toHaveTextContent('当前数量7');
    expect(totals).toHaveTextContent('当前金额¥70.03');
    expect(within(totals).queryByText('审批权威')).not.toBeInTheDocument();
  });

  it('exports a readable workbook with business headers and exact identifiers and amounts', async () => {
    const row = {
      ...liveRow('plan-export', 5),
      dealerCode: '0009007199254740997',
      targetQty: '123456789012345.6',
      currentAmount: '2064404.28',
    };
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: listMockFor([row]) },
    };
    let exported: Blob | undefined;
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      exported = blob as Blob;
      return 'blob:export';
    });
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(
        <RegionalApprovalWorkbench stateScope='export-test' t={t} onContextChange={vi.fn()} queryClient={client} />
      );
      await screen.findAllByText('plan-export 基地');
      fireEvent.click(screen.getByRole('combobox', { name: '大区' }));
      fireEvent.click(await screen.findByRole('option', { name: '华东大区' }));
      fireEvent.click(screen.getByRole('button', { name: '导出当前页' }));
      await waitFor(() => expect(exported).toBeDefined());
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer));
        reader.addEventListener('error', reject);
        reader.readAsArrayBuffer(exported!);
      });
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]).toEqual([
        '计划单号',
        '版本号',
        '计划周期',
        '经销商编码',
        '审批状态',
        '目标数量',
        '目标金额',
        '当前数量',
        '当前金额',
      ]);
      expect(sheet.D2).toMatchObject({ t: 's', v: '0009007199254740997' });
      expect(sheet.F2).toMatchObject({ t: 's', v: '123456789012345.6' });
      expect(sheet.G2).toMatchObject({ t: 's', v: '9999999999999999.99' });
      expect(sheet.I2).toMatchObject({ t: 'n', v: 2064404.28 });
      expect(sheet.E2.v).not.toBe(5);
      const scope = XLSX.utils.sheet_to_json(workbook.Sheets['导出说明'], { header: 1 });
      expect(scope).toEqual(
        expect.arrayContaining([
          ['导出范围', '仅当前页'],
          ['计划月份', '2026-09'],
          ['页码', 1],
          ['导出条数', 1],
          ['数据版本', '当前有效版本'],
          ['大区编码', '全部'],
        ])
      );
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      click.mockRestore();
    }
  });

  it('explains missing export data instead of generating an incomplete workbook', async () => {
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: listMockFor([{ ...liveRow('missing-export'), targetAmount: '' }]) },
    };
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    try {
      render(
        <RegionalApprovalWorkbench stateScope='missing-export' t={t} onContextChange={vi.fn()} queryClient={client} />
      );
      await screen.findAllByText('missing-export 基地');
      fireEvent.click(screen.getByRole('button', { name: '导出当前页' }));
      expect(await screen.findByText('当前页缺少有效编码或数量金额数据，请刷新后重试。')).toBeVisible();
      expect(createUrl).not.toHaveBeenCalled();
    } finally {
      createUrl.mockRestore();
    }
  });

  it('reports download failures without reporting a successful export', async () => {
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: listMockFor([liveRow('failed-export')]) },
    };
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('download failed');
    });
    try {
      render(
        <RegionalApprovalWorkbench stateScope='failed-export' t={t} onContextChange={vi.fn()} queryClient={client} />
      );
      await screen.findAllByText('failed-export 基地');
      fireEvent.click(screen.getByRole('button', { name: '导出当前页' }));
      expect(await screen.findByText('导出失败，请重试；未产生文件。')).toBeVisible();
      expect(screen.queryByText(/已导出当前页/)).not.toBeInTheDocument();
    } finally {
      createUrl.mockRestore();
    }
  });

  it('does not export the previous scope when a node changes during workbook preparation', async () => {
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: listMockFor([liveRow('scope-export', 2)]) },
    };
    const createUrl = vi.spyOn(URL, 'createObjectURL');
    try {
      render(
        <RegionalApprovalWorkbench stateScope='scope-export' t={t} onContextChange={vi.fn()} queryClient={client} />
      );
      await screen.findAllByText('scope-export 基地');
      await waitFor(() => expect(screen.getByTestId('regional-approval-stage-category')).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: '导出当前页' }));
      fireEvent.click(screen.getByTestId('regional-approval-stage-category'));
      await waitFor(() =>
        expect(screen.getByTestId('regional-approval-stage-category')).toHaveAttribute('aria-pressed', 'true')
      );
      expect(await screen.findByText('当前账户在本周期没有可见审批数据。')).toBeVisible();
      expect(createUrl).not.toHaveBeenCalled();
    } finally {
      createUrl.mockRestore();
    }
  });

  it('explains an empty current-page export', async () => {
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: listMockFor([]) },
    };
    render(
      <RegionalApprovalWorkbench stateScope='empty-export' t={t} onContextChange={vi.fn()} queryClient={client} />
    );
    await screen.findByText('当前账户在本周期没有可见审批数据。');
    fireEvent.click(screen.getByRole('button', { name: '导出当前页' }));
    expect(await screen.findByText('当前版本和已应用筛选范围没有可导出数据。')).toBeVisible();
  });

  it('keeps the production workbench fail-closed while preserving readable GEA evidence and Context', async () => {
    const onContextChange = vi.fn<(context: RegionalApprovalWorkbenchContext, conversationId: string | null) => void>();
    const list = listMockFor([liveRow('plan-live', 2)]);
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: list },
    };
    const unusedDetailRequest = vi.fn(async () => {
      throw new Error('unused detail request');
    });
    const detailClient = {
      detail: { invoke: unusedDetailRequest },
      versions: {
        invoke: vi
          .fn()
          .mockResolvedValue([
            liveVersion('plan-live', 'plan-live-version', 3),
            liveVersion('plan-live', 'plan-live-version-2', 2),
          ]),
      },
      logs: { invoke: unusedDetailRequest },
      versionSkus: {
        invoke: vi.fn().mockResolvedValue([
          {
            id: 'sku-1',
            versionId: 'plan-live-version',
            skuCode: '10001',
            productCategName: '水饺',
            baseQty: '1',
            qty: '1',
            price: '1',
            amt: '1',
            amtBase: '1',
          },
        ]),
      },
      compare: { invoke: unusedDetailRequest },
    } satisfies SalesPlanDetailClient;

    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-live-authority'
        t={t}
        onContextChange={onContextChange}
        queryClient={client}
        detailClient={detailClient}
      />
    );

    expect((await screen.findAllByText('plan-live 基地'))[0]).toBeVisible();
    expect(screen.queryByTestId('regional-approval-current-stage')).not.toBeInTheDocument();
    expect(screen.queryByText('审批操作已安全关闭')).not.toBeInTheDocument();
    const toolbarActions = screen.getByTestId('regional-approval-toolbar-actions');
    expect(within(toolbarActions).getByRole('button', { name: '通过' })).toBeDisabled();
    expect(within(toolbarActions).getByRole('button', { name: '退回' })).toBeDisabled();
    expect(screen.queryByRole('columnheader', { name: '审批操作' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '业务范围' })).not.toBeInTheDocument();
    const dimensionTabs = screen.getByRole('tablist', { name: '审批队列维度' });
    expect(within(dimensionTabs).getByRole('tab', { name: '按省区' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dimensionTabs).getByRole('tab', { name: '按区域' })).toBeVisible();
    expect(within(dimensionTabs).getByRole('tab', { name: '按客户' })).toBeVisible();
    expect(screen.getByText('浙江省区')).toBeVisible();
    expect(screen.queryByText('9007199254740997')).not.toBeInTheDocument();
    expect(screen.queryByText('经销商 9007199254740997')).not.toBeInTheDocument();
    expect(screen.getByTestId('regional-approval-scope-plan-live')).toHaveTextContent('华东大区 / plan-live 基地');
    expect(screen.queryByText('AREA-01')).not.toBeInTheDocument();
    expect(screen.queryByText('PROVINCE-01 · ORG-001')).not.toBeInTheDocument();
    const analysisSelection = screen.getByRole('checkbox');
    expect(analysisSelection).toBeEnabled();
    fireEvent.click(analysisSelection);
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedEntities: [expect.objectContaining({ id: 'plan-live' })],
        }),
        'conversation-query'
      )
    );
    expect(within(toolbarActions).getByRole('button', { name: '通过' })).toBeDisabled();
    expect(within(toolbarActions).getByRole('button', { name: '退回' })).toBeDisabled();
    fireEvent.click(analysisSelection);
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectedEntities: [] }),
        'conversation-query'
      )
    );
    fireEvent.click(analysisSelection);
    fireEvent.click(within(dimensionTabs).getByRole('tab', { name: '按区域' }));
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectedEntities: [], scope: expect.objectContaining({ dimension: 'region' }) }),
        'conversation-query'
      )
    );
    const adjustmentTrigger = screen.getByRole('button', { name: '打开 plan-live 经销分区 调整明细' });
    expect(adjustmentTrigger).toBeEnabled();
    fireEvent.click(adjustmentTrigger);
    expect(await screen.findByText('调整明细 · plan-live 经销分区')).toBeVisible();
    expect(screen.getByRole('tab', { name: '区域' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '基地' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '客户' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'SKU 编码 / 品类' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '原计划量' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '新计划量' })).toBeVisible();
    const quantityInput = screen.getByRole('spinbutton', { name: '10001 新计划量' });
    expect(quantityInput).toBeDisabled();
    fireEvent.change(quantityInput, { target: { value: '6' } });
    expect(screen.queryByText(/整体差异 \+5 件/)).not.toBeInTheDocument();
    expect(screen.getByText('当前节点仅可查看；服务端尚未确认调整权限。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(within(dimensionTabs).getByRole('tab', { name: '按客户' }));
    expect(screen.getByText('plan-live 经销商')).toBeVisible();
    expect(screen.queryByText('9007199254740997')).not.toBeInTheDocument();
    expect(screen.getByTestId('regional-approval-scope-plan-live')).toHaveTextContent(
      'plan-live 经销分区 / 浙江省区 / 华东大区 / plan-live 基地'
    );
    expect(screen.queryByRole('button', { name: '版本对比' })).not.toBeInTheDocument();
    expect(screen.getByText('版本①')).toBeVisible();
    expect(screen.getByText('对比版本②')).toBeVisible();
    expect(screen.getByRole('button', { name: '版本选择说明' })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole('combobox', { name: '当前查看版本' })).toHaveTextContent('最新版'));
    expect(screen.getByRole('combobox', { name: '对比版本' })).toHaveTextContent('-1 版');
    fireEvent.click(screen.getByRole('combobox', { name: '当前查看版本' }));
    fireEvent.click(await screen.findByRole('option', { name: '-1 版' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '当前查看版本' })).toHaveTextContent('-1 版'));
    expect(screen.getByRole('combobox', { name: '对比版本' })).toHaveTextContent('-1 版');
    const totals = screen.getByRole('region', { name: '当前筛选范围统计' });
    expect(totals).toHaveTextContent('历史版本汇总暂不可用');
    expect(within(totals).getAllByText('—')).toHaveLength(4);
    expect(totals).not.toHaveTextContent('123,456,789,012');
    expect(await screen.findByText('销售计划详情与版本证据')).toBeVisible();
    expect(screen.getByRole('switch', { name: '品类维度' })).toBeVisible();
    fireEvent.click(screen.getByRole('switch', { name: '品类维度' }));
    expect(screen.queryByRole('columnheader', { name: '品类' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('regional-approval-category-row-plan-live-水饺')).toBeVisible();
    expect(screen.getByText('水饺品类')).toBeVisible();
    expect(screen.getByText('1 个 SKU · 不可按品类审批')).toBeVisible();
    expect(screen.getAllByText('金额 100.0%').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('数量 100.0%').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('水饺品类计划与原计划基本一致')).toBeVisible();
    fireEvent.click(screen.getByRole('switch', { name: '品类维度' }));
    expect(screen.queryByTestId('regional-approval-category-row-plan-live-水饺')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '月计划' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '计划进度' })).toBeVisible();
    expect(screen.getByText('金额 100.0%')).toBeVisible();
    expect(screen.getByText('数量 100.0%')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: '调整' })).not.toBeInTheDocument();
    expect(screen.queryByText('GEA · 用户会话队列')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fixtureState: 'live',
          visibleEntities: [
            expect.objectContaining({
              id: 'plan-live',
              organizationKey: 'plan-live 经销商',
              currentQty: '123456789012.340',
              currentAmount: '9999999999999999.90',
              targetQty: '123456789012.345',
              targetAmount: '9999999999999999.99',
              versionId: 'plan-live-version',
            }),
          ],
          evidence: expect.objectContaining({
            source: 'gea-user-session',
            permission: 'read-only',
            completeness: 'paged-queue',
            queryState: 'success',
          }),
          changes: [],
          localApprovalResults: [],
          metrics: expect.objectContaining({
            quantity: '—',
            amount: '—',
            savedAdjustmentCount: 0,
            localApprovalResultCount: 0,
          }),
          authority: expect.objectContaining({
            source: 'gea-user-session-query',
            filterSummary: expect.objectContaining({
              periodMonth: '2026-09',
              approvalStage: 'all',
              queueMode: 'approval',
            }),
          }),
          scope: expect.objectContaining({ approvalStage: 'all' }),
        }),
        'conversation-query'
      )
    );
    fireEvent.click(screen.getByRole('combobox', { name: '当前查看版本' }));
    fireEvent.click(await screen.findByRole('option', { name: '最新版' }));
    await waitFor(() => expect(totals).not.toHaveTextContent('历史版本汇总暂不可用'));
    expect(totals).toHaveTextContent('123,456,789,012.345');
  });

  it('binds version selectors to their plan while retaining each plan current version in aggregate evidence', async () => {
    const records = [liveRow('plan-a', 2), { ...liveRow('plan-b', 2), dealerCode: '102' }];
    const context = vi.fn<(value: RegionalApprovalWorkbenchContext) => void>();
    let resolveVersions!: (versions: GeaSalesPlanVersion[]) => void;
    const unused = vi.fn().mockResolvedValue([]);
    const detailClient: SalesPlanDetailClient = {
      detail: { invoke: unused },
      logs: { invoke: unused },
      versionSkus: { invoke: unused },
      compare: { invoke: unused },
      versions: {
        invoke: vi.fn(({ planId }) =>
          planId === 'plan-a'
            ? Promise.resolve([liveVersion(planId, 'plan-a-version', 3), liveVersion(planId, 'plan-a-old', 2)])
            : new Promise<GeaSalesPlanVersion[]>((resolve) => {
                resolveVersions = resolve;
              })
        ),
      },
    };
    render(
      <RegionalApprovalWorkbench
        stateScope='version-owner-regression'
        automaticAnalysisEnabled
        t={t}
        onContextChange={context}
        queryClient={{
          periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
          list: { invoke: listMockFor(records) },
        }}
        detailClient={detailClient}
      />
    );
    await waitFor(() =>
      expect(context.mock.calls.at(-1)?.[0].scope).toMatchObject({
        versionReferencePlanId: 'plan-a',
        currentVersionId: 'plan-a-version',
        primaryVersionId: 'plan-a-version',
        compareVersionId: 'plan-a-old',
      })
    );
    expect(context.mock.calls.at(-1)?.[0].visibleEntities).toEqual([
      expect.objectContaining({ id: 'plan-a', versionId: 'plan-a-version' }),
      expect.objectContaining({ id: 'plan-b', versionId: 'plan-b-version' }),
    ]);
    await waitFor(() => expect(context.mock.calls.at(-1)?.[0].analysisSummary?.status).toBe('success'));
    fireEvent.click(screen.getByRole('combobox', { name: '当前查看版本' }));
    fireEvent.click(await screen.findByRole('option', { name: '-1 版' }));
    await waitFor(() => expect(context.mock.calls.at(-1)?.[0].analysisSummary?.status).toBe('error'));
    expect(context.mock.calls.at(-1)?.[0].scope).toMatchObject({
      versionReferencePlanId: 'plan-a',
      currentVersionId: 'plan-a-version',
      primaryVersionId: 'plan-a-old',
    });
    fireEvent.click(screen.getByRole('tab', { name: '按客户' }));
    fireEvent.click(screen.getByRole('button', { name: '打开 plan-b 经销商 调整明细' }));
    await waitFor(() => expect(context.mock.calls.at(-1)?.[0].scope.versionReferencePlanId).toBe('plan-b'));
    expect(context.mock.calls.at(-1)?.[0].scope.primaryVersionId).toBeUndefined();
    resolveVersions([liveVersion('plan-b', 'plan-b-version', 3)]);
    await waitFor(() => expect(context.mock.calls.at(-1)?.[0].scope.primaryVersionId).toBe('plan-b-version'));
    expect(
      context.mock.calls
        .filter(([value]) => value.scope.versionReferencePlanId === 'plan-b')
        .every(([value]) => !value.scope.primaryVersionId?.startsWith('plan-a'))
    ).toBe(true);
  });

  it('drills into real organizations using the complete current list scope and only status 10 as complete', async () => {
    const records = [
      { ...liveRow('pending', 5), dealerCode: '101', orgName: '区域一' },
      { ...liveRow('done', 10), dealerCode: '102', orgName: '区域一' },
    ];
    const list = listMockFor(records);
    const context = vi.fn<(value: RegionalApprovalWorkbenchContext) => void>();
    render(
      <RegionalApprovalWorkbench
        stateScope='user:progress-tree'
        automaticAnalysisEnabled
        t={t}
        onContextChange={context}
        queryClient={{ periods: { invoke: vi.fn().mockResolvedValue(periodPage) }, list: { invoke: list } }}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: '查看提报进度' }));
    const tree = await screen.findByRole('region', { name: '组织审核进度' });
    expect((await within(tree).findAllByText('已提报 2 · 未审核 1 · 已完成 1'))[0]).toBeVisible();
    const callsBeforeExpansion = list.mock.calls.length;
    fireEvent.click(within(tree).getByText('华东大区'));
    fireEvent.click(await within(tree).findByText('浙江省区'));
    fireEvent.click(await within(tree).findByText('区域一'));
    expect(await within(tree).findByText('pending 经销商')).toBeVisible();
    expect(within(tree).queryByText('done 经销商')).not.toBeInTheDocument();
    fireEvent.click(within(tree).getByRole('checkbox', { name: '仅显示未审核' }));
    expect(await within(tree).findByText('done 经销商')).toBeVisible();
    expect(list).toHaveBeenCalledTimes(callsBeforeExpansion);
    expect(context.mock.calls.at(-1)?.[0].analysisSummary).not.toHaveProperty('records');
  });

  it('treats the five progress nodes as independent aggregate filters', async () => {
    const rows = [
      liveRow('region-pending', 2),
      liveRow('region-returned', 7),
      liveRow('customer-returned', 6),
      liveRow('category-pending', 5),
    ];
    const list = listMockFor(rows);
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: list },
    };
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-live-stage-filter'
        t={t}
        onContextChange={vi.fn()}
        queryClient={client}
      />
    );

    expect((await screen.findAllByText('region-pending 基地'))[0]).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('regional-approval-stage-region')).toHaveTextContent('进度 25%'));
    expect(screen.getByTestId('regional-approval-stage-region')).toHaveAttribute('data-state', 'critical');
    expect(screen.getByTestId('regional-approval-stage-province')).toHaveTextContent('进度 25%');

    fireEvent.click(screen.getByTestId('regional-approval-stage-region'));
    await waitFor(() => {
      expect(list.mock.calls.some(([query]) => query?.status === 2 && query.pageSize === 20)).toBe(true);
    });
    expect(screen.getByTestId('regional-approval-stage-region')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      const tabs = within(screen.getByRole('tablist', { name: '审批队列维度' })).getAllByRole('tab');
      expect(tabs.map((tab) => tab.textContent)).toEqual(['按区域', '按客户']);
    });
    expect(screen.getAllByText('region-pending 基地')[0]).toBeVisible();
    expect(screen.queryByText('region-returned 基地')).not.toBeInTheDocument();
    expect(screen.queryByText('customer-returned 基地')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('regional-approval-stage-region'));
    await waitFor(() => expect(screen.getAllByText('category-pending 基地')[0]).toBeVisible());
    expect(screen.getByTestId('regional-approval-stage-region')).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies organization and status filters without deriving approval authority', async () => {
    const list = listMockFor([liveRow('plan-filtered', 2)]);
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: list },
    };
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-live-filters'
        t={t}
        onContextChange={vi.fn()}
        queryClient={client}
      />
    );

    expect((await screen.findAllByText('plan-filtered 基地'))[0]).toBeVisible();
    fireEvent.click(screen.getByRole('combobox', { name: '大区' }));
    fireEvent.click(await screen.findByRole('option', { name: '华东大区' }));
    fireEvent.click(screen.getByRole('combobox', { name: '审批状态' }));
    fireEvent.click(await screen.findByRole('option', { name: '区域审批' }));
    fireEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() =>
      expect(
        list.mock.calls.some(
          ([query]) =>
            query?.areaCode === 'AREA-01' && query.status === 2 && query.pageNo === 1 && query.pageSize === 20
        )
      ).toBe(true)
    );
    expect(screen.queryByTestId('regional-approval-current-stage')).not.toBeInTheDocument();
  });

  it('normalizes numeric decimal fields returned by the live list response', async () => {
    const numericRow = {
      ...liveRow('plan-numeric', 2),
      targetQty: 2075,
      targetAmount: 142500,
      currentQty: 2075,
      currentAmount: 141862.04,
    } as unknown as GeaSalesPlanListItem;
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: listMockFor([numericRow]) },
    };

    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-live-numeric-decimals'
        t={t}
        onContextChange={vi.fn()}
        queryClient={client}
      />
    );

    expect((await screen.findAllByText('plan-numeric 基地'))[0]).toBeVisible();
    expect(screen.getAllByText(/141,862\.04/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('目标 ¥142,500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('目标 2,075').length).toBeGreaterThan(0);
  });

  it('refreshes periods and queue, and keeps an honest empty state', async () => {
    const periods = vi.fn().mockResolvedValue(periodPage);
    const list = listMockFor([]);
    const client: SalesPlanQueryClient = { periods: { invoke: periods }, list: { invoke: list } };
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-live-empty'
        t={t}
        onContextChange={vi.fn()}
        queryClient={client}
      />
    );

    expect(await screen.findByText('当前账户在本周期没有可见审批数据。')).toBeVisible();
    const refresh = screen.getByRole('button', { name: '刷新数据' });
    fireEvent.click(refresh);
    await waitFor(() => expect(periods).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(list.mock.calls.filter(([query]) => query?.pageSize === 20 && query.status === undefined)).toHaveLength(2)
    );
  });

  it('keeps a loaded period on queue failure and retries only the queue', async () => {
    let mainCalls = 0;
    const list = vi.fn(async (query?: GeaSalesPlanPageQuery) => {
      if (query?.pageSize === 1 || query?.pageSize === 200) return queuePage([], { total: 0, size: query.pageSize });
      mainCalls += 1;
      if (mainCalls === 1) throw new TypeError('network disconnected');
      return queuePage([]);
    });
    const periods = vi.fn().mockResolvedValue(periodPage);
    const client: SalesPlanQueryClient = { periods: { invoke: periods }, list: { invoke: list } };
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-live-retry'
        t={t}
        onContextChange={vi.fn()}
        queryClient={client}
      />
    );

    expect(await screen.findByText('销售计划服务暂时不可用；已保留当前筛选与周期。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('当前账户在本周期没有可见审批数据。')).toBeVisible();
    expect(periods).toHaveBeenCalledTimes(1);
    expect(mainCalls).toBe(2);
  });

  it.each([
    [401, 'GEA 用户会话已过期，请重新登录后重试。'],
    [403, '当前账号没有读取该销售计划范围的权限。'],
  ] as const)('shows the localized read-only period error for HTTP %s', async (status, message) => {
    const client: SalesPlanQueryClient = {
      periods: {
        invoke: vi
          .fn()
          .mockRejectedValue(
            new BackendHttpError({ method: 'GET', path: '/api/gea/sales-plan/periods', status, body: {} })
          ),
      },
      list: { invoke: vi.fn() },
    };
    render(
      <RegionalApprovalWorkbench
        stateScope={`user:forecast-live-error-${status}`}
        t={t}
        onContextChange={vi.fn()}
        queryClient={client}
      />
    );

    expect(await screen.findByText(message)).toBeVisible();
    expect(client.list.invoke).not.toHaveBeenCalled();
  });

  it('keeps the server pagination authoritative', async () => {
    const list = vi.fn(async (query?: GeaSalesPlanPageQuery) => {
      if (query?.pageSize === 1) return queuePage([], { total: 20, size: 1 });
      const current = query?.pageNo ?? 1;
      return queuePage([liveRow(`page-${current}`)], { total: 20, current, pages: 10, size: 2 });
    });
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodPage) },
      list: { invoke: list },
    };
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-live-pagination'
        t={t}
        onContextChange={vi.fn()}
        queryClient={client}
      />
    );

    expect((await screen.findAllByText('page-1 基地'))[0]).toBeVisible();
    fireEvent.click(
      within(screen.getByTestId('regional-approval-queue-footer')).getByText('3', {
        selector: '.arco-pagination-item',
      })
    );
    expect((await screen.findAllByText('page-3 基地'))[0]).toBeVisible();
    expect(list.mock.calls.some(([query]) => query?.pageNo === 3 && query.pageSize === 20)).toBe(true);
  });
});
