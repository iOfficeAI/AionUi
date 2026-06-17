import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

const invoke = vi.fn();
vi.mock('@/common', () => ({
  ipcBridge: { analytics: { getAgentUsage: { invoke: (...a: unknown[]) => invoke(...a) } } },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o?.count != null ? `${k}:${o.count}` : k) }),
}));
vi.mock('@renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

import UsageStats from '@renderer/pages/settings/UsageStats';

const baseResp = {
  scannedAt: 'x',
  sources: [],
  summary: {
    byAgent: [
      {
        agent: 'claude',
        sessions: 1,
        messages: 2,
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 3,
      },
    ],
  },
  byModel: [],
  byProject: [
    {
      agent: 'claude',
      project: '/p',
      sessions: 1,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 1,
      cacheCreationTokens: 0,
      totalTokens: 3,
    },
  ],
  trend: {
    granularity: 'day',
    points: [
      {
        bucket: '2026-05-17',
        bySegment: { claude: 3 },
        byTokenKind: { input: 1, output: 1, cacheRead: 1, cacheCreation: 0 },
      },
    ],
  },
  timeRange: '30d',
  sessionsTotal: 1,
  sessionsLimit: 200,
  sessionsOffset: 0,
  sessions: [
    {
      agent: 'claude',
      sessionId: 's1',
      project: '/p',
      model: 'm',
      startedAt: 'a',
      lastActiveAt: 'b',
      messages: 2,
      totalTokens: 3,
    },
  ],
};

describe('UsageStats container', () => {
  beforeEach(() => {
    invoke.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders data after load', async () => {
    invoke.mockResolvedValue(baseResp);
    render(<UsageStats />);
    await waitFor(() => {
      const el = screen.queryAllByText((c) => c.includes('usageStats.kpi.totalTokens'));
      expect(el.length).toBeGreaterThan(0);
    });
  });

  it('shows unsupported on 404', async () => {
    invoke.mockRejectedValue({ status: 404 });
    render(<UsageStats />);
    await waitFor(() => {
      const el = screen.queryAllByText((c) => c.includes('usageStats.unsupported'));
      expect(el.length).toBeGreaterThan(0);
    });
  });

  it('shows generic error on other failures', async () => {
    invoke.mockRejectedValue({ status: 500 });
    render(<UsageStats />);
    await waitFor(() => {
      const el = screen.queryAllByText((c) => c.includes('usageStats.error'));
      expect(el.length).toBeGreaterThan(0);
    });
  });

  it('refresh button re-requests with refresh:true', async () => {
    invoke.mockResolvedValue(baseResp);
    render(<UsageStats />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    // initial load is refresh-less
    expect(invoke.mock.calls[0][0]).not.toMatchObject({ refresh: true });

    const refreshBtn = screen.getByText((c) => c.includes('usageStats.refresh'));
    fireEvent.click(refreshBtn);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][0]).toMatchObject({ refresh: true, sessionsOffset: 0 });
  });

  it('loadMore appends sessions and advances offset', async () => {
    const first = {
      ...baseResp,
      sessionsTotal: 2,
      sessions: [{ ...baseResp.sessions[0], sessionId: 's1' }],
    };
    const second = {
      ...baseResp,
      sessionsTotal: 2,
      sessions: [{ ...baseResp.sessions[0], sessionId: 's2' }],
    };
    invoke.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    render(<UsageStats />);

    // hasMore (1 < 2) → "load more" button shows once first page resolved
    const moreBtn = await screen.findByText((c) => c.includes('usageStats.sessions.loadMore'));
    fireEvent.click(moreBtn);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    // second call is an append (advanced offset, not refresh) → drives the
    // `append && prev ? [...prev.sessions, ...r.sessions] : r` truthy branch
    // in index.tsx (load() with append=true and a non-null prev state).
    expect(invoke.mock.calls[1][0]).toMatchObject({ sessionsOffset: 200 });
    expect(invoke.mock.calls[1][0]).not.toMatchObject({ refresh: true });
    // BEHAVIOURAL proof the append branch executed: each page returns 1 row
    // with total=2. The initial load gives sessions.length(1) < total(2) so
    // the "load more" button shows. After loadMore, the append updater
    // (`{...r, sessions:[...prev.sessions, ...r.sessions]}`) must run to make
    // sessions.length === 2, which flips hasMore (2 < 2 === false) and removes
    // the button. If the append branch had NOT run (e.g. it replaced instead
    // of concatenated), length would stay 1 and the button would persist.
    // NOTE: v8 line coverage cannot instrument the React setState *updater*
    // closure on index.tsx:36, so that line shows as "uncovered" despite this
    // test proving the truthy branch ran. This is a known v8/React limitation;
    // the branch is verified by behaviour, not by line counter.
    await waitFor(() =>
      expect(screen.queryAllByText((c) => c.includes('usageStats.sessions.loadMore')).length).toBe(0)
    );
  });

  it('changing time range and granularity refetches', async () => {
    invoke.mockResolvedValue(baseResp);
    render(<UsageStats />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText((c) => c.includes('usageStats.timeRange.7d')));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][0]).toMatchObject({ timeRange: '7d' });

    fireEvent.click(screen.getByText((c) => c.includes('usageStats.granularity.week')));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
    expect(invoke.mock.calls[2][0]).toMatchObject({ trendGranularity: 'week' });

    fireEvent.click(screen.getByText((c) => c.includes('usageStats.timeRange.today')));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(4));
    expect(invoke.mock.calls[3][0]).toMatchObject({ timeRange: 'today' });
  });

  it('changing trend dimension refetches with trendDimension', async () => {
    invoke.mockResolvedValue(baseResp);
    render(<UsageStats />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke.mock.calls[0][0]).toMatchObject({ trendDimension: 'agent' });

    // the dimension Radio renders options labelled by i18n keys; click the "project" one
    const projectRadio = screen.getByText((c) => c.includes('usageStats.trend.dimension.project'));
    fireEvent.click(projectRadio);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.calls[1][0]).toMatchObject({ trendDimension: 'project' });
  });

  it('renders dashboard sections (KPI + comparison)', async () => {
    invoke.mockResolvedValue(baseResp);
    render(<UsageStats />);
    await waitFor(() => {
      expect(screen.queryAllByText((c) => c.includes('usageStats.kpi.totalTokens')).length).toBeGreaterThan(0);
      expect(screen.queryAllByText((c) => c.includes('usageStats.comparison.title')).length).toBeGreaterThan(0);
    });
  });

  // Codex review P1: stale-response guard
  // 场景: 用户先点 loadMore (老请求慢), 再切 dimension/range (新请求快). 老请求返回时
  // 必须被丢弃, 否则 append=true 会把老 query scope 的 sessions 累加到新 scope 的
  // summary/trend, 造成混合错位。
  it('discards stale loadMore response when a newer filter request resolves first', async () => {
    const pageA = {
      ...baseResp,
      sessionsTotal: 5,
      sessions: [{ ...baseResp.sessions[0], sessionId: 'A1' }],
    };
    const stalePageB = {
      ...baseResp,
      sessionsTotal: 5,
      sessions: [{ ...baseResp.sessions[0], sessionId: 'B-stale' }],
    };
    const freshDimResp = {
      ...baseResp,
      sessionsTotal: 1,
      sessions: [{ ...baseResp.sessions[0], sessionId: 'fresh-project' }],
    };

    // 一组延迟 deferred, 控制 mock 解析时机, 制造"新请求先返回, 旧 loadMore 后返回"
    let resolveStale: (v: unknown) => void = () => {};
    const stalePromise = new Promise((r) => {
      resolveStale = r;
    });

    invoke
      .mockResolvedValueOnce(pageA) // 1. 初始 load (epoch=1)
      .mockReturnValueOnce(stalePromise) // 2. loadMore (epoch=2) — pending
      .mockResolvedValueOnce(freshDimResp); // 3. 切 dim (epoch=3) — 立即返回

    render(<UsageStats />);
    // 等初始 load 完
    const moreBtn = await screen.findByText((c) => c.includes('usageStats.sessions.loadMore'));

    // 触发 loadMore (epoch=2, pending)
    fireEvent.click(moreBtn);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));

    // 在 loadMore 还没返回时立刻切 dim (epoch=3)
    fireEvent.click(screen.getByText((c) => c.includes('usageStats.trend.dimension.project')));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));

    // 现在让旧 loadMore 响应"姗姗来迟"
    resolveStale(stalePageB);

    // 等所有 microtask 跑完
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));

    // 关键断言: 最终显示的 sessions total 必须是 freshDimResp 的 1, 而不是 stale 的 5。
    // i18n mock 把 sessions.total:{count} 渲染成 'usageStats.sessions.total:N'。
    // 如果 race guard 失效, stale 响应会覆盖 freshDim, 显示成 ':5'。
    await waitFor(() => {
      expect(screen.queryAllByText((c) => c.includes('usageStats.sessions.total:1')).length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByText((c) => c.includes('usageStats.sessions.total:5')).length).toBe(0);
  });
});
