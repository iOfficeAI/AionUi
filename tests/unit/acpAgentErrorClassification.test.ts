import { describe, expect, it, vi } from 'vitest';
import { AcpAgent } from '../../src/process/agent/acp';
import { AcpErrorType } from '../../src/common/types/acpTypes';
import { AcpProtocolError } from '../../src/process/agent/shared';

function makeReadyAgent(backend: 'claude' | 'qwen' = 'claude') {
  const onStreamEvent = vi.fn();
  const onSignalEvent = vi.fn();
  const agent = new AcpAgent({
    id: `${backend}-agent`,
    onStreamEvent,
    onSignalEvent,
    extra: { backend, workspace: '/tmp' },
  } as any);

  const connection = (agent as any).connection;
  (connection as any).child = { killed: false };
  (connection as any).sessionId = 'session-1';

  vi.spyOn(agent as any, 'processAtFileReferences').mockResolvedValue('hello world');
  vi.spyOn(agent as any, 'applyPromptTimeoutFromConfig').mockResolvedValue(undefined);

  return { agent, connection, onSignalEvent, onStreamEvent };
}

describe('AcpAgent.sendMessage error classification', () => {
  it('uses structured RPC errors instead of string matching only', async () => {
    const { agent, connection, onSignalEvent } = makeReadyAgent();

    vi.spyOn(connection, 'sendPrompt').mockRejectedValue(
      new AcpProtocolError({
        acpType: AcpErrorType.PERMISSION_DENIED,
        code: 403,
        message: 'Permission denied',
        method: 'session/prompt',
        retryable: false,
      })
    );

    const result = await agent.sendMessage({ content: 'hello', msg_id: 'msg-1' });

    expect(result).toEqual({
      success: false,
      error: expect.objectContaining({
        message: 'Permission denied',
        retryable: false,
        type: AcpErrorType.PERMISSION_DENIED,
      }),
    });
    expect(onSignalEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'finish' }));
  });

  it('still provides qwen-specific auth guidance for internal errors', async () => {
    const { agent, connection } = makeReadyAgent('qwen');

    vi.spyOn(connection, 'sendPrompt').mockRejectedValue(new Error('Internal error'));

    const result = await agent.sendMessage({ content: 'hello' });

    expect(result).toEqual({
      success: false,
      error: expect.objectContaining({
        retryable: false,
        type: AcpErrorType.AUTHENTICATION_FAILED,
      }),
    });
    if (result.success) {
      throw new Error('Expected sendMessage to fail');
    }
    expect(result.error.message).toContain('Qwen ACP Internal Error');
  });
});
