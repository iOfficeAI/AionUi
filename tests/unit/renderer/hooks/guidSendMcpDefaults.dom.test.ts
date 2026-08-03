import { act, renderHook } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createInvoke, navigateMock } = vi.hoisted(() => ({
  createInvoke: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: { conversation: { create: { invoke: createInvoke } } },
}));

vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  toSessionMcpServer: (server: { id: string }) => ({ id: server.id }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { warning: vi.fn(), error: vi.fn() },
}));

vi.mock('swr', () => ({ mutate: vi.fn() }));

vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: vi.fn() } }));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({ updateWorkspaceTime: vi.fn() }));

vi.mock('@/renderer/pages/conversation/utils/conversationCreateError', () => ({
  getConversationCreateErrorMessage: vi.fn(),
}));

import type { IMcpServer } from '@/common/config/storage';
import type { GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';
import { useGuidSend } from '@/renderer/pages/guid/hooks/useGuidSend';

const server = (overrides: Partial<IMcpServer> & { id: string }): IMcpServer => ({
  name: overrides.id,
  enabled: false,
  transport: { type: 'stdio', command: 'test' },
  created_at: 1,
  updated_at: 1,
  original_json: '{}',
  ...overrides,
});

// Global default (enabled), an opt-in server, a builtin enabled server, and a
// server picked only by the assistant's own defaults.
const availableMcpServers = [
  server({ id: 'memory', enabled: true }),
  server({ id: 'other', enabled: false }),
  server({ id: 'chrome', builtin: true, enabled: true }),
  server({ id: 'assistant-picked', enabled: false }),
];

const buildDeps = (overrides: Partial<GuidSendDeps>): GuidSendDeps => ({
  input: 'hello',
  setInput: vi.fn(),
  files: [],
  setFiles: vi.fn(),
  dir: '',
  setDir: vi.fn(),
  setLoading: vi.fn(),
  loading: false,
  selectedAssistantId: 'agent-1',
  selectedAssistantBackend: 'claude',
  selectedMode: 'auto',
  selectedAcpModel: null,
  currentAcpCachedModelInfo: null,
  current_model: undefined,
  guidDisabledBuiltinSkills: undefined,
  guidEnabledSkills: undefined,
  availableMcpServers,
  selectedMcpServerIds: undefined,
  assistantDefaultMcpIds: [],
  isGoogleAuth: false,
  setMentionOpen: vi.fn(),
  setMentionQuery: vi.fn(),
  setMentionSelectorOpen: vi.fn(),
  setMentionActiveIndex: vi.fn(),
  navigate: navigateMock as unknown as GuidSendDeps['navigate'],
  t: ((key: string) => key) as unknown as TFunction,
  localeKey: 'en-US',
  ...overrides,
});

const sendAndGetPayload = async (overrides: Partial<GuidSendDeps>) => {
  const deps = buildDeps(overrides);
  const { result } = renderHook(() => useGuidSend(deps));
  await act(async () => {
    await result.current.handleSend();
  });
  expect(createInvoke).toHaveBeenCalledTimes(1);
  return createInvoke.mock.calls[0][0] as {
    assistant: { conversation_overrides: { mcp_ids?: string[] } };
    extra: { selected_mcp_server_ids: string[]; selected_session_mcp_servers: Array<{ id: string }> };
  };
};

describe('useGuidSend MCP auto-selection payload (#3119)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInvoke.mockResolvedValue({ id: 'conversation-1' });
  });

  it('untouched selection sends assistant defaults unioned with global default-enabled servers', async () => {
    const payload = await sendAndGetPayload({ assistantDefaultMcpIds: ['assistant-picked'] });

    expect(payload.assistant.conversation_overrides.mcp_ids).toEqual(['assistant-picked', 'memory']);
    // Opt-in and builtin servers stay out of the user-id lane.
    expect(payload.extra.selected_mcp_server_ids).toEqual(['memory', 'assistant-picked']);
    expect(payload.extra.selected_mcp_server_ids).not.toContain('other');
    expect(payload.extra.selected_mcp_server_ids).not.toContain('chrome');
  });

  it('explicit selection after removing a default is sent as-is', async () => {
    const payload = await sendAndGetPayload({
      assistantDefaultMcpIds: ['assistant-picked'],
      selectedMcpServerIds: ['assistant-picked'],
    });

    expect(payload.assistant.conversation_overrides.mcp_ids).toEqual(['assistant-picked']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['assistant-picked']);
    expect(payload.extra.selected_mcp_server_ids).not.toContain('memory');
  });

  it('builtin servers flow only through the session lane when an assistant default names them', async () => {
    const payload = await sendAndGetPayload({ assistantDefaultMcpIds: ['chrome'] });

    expect(payload.assistant.conversation_overrides.mcp_ids).toEqual(['chrome', 'memory']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['memory']);
    expect(payload.extra.selected_session_mcp_servers.map((s) => s.id)).toEqual(['memory', 'chrome']);
  });

  it('falls back to global defaults alone when the assistant has no MCP defaults', async () => {
    const payload = await sendAndGetPayload({ assistantDefaultMcpIds: undefined });

    expect(payload.assistant.conversation_overrides.mcp_ids).toEqual(['memory']);
    expect(payload.extra.selected_mcp_server_ids).toEqual(['memory']);
  });
});
