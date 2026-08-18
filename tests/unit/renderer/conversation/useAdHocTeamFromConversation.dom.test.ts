import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdHocTeamFromConversation } from '@/renderer/pages/conversation/hooks/useAdHocTeamFromConversation';

const adHocMocks = vi.hoisted(() => ({
  fromConversation: { invoke: vi.fn() },
  getByConversation: { invoke: vi.fn() },
  get: { invoke: vi.fn() },
  getRunState: { invoke: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'team.sider.adHocTooltip' ? '临时团队' : key),
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      fromConversation: adHocMocks.fromConversation,
      getByConversation: adHocMocks.getByConversation,
      get: adHocMocks.get,
      getRunState: adHocMocks.getRunState,
    },
  },
}));

describe('useAdHocTeamFromConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adHocMocks.getByConversation.invoke.mockResolvedValue(null);
    adHocMocks.get.invoke.mockResolvedValue(null);
    adHocMocks.getRunState.invoke.mockResolvedValue({
      session_generation: null,
      active_run: null,
      slot_work: [],
    });
  });

  it('initially fetches the existing association for the conversation', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(adHocMocks.getByConversation.invoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      user_id: 'user-1',
    });
    expect(result.current.association).toEqual({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
  });

  it('creates a new team when create is invoked with a target assistant', async () => {
    adHocMocks.fromConversation.invoke.mockResolvedValue({
      team_id: 'team-2',
      origin_conversation_id: 'conv-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      created: true,
    });

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await act(async () => {
      await result.current.create('assistant-1');
    });

    expect(adHocMocks.fromConversation.invoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      user_id: 'user-1',
      target_assistant_id: 'assistant-1',
      name: '临时团队',
    });
    expect(result.current.result).toEqual({
      team_id: 'team-2',
      origin_conversation_id: 'conv-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      created: true,
    });
  });

  it('marks a newly created team active when the previous lookup reported disbanded', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: '',
      origin_conversation_id: 'conv-1',
      status: 'disbanded',
    });
    adHocMocks.fromConversation.invoke.mockResolvedValue({
      team_id: 'team-2',
      origin_conversation_id: 'conv-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      created: true,
    });

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.association?.status).toBe('disbanded'));

    await act(async () => {
      await result.current.create('assistant-1');
    });

    expect(result.current.association).toEqual({
      team_id: 'team-2',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
  });

  it('passes a source-derived team name when one is available', async () => {
    adHocMocks.fromConversation.invoke.mockResolvedValue({
      team_id: 'team-2',
      origin_conversation_id: 'conv-1',
      leader_slot_id: 'slot-lead',
      created: true,
    });

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1', '发布计划'));

    await act(async () => {
      await result.current.create('assistant-1');
    });

    expect(adHocMocks.fromConversation.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ name: '发布计划 · 临时团队' })
    );
  });

  it('exposes an error when the backend call fails', async () => {
    adHocMocks.fromConversation.invoke.mockRejectedValue(new Error('network failure'));

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await act(async () => {
      await expect(result.current.create('assistant-1')).rejects.toThrow('network failure');
    });

    expect(result.current.error?.message).toBe('network failure');
  });

  it('clears the previous error when clearError is called', async () => {
    adHocMocks.fromConversation.invoke.mockRejectedValue(new Error('network failure'));

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await act(async () => {
      await expect(result.current.create('assistant-1')).rejects.toThrow('network failure');
    });

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });

  it('skips association fetch when conversation id is missing', () => {
    renderHook(() => useAdHocTeamFromConversation('', 'user-1'));

    expect(adHocMocks.getByConversation.invoke).not.toHaveBeenCalled();
  });

  it('exposes an error when the initial association lookup fails', async () => {
    adHocMocks.getByConversation.invoke.mockRejectedValue(new Error('lookup failed'));

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('lookup failed');
    expect(result.current.association).toBeNull();
  });

  it('logs but survives when fetching the team summary fails', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.get.invoke.mockRejectedValue(new Error('summary failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await waitFor(() => expect(result.current.association?.team_id).toBe('team-1'));

    expect(consoleSpy).toHaveBeenCalledWith(
      '[useAdHocTeamFromConversation] Failed to fetch team summary:',
      expect.any(Error)
    );
    expect(result.current.team).toBeNull();

    consoleSpy.mockRestore();
  });

  it('logs but survives when fetching the run state fails', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.getRunState.invoke.mockRejectedValue(new Error('run state failed'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await waitFor(() => expect(result.current.association?.team_id).toBe('team-1'));

    expect(consoleSpy).toHaveBeenCalledWith(
      '[useAdHocTeamFromConversation] Failed to fetch run state:',
      expect.any(Error)
    );
    expect(result.current.activeRun).toBeUndefined();

    consoleSpy.mockRestore();
  });
});
