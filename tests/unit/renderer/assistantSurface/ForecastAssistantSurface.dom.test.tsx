import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForecastAssistantSurface, {
  shouldDisableFixtureSalesPlanQuery,
} from '@/renderer/pages/assistantSurface/ForecastAssistantSurface';
import type { RegionalApprovalWorkbenchContext } from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/RegionalApprovalWorkbench';
import type { SurfaceContextSnapshot } from '@/renderer/pages/assistantSurface/surfaceContext';

const { contextChangeRef, shellPropsSpy, workbenchPropsSpy } = vi.hoisted(() => ({
  contextChangeRef: {
    current: null as null | ((context: RegionalApprovalWorkbenchContext, conversationId: string | null) => void),
  },
  shellPropsSpy: vi.fn(),
  workbenchPropsSpy: vi.fn(),
}));

vi.mock('@/renderer/pages/assistantSurface/components/BusinessSurfaceShell', () => ({
  default: (props: React.PropsWithChildren<Record<string, unknown>>) => {
    shellPropsSpy(props);
    return <div>{props.children}</div>;
  },
}));

vi.mock('@/renderer/pages/assistantSurface/components/BusinessMessageInbox', () => ({
  default: () => <div>messages</div>,
}));

vi.mock('@/renderer/pages/assistantSurface/workbenches/regionalApproval/RegionalApprovalWorkbench', () => ({
  default: ({
    onContextChange,
    ...props
  }: {
    onContextChange: (context: RegionalApprovalWorkbenchContext, conversationId: string | null) => void;
    queryClient?: unknown;
    liveActionsEnabled?: boolean;
  }) => {
    contextChangeRef.current = onContextChange;
    workbenchPropsSpy(props);
    return <div>workbench</div>;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) =>
      String(options?.defaultValue ?? options?.stage ?? key),
  }),
}));

const context = (approvalStage: 'area' | 'category'): RegionalApprovalWorkbenchContext => ({
  view: 'regional-approval',
  fixtureState: 'ready',
  scope: {
    planType: 'monthly',
    month: '2026-09',
    approvalStage,
    authority: 'organization',
    primaryVersion: 'current',
    compareVersion: 'previous',
    appliedFilters: { area: 'all', branch: 'all', department: 'all', customer: 'all' },
  },
  visibleEntities: [],
  selectedEntities: [],
  changes: [],
  localApprovalResults: [],
  metrics: {
    visibleCount: 1,
    pendingCount: 1,
    warningCount: 0,
    quantity: '100',
    amount: '200',
    savedAdjustmentCount: 0,
    localApprovalResultCount: 0,
  },
  pagination: { page: 1, pageSize: 2, total: 1 },
  evidence: {
    source: 'fixture',
    permission: 'read-only',
    completeness: 'skeleton',
    queryState: 'fixture',
    dataVersion: 'regional-approval-fixture-v3',
  },
  authority: {
    source: 'fixture',
    filterSummary: {
      periodMonth: '2026-09',
      planTypeCode: 'monthly',
      approvalStage,
      queueMode: 'approval',
      organizationFilterCount: 0,
    },
  },
});

const latestShellContext = () => {
  const props = shellPropsSpy.mock.calls.at(-1)?.[0] as {
    surfaceContext?: SurfaceContextSnapshot;
    surfaceContextConversationId?: string | null;
  };
  return props;
};

const expectedWorkbenchFocus = {
  target: 'current-workbench',
  priority: ['selectedEntities', 'analysisSummary', 'visibleEntities', 'metrics', 'scope'],
  constrainToSnapshot: true,
};

