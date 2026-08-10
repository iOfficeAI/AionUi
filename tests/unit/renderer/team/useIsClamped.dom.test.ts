/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { expect, test } from 'vitest';
import { useIsClamped } from '@/renderer/pages/team/activity/useIsClamped';

function withMetrics(scrollH: number, clientH: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollH, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientH, configurable: true });
  return el;
}

test('true when content overflows', () => {
  const el = withMetrics(90, 60);
  const { result } = renderHook(() => {
    const ref = useRef<HTMLDivElement>(el);
    return useIsClamped(ref, []);
  });
  expect(result.current).toBe(true);
});

test('false when content fits', () => {
  const el = withMetrics(50, 60);
  const { result } = renderHook(() => {
    const ref = useRef<HTMLDivElement>(el);
    return useIsClamped(ref, []);
  });
  expect(result.current).toBe(false);
});
