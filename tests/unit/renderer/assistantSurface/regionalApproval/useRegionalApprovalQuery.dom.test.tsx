import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GeaSalesPlanListItem, GeaSalesPlanPage, GeaSalesPlanPeriod } from '@/common/adapter/ipcBridge';
import {
  useRegionalApprovalQuery,
  type SalesPlanQueryClient,
} from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/useRegionalApprovalQuery';

const period = (periodId: string, periodMonth: string): GeaSalesPlanPeriod => ({
  periodId,
  tenantId: 'tenant-1',
  periodMonth,
  planType: '月度计划',
  planTypeCode: 'MONTHLY',
  status: 'OPEN',
});

const periodsPage = (records: GeaSalesPlanPeriod[]): GeaSalesPlanPage<GeaSalesPlanPeriod> => ({
  records,
  total: records.length,
  size: 100,
  current: 1,
  pages: 1,
});

const emptyQueue = { records: [], total: 0, size: 20, current: 1, pages: 1 } as const;

describe('useRegionalApprovalQuery refresh', () => {
  it('forwards the applied live organization and status scope to the formal list query', async () => {
    const september = period('period-september', '2026-09');
    const list = vi.fn().mockResolvedValue(emptyQueue);
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodsPage([september])) },
      list: { invoke: list },
    };

    renderHook(() =>
      useRegionalApprovalQuery({
        client,
        page: 1,
        pageSize: 20,
        scope: {
          areaCode: '28',
          provinceCode: '0014',
          orgCode: '052',
          dealerCode: '10151759',
          status: 2,
        },
      })
    );

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          areaCode: '28',
          provinceCode: '0014',
          orgCode: '052',
          dealerCode: '10151759',
          status: 2,
        })
      )
    );
  });

  it('refreshes periods and the current queue once while retaining a period that still exists', async () => {
    const august = period('period-august', '2026-08');
    const september = period('period-september', '2026-09');
    const periods = vi.fn().mockResolvedValue(periodsPage([august, september]));
    const list = vi.fn().mockResolvedValue(emptyQueue);
    const client: SalesPlanQueryClient = { periods: { invoke: periods }, list: { invoke: list } };
    const { result } = renderHook(() => useRegionalApprovalQuery({ client, page: 1, pageSize: 20 }));

    await waitFor(() => expect(result.current.queueState.status).toBe('success'));
    act(() => result.current.selectPeriod(august.periodId));
    await waitFor(() => expect(result.current.selectedPeriod?.periodId).toBe(august.periodId));
    periods.mockClear();
    list.mockClear();

    act(() => result.current.refresh());
    expect(result.current.refreshing).toBe(true);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.refreshing).toBe(false));

    expect(periods).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(result.current.selectedPeriod?.periodId).toBe(august.periodId);
  });

  it('falls back only when the selected period disappears from the refreshed response', async () => {
    const august = period('period-august', '2026-08');
    const september = period('period-september', '2026-09');
    const periods = vi
      .fn()
      .mockResolvedValueOnce(periodsPage([august, september]))
      .mockResolvedValueOnce(periodsPage([september]));
    const client: SalesPlanQueryClient = {
      periods: { invoke: periods },
      list: { invoke: vi.fn().mockResolvedValue(emptyQueue) },
    };
    const { result } = renderHook(() => useRegionalApprovalQuery({ client, page: 1, pageSize: 20 }));

    await waitFor(() => expect(result.current.queueState.status).toBe('success'));
    act(() => result.current.selectPeriod(august.periodId));
    await waitFor(() => expect(result.current.selectedPeriod?.periodId).toBe(august.periodId));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.selectedPeriod?.periodId).toBe(september.periodId));
  });

  it('loads permission-scoped status totals in parallel for the aggregate stage board', async () => {
    const september = period('period-september', '2026-09');
    const totals: Record<number, number> = { 1: 2, 2: 2, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: 2 };
    const list = vi.fn(async (query: Parameters<SalesPlanQueryClient['list']['invoke']>[0] = {}) => ({
      ...emptyQueue,
      total: query.pageSize === 1 ? (query.status === undefined ? 10 : (totals[query.status] ?? 0)) : 10,
    }));
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodsPage([september])) },
      list: { invoke: list },
    };
    const { result } = renderHook(() =>
      useRegionalApprovalQuery({
        client,
        page: 1,
        pageSize: 20,
        loadStageProgress: true,
        scope: { areaCode: 'A1', orgCode: 'R1' },
      })
    );

    await waitFor(() => expect(result.current.progressState.status).toBe('success'));
    expect(
      list.mock.calls
        .filter(([query]) => query.pageSize === 1)
        .every(([query]) => query.areaCode === 'A1' && query.orgCode === 'R1')
    ).toBe(true);
    expect(result.current.progressState.data).toEqual({
      customer: 70,
      region: 50,
      province: 40,
      area: 30,
      category: 20,
    });
    expect(
      list.mock.calls
        .map(([query]) => query)
        .filter((query) => query.pageSize === 1)
        .map((query) => query.status)
        .toSorted((left, right) => (left ?? 0) - (right ?? 0))
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, undefined]);
  });

  it('loads enough server pages to merge a two-status node beyond the 200-row API limit', async () => {
    const september = period('period-september', '2026-09');
    const list = vi.fn(async (query: Parameters<SalesPlanQueryClient['list']['invoke']>[0] = {}) => ({
      ...emptyQueue,
      total: query.status === 1 ? 300 : 20,
      size: query.pageSize ?? 20,
      current: query.pageNo ?? 1,
      pages: query.status === 1 ? 2 : 1,
    }));
    const client: SalesPlanQueryClient = {
      periods: { invoke: vi.fn().mockResolvedValue(periodsPage([september])) },
      list: { invoke: list },
    };
    const { result } = renderHook(() =>
      useRegionalApprovalQuery({ client, page: 11, pageSize: 20, stageStatuses: [1, 7] })
    );

    await waitFor(() => expect(result.current.queueState.status).toBe('success'));
    expect(
      list.mock.calls.map(([query]) => ({ status: query.status, pageNo: query.pageNo, pageSize: query.pageSize }))
    ).toEqual(
      expect.arrayContaining([
        { status: 1, pageNo: 1, pageSize: 200 },
        { status: 1, pageNo: 2, pageSize: 200 },
        { status: 7, pageNo: 1, pageSize: 200 },
      ])
    );
  });
});

