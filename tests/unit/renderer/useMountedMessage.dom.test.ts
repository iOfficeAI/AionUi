/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for ELECTRON-1A1:
 * `TypeError: Cannot read properties of null (reading 'addInstance')`.
 *
 * ToolsModalContent fires `mcpMessage.error(...)` from async callbacks
 * (image-generation sync/toggle) that can resolve after the user navigates away
 * and the component unmounts. At that point Arco's message context holder is null
 * and the call throws. `useMountedMessage` wraps the instance so calls after
 * unmount are dropped silently.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useMountedMessage } from '@/renderer/hooks/mcp/useMountedMessage';

const makeMessage = () => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
});

describe('useMountedMessage — ELECTRON-1A1', () => {
  it('forwards calls while the component is mounted', () => {
    const message = makeMessage();
    const { result } = renderHook(() => useMountedMessage(message as never));

    act(() => {
      result.current.error('boom');
      result.current.success('ok');
    });

    expect(message.error).toHaveBeenCalledWith('boom');
    expect(message.success).toHaveBeenCalledWith('ok');
  });

  it('drops calls after the component unmounts instead of throwing', () => {
    const message = makeMessage();
    const { result, unmount } = renderHook(() => useMountedMessage(message as never));
    const guarded = result.current;

    unmount();

    expect(() => guarded.error('boom')).not.toThrow();
    expect(message.error).not.toHaveBeenCalled();
  });

  it('swallows the null.addInstance crash if the underlying instance throws', () => {
    const message = makeMessage();
    message.error.mockImplementation(() => {
      throw new TypeError("Cannot read properties of null (reading 'addInstance')");
    });
    const { result } = renderHook(() => useMountedMessage(message as never));

    expect(() => act(() => result.current.error('boom'))).not.toThrow();
  });
});
