import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAcpInitialMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage';

const mockAcpSendInvoke = vi.fn();
const mockAddOrUpdateMessage = vi.fn();
const mockEmitterEmit = vi.fn();
const mockBuildDisplayMessage = vi.fn(
  (input: string, files: string[], workspacePath: string) => `${input}|${files.join(',')}|${workspacePath}`
);

let uuidCounter = 0;

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      sendMessage: {
        invoke: (...args: unknown[]) => mockAcpSendInvoke(...args),
      },
    },
  },
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => `acp-init-${++uuidCounter}`),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => mockAddOrUpdateMessage,
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: (...args: unknown[]) => mockEmitterEmit(...args),
  },
}));

vi.mock('@/renderer/utils/file/messageFiles', () => ({
  buildDisplayMessage: (...args: Parameters<typeof mockBuildDisplayMessage>) => mockBuildDisplayMessage(...args),
}));

describe('useAcpInitialMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    sessionStorage.clear();
    mockAcpSendInvoke.mockResolvedValue({ success: true });
  });

  it('uses display message when the initial ACP prompt includes uploaded files', async () => {
    const setAiProcessing = vi.fn();
    const checkAndUpdateTitle = vi.fn();

    sessionStorage.setItem(
      'acp_initial_message_conv-acp',
      JSON.stringify({
        input: 'describe this image',
        files: ['C:/workspace/uploads/photo.png'],
      })
    );

    renderHook(() =>
      useAcpInitialMessage({
        conversationId: 'conv-acp',
        backend: 'claude',
        workspacePath: 'C:/workspace',
        setAiProcessing,
        checkAndUpdateTitle,
        addOrUpdateMessage: mockAddOrUpdateMessage,
      })
    );

    await waitFor(() => {
      expect(mockAcpSendInvoke).toHaveBeenCalledTimes(1);
    });

    expect(mockBuildDisplayMessage).toHaveBeenCalledWith(
      'describe this image',
      ['C:/workspace/uploads/photo.png'],
      'C:/workspace'
    );
    expect(setAiProcessing).toHaveBeenCalledWith(true);
    expect(checkAndUpdateTitle).toHaveBeenCalledWith('conv-acp', 'describe this image');
    expect(mockAcpSendInvoke).toHaveBeenCalledWith({
      input: 'describe this image|C:/workspace/uploads/photo.png|C:/workspace',
      msg_id: 'acp-init-1',
      conversation_id: 'conv-acp',
      files: ['C:/workspace/uploads/photo.png'],
    });
    expect(mockEmitterEmit).toHaveBeenCalledWith('chat.history.refresh');
    expect(sessionStorage.getItem('acp_initial_message_conv-acp')).toBeNull();
  });
});
