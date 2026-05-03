import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ProcessAcpClient } from '@process/acp/infra/ProcessAcpClient';

function makeChild() {
  const child = new EventEmitter() as any;
  child.stdin = { destroyed: false, end: vi.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal?: string) => {
    child.signalCode = signal ?? null;
    setTimeout(() => {
      child.exitCode = 143;
      child.emit('exit', 143, signal ?? null);
      child.emit('close', 143, signal ?? null);
      child.stdout.emit('close');
    }, 0);
    return true;
  });
  child.unref = vi.fn();
  return child;
}

function makeClient(child: any, cancelImpl: () => Promise<void>) {
  const client = new ProcessAcpClient(async () => child, {
    backend: 'claude',
    handlers: {
      onSessionUpdate: vi.fn(),
      onRequestPermission: vi.fn(),
      onReadTextFile: vi.fn(),
      onWriteTextFile: vi.fn(),
    },
    gracePeriodMs: 10,
  });
  (client as any).child = child;
  (client as any).connection = { cancel: cancelImpl };
  return client;
}

describe('ProcessAcpClient.cancel fallback', () => {
  it('terminates the ACP process when protocol cancel is not implemented', async () => {
    const child = makeChild();
    const methodNotFound = Object.assign(new Error('"Method not found": session/cancel'), { code: -32601 });
    const client = makeClient(child, vi.fn().mockRejectedValue(methodNotFound));

    await client.cancel('session-1');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(child.stdin.end).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('terminates the ACP process when protocol cancel returns but a prompt remains active', async () => {
    const child = makeChild();
    const client = makeClient(child, vi.fn().mockResolvedValue(undefined));
    (client as any).hasActivePrompt = true;

    await client.cancel('session-1');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(child.stdin.end).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('does not terminate the ACP process when protocol cancel succeeds and no prompt remains active', async () => {
    const child = makeChild();
    const client = makeClient(child, vi.fn().mockResolvedValue(undefined));
    (client as any).hasActivePrompt = false;

    await client.cancel('session-1');

    expect(child.kill).not.toHaveBeenCalled();
  });
});
