/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommandItem } from '@/common/chat/slash/types';
import { useSlashCommandController } from '@/renderer/hooks/chat/useSlashCommandController';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

const COMMANDS: SlashCommandItem[] = [
  { name: 'gogogo', description: 'delivery pipeline', kind: 'template', source: 'skill' },
  { name: 'greet', description: 'a builtin action', kind: 'builtin', source: 'builtin' },
];

function makeKey(key: string, shiftKey = false, currentTargetValue?: string) {
  const preventDefault = vi.fn();
  // Omit currentTarget entirely unless a live value is supplied, so the hook
  // falls back to the `input` prop — mirroring events that carry no target.
  const currentTarget = currentTargetValue === undefined ? undefined : { value: currentTargetValue };
  const event = { key, shiftKey, preventDefault, currentTarget } as unknown as ReactKeyboardEvent;
  return { event, preventDefault };
}

function setup() {
  const onExecuteBuiltin = vi.fn();
  const onSelectTemplate = vi.fn();
  // `input: '/'` yields an empty query, which keeps every command visible so the
  // menu is open with more than one item to navigate.
  const hook = renderHook(() =>
    useSlashCommandController({ input: '/', commands: COMMANDS, onExecuteBuiltin, onSelectTemplate })
  );
  return { hook, onExecuteBuiltin, onSelectTemplate };
}

describe('useSlashCommandController — Tab accepts like Enter', () => {
  it('Tab accepts the active template command', () => {
    const { hook, onSelectTemplate, onExecuteBuiltin } = setup();
    const { event, preventDefault } = makeKey('Tab');

    let handled: boolean | undefined;
    act(() => {
      handled = hook.result.current.onKeyDown(event);
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSelectTemplate).toHaveBeenCalledWith('gogogo');
    expect(onExecuteBuiltin).not.toHaveBeenCalled();
  });

  it('Tab honors the active index moved by ArrowDown, executing a builtin command', () => {
    const { hook, onSelectTemplate, onExecuteBuiltin } = setup();

    act(() => {
      hook.result.current.onKeyDown(makeKey('ArrowDown').event);
    });
    const { event, preventDefault } = makeKey('Tab');
    act(() => {
      hook.result.current.onKeyDown(event);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onExecuteBuiltin).toHaveBeenCalledWith('greet');
    expect(onSelectTemplate).not.toHaveBeenCalled();
  });

  it('Shift+Tab also accepts (matching the @-mention dropdown contract)', () => {
    const { hook, onSelectTemplate } = setup();
    const { event } = makeKey('Tab', true);

    let handled: boolean | undefined;
    act(() => {
      handled = hook.result.current.onKeyDown(event);
    });

    expect(handled).toBe(true);
    expect(onSelectTemplate).toHaveBeenCalledWith('gogogo');
  });

  it('Tab is not intercepted when the menu is closed, so focus traversal is preserved', () => {
    const onExecuteBuiltin = vi.fn();
    const onSelectTemplate = vi.fn();
    // Plain text (no leading slash) means query === null and the menu is closed.
    const hook = renderHook(() =>
      useSlashCommandController({ input: 'hello', commands: COMMANDS, onExecuteBuiltin, onSelectTemplate })
    );
    const { event, preventDefault } = makeKey('Tab');

    let handled: boolean | undefined;
    act(() => {
      handled = hook.result.current.onKeyDown(event);
    });

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onSelectTemplate).not.toHaveBeenCalled();
    expect(onExecuteBuiltin).not.toHaveBeenCalled();
  });
});

describe('useSlashCommandController — Enter never sends while a command query is live', () => {
  // Regression for the race where fast typing + Enter sends the raw "/command"
  // text: the controlled `input` prop lags the keystroke, so the memoized
  // isOpen/filteredCommands captured in this render are stale. The keydown must
  // decide from the live DOM value (event.currentTarget.value), not the prop.
  it('intercepts Enter using the live input value even when the prop still lags behind', () => {
    const onExecuteBuiltin = vi.fn();
    const onSelectTemplate = vi.fn();
    // Prop is still empty (menu computed closed), but the textarea already holds
    // the full slash query — the exact stale-state window.
    const hook = renderHook(() =>
      useSlashCommandController({ input: '', commands: COMMANDS, onExecuteBuiltin, onSelectTemplate })
    );
    const { event, preventDefault } = makeKey('Enter', false, '/gogo');

    let handled: boolean | undefined;
    act(() => {
      handled = hook.result.current.onKeyDown(event);
    });

    // Handled → SendBox's Enter-to-send branch is blocked; the command is selected.
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSelectTemplate).toHaveBeenCalledWith('gogogo');
  });

  it('still sends plain text: no leading slash means Enter is not intercepted', () => {
    const onExecuteBuiltin = vi.fn();
    const onSelectTemplate = vi.fn();
    const hook = renderHook(() =>
      useSlashCommandController({ input: '', commands: COMMANDS, onExecuteBuiltin, onSelectTemplate })
    );
    const { event, preventDefault } = makeKey('Enter', false, 'hello world');

    let handled: boolean | undefined;
    act(() => {
      handled = hook.result.current.onKeyDown(event);
    });

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onSelectTemplate).not.toHaveBeenCalled();
    expect(onExecuteBuiltin).not.toHaveBeenCalled();
  });

  it('still sends an unknown "/xyz": Enter is not intercepted when nothing matches', () => {
    const onExecuteBuiltin = vi.fn();
    const onSelectTemplate = vi.fn();
    const hook = renderHook(() =>
      useSlashCommandController({ input: '', commands: COMMANDS, onExecuteBuiltin, onSelectTemplate })
    );
    const { event, preventDefault } = makeKey('Enter', false, '/xyz');

    let handled: boolean | undefined;
    act(() => {
      handled = hook.result.current.onKeyDown(event);
    });

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(onSelectTemplate).not.toHaveBeenCalled();
    expect(onExecuteBuiltin).not.toHaveBeenCalled();
  });
});
