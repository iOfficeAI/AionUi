import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdHocTeamFromConversation } from '@/renderer/pages/conversation/hooks/useAdHocTeamFromConversation';

const adHocMocks = vi.hoisted(() => ({
  fromConversation: { invoke: vi.fn() },
  getByConversation: { invoke: vi.fn() },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      fromConversation: adHocMocks.fromConversation,
      getByConversation: adHocMocks.getByConversation,
    },
  },
}));

describe('useAdHocTeamFromConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adHocMocks.getByConversation.invoke.mockResolvedValue(null);
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
    });
    expect(result.current.result).toEqual({
      team_id: 'team-2',
      origin_conversation_id: 'conv-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      created: true,
    });
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
});
