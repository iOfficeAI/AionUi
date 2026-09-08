import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import BusinessSurfaceShell, {
  findPreferredForecastAssistant,
} from '@/renderer/pages/assistantSurface/components/BusinessSurfaceShell';
import { readAssistantSurfaceState, writeAssistantSurfaceState } from '@/renderer/pages/assistantSurface/storage';
import {
  parseSurfaceContextBlock,
  type SurfaceContextSnapshot,
} from '@/renderer/pages/assistantSurface/surfaceContext';
import { emitter } from '@/renderer/utils/emitter';
import { managedConversationBlocked, managedConversationReady } from '../../../fixtures/conversationConfiguration';

const businessShellStyles = readFileSync(
  resolvePath(
    process.cwd(),
    'packages/desktop/src/renderer/pages/assistantSurface/components/BusinessSurfaceShell.module.css'
  ),
  'utf8'
);

const {
  assistantCatalogMock,
  assistantSetStateMock,
  chatMountCounter,
  createConversationMock,
  directCreateMock,
  getConversationMock,
  listConversations,
  navigateMock,
  prepareConfigurationMock,
  providerCatalogMock,
  runtimeViewMock,
} = vi.hoisted(() => ({
  assistantCatalogMock: vi.fn(),
  assistantSetStateMock: vi.fn(),
  chatMountCounter: { value: 0 },
  createConversationMock: vi.fn(),
  directCreateMock: vi.fn(),
  getConversationMock: vi.fn(),
  listConversations: vi.fn(),
  navigateMock: vi.fn(),
  prepareConfigurationMock: vi.fn(),
  providerCatalogMock: vi.fn(),
  runtimeViewMock: {
    isProcessing: false,
    activeTurnId: null as string | null,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: assistantCatalogMock },
      setState: { invoke: assistantSetStateMock },
    },
    conversation: {
      create: { invoke: directCreateMock },
      get: { invoke: getConversationMock },
      prepareConfiguration: { invoke: prepareConfigurationMock },
    },
    mode: {
      listProviders: { invoke: providerCatalogMock },
    },
    database: {
      getUserConversations: { invoke: listConversations },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/components/ChatConversation', () => ({
  default: ({
    conversation,
    surfaceContext,
  }: {
    conversation: TChatConversation;
    surfaceContext?: SurfaceContextSnapshot;
  }) => {
    const [mountId] = React.useState(() => ++chatMountCounter.value);
    return (
      <div data-testid='real-conversation' data-mount-id={mountId} data-context-revision={surfaceContext?.revision}>
        {`chat:${conversation.name}`}
      </div>
    );
  },
  createConversationFromConversation: createConversationMock,
}));

vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => runtimeViewMock,
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
const messageErrorMock = vi.spyOn(Message, 'error').mockReturnValue(vi.fn());
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: Record<string, string | number>) => {
      const template = String(options?.defaultValue ?? key);
      return Object.entries(options ?? {}).reduce(
        (value, [name, replacement]) => value.replaceAll(`{{${name}}}`, String(replacement)),
        template
      );
    },
  }),
}));

const conversations = [
  {
    id: 'conversation-a',
    name: 'Conversation A',
    type: 'acp',
    created_at: 2,
    modified_at: 2,
    extra: { workspace: '/fixture/workspace-a' },
    assistant: { id: 'forecast-managed', source: 'managed', name: '', avatar: '', backend: '' },
  },
  {
    id: 'conversation-b',
    name: 'Conversation B',
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: { workspace: '/fixture/workspace-b' },
    assistant: { id: 'forecast-managed', source: 'managed', name: '', avatar: '', backend: '' },
  },
] as TChatConversation[];

const directConversation = {
  ...conversations[0],
  id: 'conversation-direct',
  name: '需求预测对话',
} as TChatConversation;

const managedForecastAssistant = {
  id: 'forecast-managed',
  source: 'managed',
  enabled: false,
  enabled_skills: ['sales-forecast-submit'],
  custom_skill_names: [],
  managed: {
    assignment_id: 'assignment-forecast',
    template_version: '1.0.0',
    catalog_revision: 'catalog-r1',
    extensions: { revision: 'extension-r1' },
  },
};

