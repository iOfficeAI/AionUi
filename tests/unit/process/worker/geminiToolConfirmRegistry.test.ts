import { describe, expect, it, vi } from 'vitest';

import { createGeminiToolConfirmRegistry } from '@/process/worker/geminiToolConfirmRegistry';

describe('createGeminiToolConfirmRegistry', () => {
  it('keeps a single listener per callId and uses the latest confirmation callback', () => {
    const handlers = new Map<string, (confirmKey: string, deferred?: { resolve?: (value: unknown) => void }) => void>();
    const pipe = {
      once: vi.fn(
        (
          eventName: string,
          handler: (confirmKey: string, deferred?: { resolve?: (value: unknown) => void }) => void
        ) => {
          handlers.set(eventName, handler);
        }
      ),
    };
    const registry = createGeminiToolConfirmRegistry(pipe);
    const firstConfirm = vi.fn();
    const latestConfirm = vi.fn();
    const resolve = vi.fn();

    const firstTool = registry.sanitizeTool({
      callId: 'call-1',
      name: 'run_shell_command',
      confirmationDetails: {
        title: 'Confirm Shell Command',
        onConfirm: firstConfirm,
      },
    });
    const updatedTool = registry.sanitizeTool({
      callId: 'call-1',
      name: 'run_shell_command',
      confirmationDetails: {
        title: 'Confirm Shell Command',
        onConfirm: latestConfirm,
      },
    });

    expect(pipe.once).toHaveBeenCalledTimes(1);
    expect(firstTool.confirmationDetails).toEqual({ title: 'Confirm Shell Command' });
    expect(updatedTool.confirmationDetails).toEqual({ title: 'Confirm Shell Command' });

    handlers.get('call-1')?.('allow_once', { resolve });

    expect(firstConfirm).not.toHaveBeenCalled();
    expect(latestConfirm).toHaveBeenCalledWith('allow_once');
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it('drops stale callbacks when a later tool update no longer needs confirmation', () => {
    const handlers = new Map<string, (confirmKey: string, deferred?: { resolve?: (value: unknown) => void }) => void>();
    const pipe = {
      once: vi.fn(
        (
          eventName: string,
          handler: (confirmKey: string, deferred?: { resolve?: (value: unknown) => void }) => void
        ) => {
          handlers.set(eventName, handler);
        }
      ),
    };
    const registry = createGeminiToolConfirmRegistry(pipe);
    const confirm = vi.fn();
    const resolve = vi.fn();

    registry.sanitizeTool({
      callId: 'call-2',
      name: 'run_shell_command',
      confirmationDetails: {
        title: 'Confirm Shell Command',
        onConfirm: confirm,
      },
    });
    const sanitized = registry.sanitizeTool({
      callId: 'call-2',
      name: 'run_shell_command',
    });

    expect(sanitized.confirmationDetails).toBeUndefined();

    handlers.get('call-2')?.('allow_once', { resolve });

    expect(confirm).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it('re-registers the listener after the previous approval completes', () => {
    const handlers = new Map<string, (confirmKey: string, deferred?: { resolve?: (value: unknown) => void }) => void>();
    const pipe = {
      once: vi.fn(
        (
          eventName: string,
          handler: (confirmKey: string, deferred?: { resolve?: (value: unknown) => void }) => void
        ) => {
          handlers.set(eventName, handler);
        }
      ),
    };
    const registry = createGeminiToolConfirmRegistry(pipe);
    const firstConfirm = vi.fn();
    const secondConfirm = vi.fn();

    registry.sanitizeTool({
      callId: 'call-3',
      name: 'run_shell_command',
      confirmationDetails: {
        title: 'Confirm Shell Command',
        onConfirm: firstConfirm,
      },
    });
    handlers.get('call-3')?.('allow_once');

    registry.sanitizeTool({
      callId: 'call-3',
      name: 'run_shell_command',
      confirmationDetails: {
        title: 'Confirm Shell Command',
        onConfirm: secondConfirm,
      },
    });
    handlers.get('call-3')?.('allow_always');

    expect(pipe.once).toHaveBeenCalledTimes(2);
    expect(firstConfirm).toHaveBeenCalledWith('allow_once');
    expect(secondConfirm).toHaveBeenCalledWith('allow_always');
  });
});