describe('complete analysis summaries', () => {
  const record = (planId: string, currentAmount = '100.01') =>
    ({
      planId,
      periodId: 'period-september',
      currentQty: '1',
      currentAmount,
      targetQty: '2',
      targetAmount: '200.02',
      status: 2,
      planTypeCode: 'MONTHLY',
    }) as GeaSalesPlanListItem;
  const clientFor = (summary: SalesPlanQueryClient['list']['invoke']): SalesPlanQueryClient => ({
    periods: { invoke: async () => periodsPage([period('period-september', '2026-09')]) },
    list: { invoke: (query) => (query?.pageSize === 200 ? summary(query) : Promise.resolve(emptyQueue)) },
  });

  it.each(['invalid decimal', 'changed page size'])(
    'rejects %s instead of presenting a complete total',
    async (scenario) => {
      const client = clientFor(async (query) => ({
        records: [record(String(query?.pageNo), scenario === 'invalid decimal' ? 'invalid' : '100.01')],
        total: 2,
        size: scenario === 'changed page size' && query?.pageNo === 2 ? 2 : 1,
        current: query?.pageNo ?? 1,
        pages: 2,
      }));
      const { result } = renderHook(() =>
        useRegionalApprovalQuery({ client, page: 1, pageSize: 20, loadAnalysisSummary: true })
      );
      await waitFor(() => expect(result.current.analysisSummary.status).toBe('error'));
      expect(result.current.analysisSummary.data).toBeUndefined();
    }
  );

  it.each(['duplicate record', 'missing record', 'changed total', 'missing metric'])(
    'does not claim a full scope after a %s',
    async (scenario) => {
      const client = clientFor(async (query) => {
        const second = query?.pageNo === 2;
        const entry = record(scenario === 'duplicate record' ? 'same' : String(query?.pageNo));
        if (scenario === 'missing metric') entry.targetAmount = null as unknown as string;
        return {
          records: scenario === 'missing record' && second ? [] : [entry],
          total: scenario === 'changed total' && second ? 3 : 2,
          size: 1,
          current: query?.pageNo ?? 1,
          pages: 2,
        };
      });
      const { result } = renderHook(() =>
        useRegionalApprovalQuery({ client, page: 1, pageSize: 20, loadAnalysisSummary: true })
      );
      await waitFor(() => expect(result.current.analysisSummary.status).toBe('error'));
      expect(result.current.analysisSummary.data).toBeUndefined();
    }
  );

  it.each([false, true])('reports exact zero totals for an empty or zero-target scope (empty: %s)', async (empty) => {
    const zero = { ...record('zero'), targetQty: '0', targetAmount: '0.00', currentQty: '0', currentAmount: '0.00' };
    const client = clientFor(async () => ({
      records: empty ? [] : [zero],
      total: empty ? 0 : 1,
      size: 200,
      current: 1,
      pages: 1,
    }));
    const { result } = renderHook(() =>
      useRegionalApprovalQuery({ client, page: 1, pageSize: 20, loadAnalysisSummary: true })
    );
    await waitFor(() => expect(result.current.analysisSummary.status).toBe('success'));
    expect(result.current.analysisSummary.data).toMatchObject({
      count: empty ? 0 : 1,
      quantity: '0',
      amount: empty ? '0' : '0.00',
      targetQuantity: '0',
      targetAmount: empty ? '0' : '0.00',
    });
  });

  it('reports a summary timeout even when the server never settles, and can retry', async () => {
    let respond = false;
    const pending: Array<(page: GeaSalesPlanPage<GeaSalesPlanListItem>) => void> = [];
    const client = clientFor(() =>
      respond
        ? Promise.resolve({ records: [record('retry')], total: 1, current: 1, size: 200, pages: 1 })
        : new Promise((resolve) => pending.push(resolve))
    );
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useRegionalApprovalQuery({ client, page: 1, pageSize: 20, loadAnalysisSummary: true })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.analysisSummary.status).toBe('loading');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(result.current.analysisSummary).toMatchObject({ status: 'error', error: 'timeout' });
      respond = true;
      await act(async () => result.current.retryQueue());
      expect(result.current.analysisSummary).toMatchObject({ status: 'success', data: { amount: '100.01' } });
      await act(async () => {
        for (const resolve of pending) {
          resolve({ records: [record('late')], total: 1, current: 1, size: 200, pages: 1 });
        }
      });
      expect(result.current.analysisSummary).toMatchObject({ status: 'success', data: { amount: '100.01' } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards an old scope even when its server ignores cancellation', async () => {
    let release!: (page: GeaSalesPlanPage<GeaSalesPlanListItem>) => void;
    const client = clientFor((query) =>
      query?.areaCode === 'old'
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve({ records: [record('new')], total: 1, size: 200, current: 1, pages: 1 })
    );
    const { result, rerender } = renderHook(
      ({ areaCode }) =>
        useRegionalApprovalQuery({
          client,
          page: 1,
          pageSize: 20,
          scope: { areaCode },
          loadAnalysisSummary: true,
        }),
      { initialProps: { areaCode: 'old' } }
    );
    await waitFor(() => expect(release).toBeDefined());
    rerender({ areaCode: 'new' });
    await waitFor(() => expect(result.current.analysisSummary.status).toBe('success'));
    await act(async () => release({ records: [record('old', '999')], total: 1, size: 200, current: 1, pages: 1 }));
    expect(result.current.analysisSummary.data?.amount).toBe('100.01');
  });
});