const standardForecastAssistant = {
  id: 'forecast-standard',
  source: 'builtin',
  enabled: true,
  enabled_skills: [],
  custom_skill_names: ['sales-forecast-submit'],
};

const builtinForecastAssistant = {
  ...standardForecastAssistant,
  id: 'sales-forecast-planning',
  agent: { type: 'aionrs', source: 'internal' },
};

const defaultProvider = {
  id: 'provider-deepseek',
  platform: 'custom',
  name: 'DeepSeek',
  base_url: 'https://example.invalid',
  api_key: 'secret',
  models: ['deepseek-v4-flash'],
  enabled: true,
};

const snapshot: SurfaceContextSnapshot = {
  schemaVersion: 1,
  surfaceId: 'forecast',
  revision: 2,
  capturedAt: '2026-08-30T12:00:00.000Z',
  label: '需求预测看板',
  summary: '需求预测上下文',
  payload: { query: 'FSKU001' },
};

const renderShell = ({ fixtureBoundary = 'Fixture' }: { fixtureBoundary?: string } = {}) =>
  render(
    <BusinessSurfaceShell
      surfaceId='forecast'
      stateScope='test-scope'
      surfaceContext={snapshot}
      surfaceContextConversationId='conversation-a'
      agentName='需求预测 Agent'
      conversationTitle='需求预测对话'
      selectConversationLabel='选择需求预测对话'
      boardLabel='需求预测工作台'
      fixtureBoundary={fixtureBoundary}
      workflowSteps={[]}
      workflowCurrent={0}
    >
      <div>board</div>
    </BusinessSurfaceShell>
  );

const StatefulBoard = () => {
  const [value, setValue] = React.useState('');
  return <input aria-label='workbench draft' value={value} onChange={(event) => setValue(event.target.value)} />;
};

const renderStatefulShell = () =>
  render(
    <BusinessSurfaceShell
      surfaceId='forecast'
      stateScope='test-scope'
      agentName='需求预测 Agent'
      conversationTitle='需求预测对话'
      selectConversationLabel='选择需求预测对话'
      boardLabel='需求预测工作台'
      fixtureBoundary='Fixture'
      workflowSteps={[]}
      workflowCurrent={0}
    >
      <StatefulBoard />
    </BusinessSurfaceShell>
  );

const setNarrowViewport = (narrow: boolean) => {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: narrow,
    media: '(max-width: 1199px)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const automaticShell = (context: SurfaceContextSnapshot | undefined = snapshot, enabled = true) => (
  <BusinessSurfaceShell
    surfaceId='forecast'
    stateScope='auto-test'
    agentName='Forecast'
    conversationTitle='Approval advice'
    selectConversationLabel='Select'
    boardLabel='Board'
    workflowSteps={[]}
    workflowCurrent={0}
    automaticAnalysis={
      enabled
        ? { snapshot: context, label: context?.summary ?? '', prompt: 'Analyze only', unavailable: !context }
        : undefined
    }
  >
    <div>board</div>
  </BusinessSurfaceShell>
);

