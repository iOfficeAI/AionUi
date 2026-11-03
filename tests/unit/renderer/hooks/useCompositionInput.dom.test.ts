/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

const stubMatchMedia = (touchPrimary: boolean) => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === TOUCH_QUERY && touchPrimary,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

const keyEvent = (key: string, shiftKey = false) => {
  const preventDefault = vi.fn();
  return { event: { key, shiftKey, preventDefault } as unknown as React.KeyboardEvent, preventDefault };
};

const setup = (intercept?: (e: React.KeyboardEvent) => boolean) => {
  const onEnterPress = vi.fn();
  const { result } = renderHook(() => useCompositionInput());
  const handler = result.current.createKeyDownHandler(onEnterPress, intercept);
  return { onEnterPress, handler };
};

describe('useCompositionInput Enter handling', () => {
  afterEach(() => {
    // jsdom has no matchMedia; each test installs its own stub
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('sends on Enter on devices with a hover-capable fine pointer', () => {
    stubMatchMedia(false);
    const { onEnterPress, handler } = setup();
    const { event, preventDefault } = keyEvent('Enter');

    handler(event);

    expect(onEnterPress).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('keeps the native newline on Enter on touch-first devices instead of sending', () => {
    stubMatchMedia(true);
    const { onEnterPress, handler } = setup();
    const { event, preventDefault } = keyEvent('Enter');

    handler(event);

    expect(onEnterPress).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('still lets intercepts consume Enter on touch-first devices (e.g. picking a menu item)', () => {
    stubMatchMedia(true);
    const intercept = vi.fn(() => true);
    const { onEnterPress, handler } = setup(intercept);

    handler(keyEvent('Enter').event);

    expect(intercept).toHaveBeenCalledTimes(1);
    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('never sends on Shift+Enter', () => {
    stubMatchMedia(false);
    const { onEnterPress, handler } = setup();

    handler(keyEvent('Enter', true).event);

    expect(onEnterPress).not.toHaveBeenCalled();
  });

  it('falls back to Enter-to-send when matchMedia is unavailable', () => {
    const { onEnterPress, handler } = setup();

    handler(keyEvent('Enter').event);

    expect(onEnterPress).toHaveBeenCalledTimes(1);
  });
});