describe('ForecastAssistantSurface context revision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    contextChangeRef.current = null;
    delete window.__aionuiAssistantSurfaceFixtures;
    delete window.__aionuiE2ETest;
    delete window.__aionuiE2ESalesPlanQuery;
  });

  it('keeps Fixture queries disabled unless both dev E2E gates are present', () => {
    expect(
      shouldDisableFixtureSalesPlanQuery({
        fixtureEnvironment: true,
        e2eEnvironment: false,
        e2eSalesPlanQuery: true,
      })
    ).toBe(true);
    expect(
      shouldDisableFixtureSalesPlanQuery({
        fixtureEnvironment: true,
        e2eEnvironment: true,
        e2eSalesPlanQuery: false,
      })
    ).toBe(true);
    expect(
      shouldDisableFixtureSalesPlanQuery({
        fixtureEnvironment: true,
        e2eEnvironment: true,
        e2eSalesPlanQuery: true,
      })
    ).toBe(false);
  });

  it('keeps Fixture isolated but enables the non-Fixture GEA query and user-session action path', () => {
    window.__aionuiAssistantSurfaceFixtures = true;
    const fixture = render(<ForecastAssistantSurface stateScope='user:forecast-fixture-01' />);
    expect(workbenchPropsSpy.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ queryClient: null, liveActionsEnabled: false })
    );
    expect(shellPropsSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty('fixtureBoundary');
    fixture.unmount();

    delete window.__aionuiAssistantSurfaceFixtures;
    render(<ForecastAssistantSurface stateScope='user:forecast-live-01' />);
    expect(workbenchPropsSpy.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ queryClient: undefined, liveActionsEnabled: true })
    );
    expect(shellPropsSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty('fixtureBoundary');
  });

  it('keeps the message boundary in the message inbox only', () => {
    render(<ForecastAssistantSurface stateScope='user:forecast-messages' businessView='messages' />);

    expect(shellPropsSpy.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ fixtureBoundary: 'common.assistantSurface.messages.boundary' })
    );
  });

  it('keeps one Workbench revision stable across recalculation, Conversation switches, and remounts', () => {
    const firstRender = render(<ForecastAssistantSurface stateScope='user:forecast-fixture-01' />);

    act(() => contextChangeRef.current?.(context('area'), 'conversation-a'));
    const first = latestShellContext();
    expect(first.surfaceContext?.revision).toBe(1);
    expect(first.surfaceContext?.payload).toEqual({
      focus: expectedWorkbenchFocus,
      ...context('area'),
    });
    expect(first.surfaceContextConversationId).toBe('conversation-a');

    act(() => contextChangeRef.current?.(context('area'), 'conversation-a'));
    expect(latestShellContext().surfaceContext).toEqual(first.surfaceContext);

    act(() => contextChangeRef.current?.(context('area'), 'conversation-b'));
    expect(latestShellContext().surfaceContext).toEqual(first.surfaceContext);
    expect(latestShellContext().surfaceContextConversationId).toBe('conversation-b');

    act(() => contextChangeRef.current?.(context('category'), 'conversation-b'));
    const changed = latestShellContext().surfaceContext;
    expect(changed?.revision).toBe(2);

    act(() =>
      contextChangeRef.current?.(
        {
          ...context('category'),
          selectedEntities: [{ id: 'plan-1', organizationKey: '遂平' }],
          metrics: { ...context('category').metrics, amount: '104223.74' },
        },
        'conversation-b'
      )
    );
    expect(latestShellContext().surfaceContext?.revision).toBe(3);
    expect(latestShellContext().surfaceContext?.payload).toEqual(
      expect.objectContaining({
        focus: expectedWorkbenchFocus,
        selectedEntities: [{ id: 'plan-1', organizationKey: '遂平' }],
        metrics: expect.objectContaining({ amount: '104223.74' }),
      })
    );

    firstRender.unmount();
    render(<ForecastAssistantSurface stateScope='user:forecast-fixture-01' />);
    act(() =>
      contextChangeRef.current?.(
        {
          ...context('category'),
          selectedEntities: [{ id: 'plan-1', organizationKey: '遂平' }],
          metrics: { ...context('category').metrics, amount: '104223.74' },
        },
        'conversation-a'
      )
    );
    expect(latestShellContext().surfaceContext?.revision).toBe(3);
  });

  it('publishes only successful authority and never converts an error state into a success Context', () => {
    render(<ForecastAssistantSurface stateScope='user:forecast-live-01' />);
    const liveReceipt: RegionalApprovalWorkbenchContext = {
      ...context('area'),
      fixtureState: 'mixed',
      evidence: {
        source: 'gea-user-session',
        permission: 'user-session-action',
        completeness: 'paged-queue',
        queryState: 'success',
        dataVersion: 'sales-plan-v1.11',
      },
      authority: {
        source: 'gea-user-session-action',
        filterSummary: {
          periodMonth: '2026-09',
          planTypeCode: 'MONTHLY',
          approvalStage: 'area',
          queueMode: 'approval',
          organizationFilterCount: 0,
        },
        planId: 'plan-1',
        versionId: 'version-7',
        seq: 7,
        status: 4,
        replayed: true,
        requestId: 'request-1',
        traceId: 'trace-1',
        auditId: 'audit-1',
      },
    };

    act(() => contextChangeRef.current?.(liveReceipt, 'conversation-a'));
    expect(latestShellContext().surfaceContext?.payload).toEqual({
      focus: expectedWorkbenchFocus,
      ...liveReceipt,
    });
    const frozenCandidate = latestShellContext().surfaceContext;

    act(() => contextChangeRef.current?.(liveReceipt, 'conversation-b'));
    expect(latestShellContext().surfaceContext).toEqual(frozenCandidate);
    expect(latestShellContext().surfaceContextConversationId).toBe('conversation-b');

    act(() =>
      contextChangeRef.current?.(
        {
          ...liveReceipt,
          authority: undefined,
          evidence: { ...liveReceipt.evidence, queryState: 'error', error: 'unavailable' },
        },
        'conversation-b'
      )
    );
    expect(latestShellContext().surfaceContext).toBeUndefined();
  });
});