describe('BusinessSurfaceShell context receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    chatMountCounter.value = 0;
    runtimeViewMock.isProcessing = false;
    runtimeViewMock.activeTurnId = null;
    navigateMock.mockReset();
    assistantCatalogMock.mockResolvedValue([managedForecastAssistant]);
    assistantSetStateMock.mockResolvedValue(undefined);
    prepareConfigurationMock.mockResolvedValue(managedConversationReady);
    providerCatalogMock.mockResolvedValue([defaultProvider]);
    directCreateMock.mockResolvedValue(directConversation);
    setNarrowViewport(false);
    listConversations.mockResolvedValue({ items: conversations });
    getConversationMock.mockResolvedValue(null);
    createConversationMock.mockResolvedValue({
      ...conversations[1],
      id: 'conversation-new',
      name: 'Conversation New',
    });
  });

  it('automatically prepares a dedicated conversation with a frozen first-turn context exactly once', async () => {
    const view = render(<React.StrictMode>{automaticShell()}</React.StrictMode>);
    await screen.findByText('chat:Conversation New');
    expect(createConversationMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('acp_initial_message_conversation-a')).toBeNull();
    const first = JSON.parse(sessionStorage.getItem('acp_initial_message_conversation-new')!);
    expect(parseSurfaceContextBlock(first.input)).toEqual({
      text: 'Analyze only',
      snapshot: expect.objectContaining({ payload: snapshot.payload }),
    });
    view.rerender(<React.StrictMode>{automaticShell({ ...snapshot, revision: 99 })}</React.StrictMode>);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(createConversationMock).toHaveBeenCalledTimes(1);
  });

  it('hides previous advice immediately and rejects a stale preparation when scope changes', async () => {
    let resolveFirst!: (value: TChatConversation) => void;
    createConversationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    createConversationMock.mockResolvedValueOnce({ ...conversations[0], id: 'analysis-b', name: 'Scope B' });
    const view = render(automaticShell());
    await waitFor(() => expect(createConversationMock).toHaveBeenCalledTimes(1));
    const next = { ...snapshot, payload: { query: 'second-scope' } };
    view.rerender(automaticShell(next));
    expect(screen.queryByTestId('real-conversation')).not.toBeInTheDocument();
    await act(async () => {
      resolveFirst({ ...conversations[0], id: 'stale-analysis' });
    });
    await screen.findByText('chat:Scope B');
    expect(sessionStorage.getItem('acp_initial_message_stale-analysis')).toBeNull();
    expect(
      parseSurfaceContextBlock(JSON.parse(sessionStorage.getItem('acp_initial_message_analysis-b')!).input).snapshot
        ?.payload
    ).toEqual(next.payload);
  });

  it('opens history while the workbench has no usable snapshot', async () => {
    const view = render(automaticShell());
    await screen.findByText('chat:Conversation New');
    view.rerender(
      React.cloneElement(automaticShell(), {
        automaticAnalysis: { snapshot: undefined, prompt: 'Analyze only', label: '', unavailable: true },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: '历史对话' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Conversation A' }));
    expect(await screen.findByText('chat:Conversation A')).toBeVisible();
  });

  it('can return to a scope whose in-flight preparation was discarded', async () => {
    let release!: (value: TChatConversation) => void;
    createConversationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const view = render(automaticShell());
    await waitFor(() => expect(release).toBeDefined());
    view.rerender(automaticShell({ ...snapshot, payload: { scope: 'B' } }));
    await act(async () => release({ ...conversations[0], id: 'discarded-A' }));
    view.rerender(automaticShell());
    expect(await screen.findByText('chat:Conversation New')).toBeVisible();
  });

  it('removes an unconsumed automatic first turn on scope change and unmount', async () => {
    const view = render(automaticShell());
    await screen.findByText('chat:Conversation New');
    expect(sessionStorage.getItem('acp_initial_message_conversation-new')).not.toBeNull();
    view.rerender(automaticShell({ ...snapshot, payload: { scope: 'B' } }));
    expect(sessionStorage.getItem('acp_initial_message_conversation-new')).toBeNull();
    await screen.findByText('chat:Conversation New');
    view.unmount();
    expect(sessionStorage.getItem('acp_initial_message_conversation-new')).toBeNull();
  });

  it('preserves an explicit history choice when an automatic preparation finishes late', async () => {
    let release!: (value: TChatConversation) => void;
    createConversationMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        })
    );
    render(automaticShell());
    await waitFor(() => expect(release).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: '历史对话' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Conversation A' }));
    await act(async () => release({ ...conversations[0], id: 'late-analysis' }));
    await act(async () => {
      await new Promise((done) => setTimeout(done, 500));
    });
    expect(screen.getByText('chat:Conversation A')).toBeVisible();
    expect(createConversationMock).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit retry after preparation fails without looping', async () => {
    createConversationMock.mockRejectedValueOnce(new Error('offline'));
    render(automaticShell());
    await screen.findByText('common.assistantSurface.approvalAnalysis.failed');
    expect(createConversationMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await screen.findByText('chat:Conversation New');
    expect(createConversationMock).toHaveBeenCalledTimes(2);
  });

  it('does not queue an initial turn after leaving the approval page', async () => {
    let finish!: (value: TChatConversation) => void;
    createConversationMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const view = render(automaticShell());
    await waitFor(() => expect(createConversationMock).toHaveBeenCalledTimes(1));
    view.rerender(automaticShell(undefined, false));
    await act(async () => {
      finish({ ...conversations[0], id: 'left-page' });
    });
    expect(sessionStorage.getItem('acp_initial_message_left-page')).toBeNull();
  });

  it('prefers the packaged system Forecast Assistant over custom or generated skill matches', () => {
    expect(
      findPreferredForecastAssistant([
        managedForecastAssistant,
        standardForecastAssistant,
        { ...standardForecastAssistant, id: 'forecast-generated', source: 'generated' },
        builtinForecastAssistant,
      ] as never[])
    ).toMatchObject({ id: 'sales-forecast-planning', source: 'builtin' });
  });

  it('omits the boundary footer when the current board does not provide one', () => {
    renderShell({ fixtureBoundary: '' });

    expect(screen.queryByTestId('forecast-fixture-boundary')).not.toBeInTheDocument();
  });

  it('persists a late context receipt even after the user switches to another Conversation', async () => {
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', 'conversation-b');
    const firstRender = renderShell();
    expect(await screen.findByText('chat:Conversation B')).toBeVisible();

    act(() => {
      emitter.emit('assistant-surface.context-sent', {
        conversationId: 'conversation-a',
        surfaceId: 'forecast',
        revision: 2,
      });
    });
    firstRender.unmount();

    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', 'conversation-a');
    renderShell();
    expect(await screen.findByText('chat:Conversation A')).toBeVisible();
    expect(
      readAssistantSurfaceState('forecast', 'test-scope:conversation:conversation-a:last-shared-revision', null)
    ).toBe(2);
    expect(screen.getByTestId('real-conversation')).toHaveAttribute('data-context-revision', '2');
    expect(screen.queryByRole('region', { name: '本次对话业务范围' })).not.toBeInTheDocument();
  });

  it('keeps the Business Workbench mounted when the bound Conversation changes', async () => {
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', 'conversation-b');
    renderStatefulShell();
    expect(await screen.findByText('chat:Conversation B')).toBeVisible();
    const conversationMountId = screen.getByTestId('real-conversation').getAttribute('data-mount-id');

    const draft = screen.getByRole('textbox', { name: 'workbench draft' });
    fireEvent.change(draft, { target: { value: '未提交调整' } });

    fireEvent.click(screen.getByTestId('forecast-conversation-select'));
    const firstHistoryPanel = await screen.findByTestId('forecast-history-panel');
    const historyWrapper = firstHistoryPanel.closest('.arco-drawer-wrapper');
    expect(historyWrapper?.className).toMatch(/historyDrawerWrapper/);
    expect(historyWrapper?.querySelector('.arco-drawer-mask')).toBeInTheDocument();
    expect(businessShellStyles).toMatch(
      /\.historyDrawerWrapper\s*\{[^}]*top:\s*var\(--titlebar-height\);[^}]*bottom:\s*0;[^}]*height:\s*calc\(100% - var\(--titlebar-height\)\);/s
    );
    const nativeClose = firstHistoryPanel.closest('.arco-drawer')?.querySelector('.arco-drawer-close-icon');
    expect(nativeClose).toBeInstanceOf(HTMLElement);
    fireEvent.click(nativeClose!);
    await waitFor(() => expect(firstHistoryPanel).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('forecast-conversation-select'));
    const historyPanel = await screen.findByTestId('forecast-history-panel');
    expect(within(historyPanel).getByRole('option', { name: 'Conversation B' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const conversationA = within(historyPanel).getByRole('option', { name: 'Conversation A' });
    expect(conversationA).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(conversationA);

    expect(await screen.findByText('chat:Conversation A')).toBeVisible();
    await waitFor(() => expect(screen.queryByTestId('forecast-history-panel')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'workbench draft' })).toHaveValue('未提交调整');
    expect(screen.getByTestId('real-conversation')).not.toHaveAttribute('data-mount-id', conversationMountId);
  });

  it('shows the approved Agent identity and reuses the real New/History Conversation controls', async () => {
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', 'conversation-b');
    renderStatefulShell();
    expect(await screen.findByText('chat:Conversation B')).toBeVisible();

    expect(screen.getByText('需求预测 Agent')).toBeVisible();
    const historyButton = screen.getByRole('button', { name: '历史对话' });
    const newConversationButton = screen.getByRole('button', { name: '新对话' });
    expect(historyButton).toBeVisible();
    expect(historyButton).not.toHaveTextContent('历史');
    expect(newConversationButton).not.toHaveTextContent('新对话');
    fireEvent.click(newConversationButton);

    await waitFor(() => expect(createConversationMock).toHaveBeenCalledWith(conversations[1]));
    expect(await screen.findByText('chat:Conversation New')).toBeVisible();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('starts a business Conversation from the latest supported template when none is bound', async () => {
    renderStatefulShell();
    const emptyCreate = await screen.findByRole('button', { name: '新建 AI 对话' });
    expect(emptyCreate).toBeVisible();
    expect(emptyCreate).toBeEnabled();

    fireEvent.click(emptyCreate);

    await waitFor(() => expect(createConversationMock).toHaveBeenCalledWith(conversations[0]));
    expect(await screen.findByText('chat:Conversation New')).toBeVisible();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Team', 'forecast-team'],
    ['other Assistant', 'other-assistant'],
  ])('clears a persisted %s binding and only lists this Forecast Assistant conversations', async (_, boundId) => {
    const otherAssistantConversation = {
      ...conversations[0],
      id: 'other-assistant',
      name: 'Other Assistant Conversation',
      assistant: { ...conversations[0].assistant!, id: 'other-managed' },
    };
    const teamConversation = {
      ...conversations[0],
      id: 'forecast-team',
      name: 'Forecast Team Conversation',
      extra: { ...conversations[0].extra, team_id: 'team-forecast' },
    };
    listConversations.mockResolvedValue({
      items: [conversations[0], otherAssistantConversation, teamConversation],
    });
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', boundId);

    renderStatefulShell();

    expect(await screen.findByRole('button', { name: '新建 AI 对话' })).toBeVisible();
    expect(screen.queryByText('chat:Forecast Team Conversation')).not.toBeInTheDocument();
    expect(screen.queryByText('chat:Other Assistant Conversation')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('forecast-conversation-select'));
    const historyPanel = await screen.findByTestId('forecast-history-panel');
    expect(within(historyPanel).getByRole('option', { name: 'Conversation A' })).toBeVisible();
    expect(within(historyPanel).queryByRole('option', { name: 'Forecast Team Conversation' })).not.toBeInTheDocument();
    expect(
      within(historyPanel).queryByRole('option', { name: 'Other Assistant Conversation' })
    ).not.toBeInTheDocument();
  });

  it('rejects an off-Agent Team Conversation returned by the persisted binding fallback', async () => {
    const teamConversation = {
      ...conversations[0],
      id: 'forecast-team-fallback',
      name: 'Forecast Team Fallback',
      extra: { ...conversations[0].extra, teamId: 'team-forecast' },
    };
    listConversations.mockResolvedValue({ items: [conversations[0]] });
    getConversationMock.mockResolvedValue(teamConversation);
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', teamConversation.id);

    renderStatefulShell();

    expect(await screen.findByRole('button', { name: '新建 AI 对话' })).toBeVisible();
    expect(screen.queryByText('chat:Forecast Team Fallback')).not.toBeInTheDocument();
  });

  it('creates a managed Forecast Conversation through preparation when no template exists', async () => {
    listConversations.mockResolvedValueOnce({ items: [] }).mockResolvedValue({ items: [directConversation] });
    assistantCatalogMock.mockResolvedValue([
      { ...standardForecastAssistant, id: 'forecast-generated', source: 'generated' },
      managedForecastAssistant,
    ]);
    renderStatefulShell();
    const emptyCreate = await screen.findByRole('button', { name: '新建 AI 对话' });

    fireEvent.click(emptyCreate);

    await waitFor(() => expect(prepareConfigurationMock).toHaveBeenCalledTimes(1));
    expect(assistantSetStateMock).toHaveBeenCalledWith({ id: 'forecast-managed', enabled: true });
    expect(prepareConfigurationMock).toHaveBeenCalledWith({
      assistant: {
        id: 'forecast-managed',
        source: 'managed',
        assignment_id: 'assignment-forecast',
        template_version: '1.0.0',
        catalog_revision: 'catalog-r1',
        extension_revision: 'extension-r1',
      },
      locale: 'zh-CN',
      idempotency_key: expect.any(String),
      overrides: {},
    });
    expect(directCreateMock).toHaveBeenCalledWith({
      preparation: { id: 'preparation-1', revision: 'preparation-r1' },
    });
    expect(await screen.findByText('chat:需求预测对话')).toBeVisible();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('creates a standard Forecast Conversation directly when no template exists', async () => {
    const standardConversation = {
      ...directConversation,
      assistant: { ...directConversation.assistant!, id: 'sales-forecast-planning', source: 'builtin' },
    };
    listConversations.mockResolvedValueOnce({ items: [] }).mockResolvedValue({ items: [standardConversation] });
    assistantCatalogMock.mockResolvedValue([standardForecastAssistant, builtinForecastAssistant]);
    directCreateMock.mockResolvedValue(standardConversation);
    renderStatefulShell();

    fireEvent.click(await screen.findByRole('button', { name: '新建 AI 对话' }));

    await waitFor(() => expect(directCreateMock).toHaveBeenCalledTimes(1));
    expect(prepareConfigurationMock).not.toHaveBeenCalled();
    expect(directCreateMock).toHaveBeenCalledWith({
      name: '需求预测对话',
      model: { ...defaultProvider, use_model: 'deepseek-v4-flash' },
      assistant: { id: 'sales-forecast-planning', locale: 'zh-CN', conversation_overrides: {} },
      extra: {},
    });
    expect(await screen.findByText('chat:需求预测对话')).toBeVisible();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('uses a ready managed Aionrs preparation without requiring local providers', async () => {
    listConversations.mockResolvedValue({ items: [] });
    assistantCatalogMock.mockResolvedValue([
      { ...managedForecastAssistant, agent: { type: 'aionrs', source: 'internal' } },
    ]);
    providerCatalogMock.mockResolvedValue([]);
    renderStatefulShell();
    fireEvent.click(await screen.findByRole('button', { name: '新建 AI 对话' }));
    await waitFor(() =>
      expect(directCreateMock).toHaveBeenCalledWith({
        preparation: { id: 'preparation-1', revision: 'preparation-r1' },
      })
    );
    expect(providerCatalogMock).not.toHaveBeenCalled();
    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('shows an inline model setup action without repeated automatic error toasts across scopes', async () => {
    listConversations.mockResolvedValue({ items: [] });
    assistantCatalogMock.mockResolvedValue([builtinForecastAssistant]);
    providerCatalogMock.mockResolvedValue([]);
    const { rerender } = render(automaticShell());
    const configure = await screen.findByRole('button', {
      name: 'common.assistantSurface.approvalAnalysis.configureModel',
    });
    fireEvent.click(configure);
    expect(navigateMock).toHaveBeenCalledWith('/settings/model');
    rerender(automaticShell({ ...snapshot, payload: { query: 'FSKU002' } }));
    await waitFor(() => expect(providerCatalogMock).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'common.assistantSurface.approvalAnalysis.configureModel' });
    expect(messageErrorMock).not.toHaveBeenCalled();
    expect(directCreateMock).not.toHaveBeenCalled();
    providerCatalogMock.mockResolvedValue([defaultProvider]);
    const configuredConversation = {
      ...directConversation,
      assistant: { ...directConversation.assistant!, id: 'sales-forecast-planning', source: 'builtin' },
    };
    directCreateMock.mockResolvedValue(configuredConversation);
    getConversationMock.mockResolvedValue(configuredConversation);
    listConversations.mockResolvedValue({ items: [configuredConversation] });
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(directCreateMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('real-conversation')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'common.assistantSurface.approvalAnalysis.configureModel' })
    ).toBeNull();
  });

  it('does not create an unusable Aionrs Forecast Conversation when no model provider is available', async () => {
    listConversations.mockResolvedValue({ items: [] });
    assistantCatalogMock.mockResolvedValue([builtinForecastAssistant]);
    providerCatalogMock.mockResolvedValue([]);
    renderStatefulShell();

    fireEvent.click(await screen.findByRole('button', { name: '新建 AI 对话' }));

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('conversation.noModelConfigured'));
    expect(directCreateMock).not.toHaveBeenCalled();
  });

  it('stays empty when the Forecast Assistant is unavailable', async () => {
    listConversations.mockResolvedValue({ items: [] });
    assistantCatalogMock.mockResolvedValue([]);
    renderStatefulShell();

    fireEvent.click(await screen.findByRole('button', { name: '新建 AI 对话' }));

    await waitFor(() =>
      expect(messageErrorMock).toHaveBeenCalledWith('conversation.attention.salesForecast.assistantUnavailable')
    );
    expect(createConversationMock).not.toHaveBeenCalled();
    expect(directCreateMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'workbench draft' })).toBeVisible();
  });

  it('stays empty when managed Forecast preparation is blocked', async () => {
    listConversations.mockResolvedValue({ items: [] });
    assistantCatalogMock.mockResolvedValue([managedForecastAssistant]);
    prepareConfigurationMock.mockResolvedValue(managedConversationBlocked);
    renderStatefulShell();

    fireEvent.click(await screen.findByRole('button', { name: '新建 AI 对话' }));

    await waitFor(() => expect(prepareConfigurationMock).toHaveBeenCalledTimes(1));
    expect(directCreateMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(messageErrorMock).toHaveBeenCalledWith('conversation.attention.salesForecast.startFailed');
    expect(screen.getByRole('textbox', { name: 'workbench draft' })).toBeVisible();
  });

  it('shows the bound Conversation active Turn without inventing a second runtime state', async () => {
    runtimeViewMock.isProcessing = true;
    runtimeViewMock.activeTurnId = 'turn-real-42';
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', 'conversation-b');

    renderStatefulShell();

    expect(await screen.findByText('chat:Conversation B')).toBeVisible();
    expect(screen.getByTestId('forecast-active-turn')).toHaveTextContent('turn-real-42');
  });

  it('keeps the real Conversation rail visible on narrow desktop and bounds the recent list', async () => {
    setNarrowViewport(true);
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', 'conversation-b');

    renderStatefulShell();

    expect(await screen.findByText('chat:Conversation B')).toBeVisible();
    expect(screen.getByTestId('forecast-conversation-region')).toBeVisible();
    expect(screen.queryByRole('button', { name: '打开 AI 对话' })).not.toBeInTheDocument();
    expect(listConversations).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.getByRole('button', { name: '历史对话' })).toBeVisible();
    expect(screen.getByTestId('forecast-conversation-select')).toBeEnabled();
    expect(screen.queryByRole('combobox', { name: '选择需求预测对话' })).not.toBeInTheDocument();
    expect(screen.getByTestId('forecast-new-conversation')).toBeVisible();
    expect(screen.getByTestId('forecast-new-conversation')).toBeEnabled();
    fireEvent.click(screen.getByTestId('forecast-conversation-select'));
    expect(await screen.findByRole('listbox', { name: '选择需求预测对话' })).toBeVisible();
  });

  it('keeps the Agent identity and icon-only actions in one compact header row', () => {
    const headerRule = businessShellStyles.match(/\.conversationHeader\s*{([^}]*)}/)?.[1] ?? '';
    const headingRule = businessShellStyles.match(/\.conversationHeading\s*{([^}]*)}/)?.[1] ?? '';
    const controlsRule = businessShellStyles.match(/\.conversationControls\s*{([^}]*)}/)?.[1] ?? '';
    const actionRule = businessShellStyles.match(/\.conversationControls :global\(\.arco-btn\)\s*{([^}]*)}/)?.[1] ?? '';

    expect.soft(headerRule).toContain('min-height: 48px');
    expect.soft(headerRule).toContain('height: 48px');
    expect.soft(headerRule).toContain('align-items: center');
    expect.soft(headerRule).toContain('justify-content: space-between');
    expect.soft(headingRule).toContain('flex: 1 1 auto');
    expect.soft(controlsRule).toContain('width: auto');
    expect.soft(controlsRule).toContain('flex: 0 0 auto');
    expect.soft(actionRule).toContain('width: 32px');
    expect.soft(actionRule).toContain('min-height: 32px');
    expect.soft(actionRule).toContain('flex: 0 0 auto');
  });

  it('keeps an older bound Conversation available outside the bounded recent page', async () => {
    writeAssistantSurfaceState('forecast', 'test-scope:conversation-binding', 'conversation-b');
    listConversations.mockResolvedValue({ items: [conversations[0]] });
    getConversationMock.mockResolvedValue(conversations[1]);

    renderStatefulShell();

    expect(await screen.findByText('chat:Conversation B')).toBeVisible();
    expect(getConversationMock).toHaveBeenCalledWith({ id: 'conversation-b' });
  });
});
