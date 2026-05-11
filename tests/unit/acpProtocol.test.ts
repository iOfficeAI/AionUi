import { describe, expect, it } from 'vitest';
import { AcpErrorType } from '../../src/common/types/acpTypes';
import {
  AcpProtocolError,
  classifyAcpError,
  createAcpProtocolError,
  parseAcpJsonRpcMessage,
} from '../../src/process/agent/shared';

describe('parseAcpJsonRpcMessage', () => {
  it('parses valid ACP notifications', () => {
    const message = parseAcpJsonRpcMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'session/update',
        params: { sessionId: 'session-1', update: { sessionUpdate: 'noop' } },
      })
    );

    expect(message).toEqual(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'session/update',
      })
    );
  });

  it('parses valid JSON-RPC error responses', () => {
    const message = parseAcpJsonRpcMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        error: { code: 403, message: 'Permission denied' },
      })
    );

    expect(message).toEqual(
      expect.objectContaining({
        id: 7,
        error: expect.objectContaining({ code: 403, message: 'Permission denied' }),
      })
    );
  });

  it('rejects invalid JSON-RPC envelopes', () => {
    expect(parseAcpJsonRpcMessage('{"id":1,"method":"session/new"}')).toBeNull();
    expect(
      parseAcpJsonRpcMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'bad-id',
          error: { code: 403, message: 'Permission denied' },
        })
      )
    ).toBeNull();
    expect(
      parseAcpJsonRpcMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          result: {},
          error: { code: 500, message: 'boom' },
        })
      )
    ).toBeNull();
  });
});

describe('createAcpProtocolError', () => {
  it('maps structured RPC errors to ACP categories', () => {
    const error = createAcpProtocolError(
      { code: 403, message: 'Permission denied' },
      { backend: 'claude', method: 'session/prompt' }
    );

    expect(error).toBeInstanceOf(AcpProtocolError);
    expect(error.acpType).toBe(AcpErrorType.PERMISSION_DENIED);
    expect(error.retryable).toBe(false);
    expect(error.method).toBe('session/prompt');
  });

  it('upgrades qwen internal errors to actionable auth guidance', () => {
    const error = createAcpProtocolError(
      { code: -32603, message: 'Internal error' },
      { backend: 'qwen', method: 'session/prompt' }
    );

    expect(error.acpType).toBe(AcpErrorType.AUTHENTICATION_FAILED);
    expect(error.message).toContain('Qwen ACP Internal Error');
    expect(error.retryable).toBe(false);
  });
});

describe('classifyAcpError', () => {
  it('preserves structured protocol classifications', () => {
    const classification = classifyAcpError(
      new AcpProtocolError({
        acpType: AcpErrorType.TIMEOUT,
        code: 504,
        message: 'Gateway timeout',
        retryable: true,
      })
    );

    expect(classification).toEqual({
      message: 'Gateway timeout',
      retryable: true,
      type: AcpErrorType.TIMEOUT,
    });
  });

  it('falls back to message-based classification for generic errors', () => {
    const classification = classifyAcpError(new Error('Connection reset by peer'), 'claude');

    expect(classification).toEqual({
      message: 'Connection reset by peer',
      retryable: true,
      type: AcpErrorType.NETWORK_ERROR,
    });
  });
});
