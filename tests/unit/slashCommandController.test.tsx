import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSlashCommandController } from '@/renderer/hooks/chat/useSlashCommandController';

describe('useSlashCommandController', () => {
  it('inserts builtin commands marked with selectionBehavior=insert', () => {
    const onExecuteBuiltin = vi.fn();
    const onSelectTemplate = vi.fn();

    const { result } = renderHook(() =>
      useSlashCommandController({
        input: '/btw',
        commands: [
          {
            name: 'btw',
            description: 'Ask a quick side question',
            kind: 'builtin',
            source: 'builtin',
            selectionBehavior: 'insert',
          },
        ],
        onExecuteBuiltin,
        onSelectTemplate,
      })
    );

    act(() => {
      result.current.onKeyDown({
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onSelectTemplate).toHaveBeenCalledWith('btw');
    expect(onExecuteBuiltin).not.toHaveBeenCalled();
  });

  it('still executes builtin commands by default', () => {
    const onExecuteBuiltin = vi.fn();
    const onSelectTemplate = vi.fn();

    const { result } = renderHook(() =>
      useSlashCommandController({
        input: '/open',
        commands: [
          {
            name: 'open',
            description: 'Add file',
            kind: 'builtin',
            source: 'builtin',
          },
        ],
        onExecuteBuiltin,
        onSelectTemplate,
      })
    );

    act(() => {
      result.current.onKeyDown({
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    expect(onExecuteBuiltin).toHaveBeenCalledWith('open');
    expect(onSelectTemplate).not.toHaveBeenCalled();
  });
});
