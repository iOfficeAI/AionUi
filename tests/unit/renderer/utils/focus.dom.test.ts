/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('focus utils', () => {
  let blurActiveElement: () => void;
  let blockMobileInputFocus: (durationMs?: number) => void;
  let shouldBlockMobileInputFocus: () => boolean;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Reimport to reset module state
    const module = await import('@/renderer/utils/ui/focus');
    blurActiveElement = module.blurActiveElement;
    blockMobileInputFocus = module.blockMobileInputFocus;
    shouldBlockMobileInputFocus = module.shouldBlockMobileInputFocus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('blurActiveElement', () => {
    it('blurs the active element', () => {
      const mockBlur = vi.fn();
      const mockElement = { blur: mockBlur } as unknown as HTMLElement;
      Object.defineProperty(document, 'activeElement', {
        value: mockElement,
        configurable: true,
      });

      blurActiveElement();

      expect(mockBlur).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'activeElement', {
        value: document.body,
        configurable: true,
      });
    });

    it('does nothing when no active element', () => {
      Object.defineProperty(document, 'activeElement', {
        value: null,
        configurable: true,
      });

      expect(() => blurActiveElement()).not.toThrow();

      Object.defineProperty(document, 'activeElement', {
        value: document.body,
        configurable: true,
      });
    });

    it('does nothing when active element has no blur method', () => {
      const mockElement = {} as HTMLElement;
      Object.defineProperty(document, 'activeElement', {
        value: mockElement,
        configurable: true,
      });

      expect(() => blurActiveElement()).not.toThrow();

      Object.defineProperty(document, 'activeElement', {
        value: document.body,
        configurable: true,
      });
    });
  });

  describe('blockMobileInputFocus and shouldBlockMobileInputFocus', () => {
    it('blocks focus for specified duration', () => {
      blockMobileInputFocus(1000);
      expect(shouldBlockMobileInputFocus()).toBe(true);

      vi.advanceTimersByTime(500);
      expect(shouldBlockMobileInputFocus()).toBe(true);

      vi.advanceTimersByTime(500);
      expect(shouldBlockMobileInputFocus()).toBe(false);
    });

    it('uses default duration of 700ms when not specified', () => {
      blockMobileInputFocus();
      expect(shouldBlockMobileInputFocus()).toBe(true);

      vi.advanceTimersByTime(699);
      expect(shouldBlockMobileInputFocus()).toBe(true);

      vi.advanceTimersByTime(1);
      expect(shouldBlockMobileInputFocus()).toBe(false);
    });

    it('handles negative duration as 0', () => {
      blockMobileInputFocus(-100);
      expect(shouldBlockMobileInputFocus()).toBe(false);
    });

    it('handles zero duration', () => {
      blockMobileInputFocus(0);
      expect(shouldBlockMobileInputFocus()).toBe(false);
    });

    it('allows multiple blocks to update the duration', () => {
      blockMobileInputFocus(1000);
      vi.advanceTimersByTime(500);
      expect(shouldBlockMobileInputFocus()).toBe(true);

      blockMobileInputFocus(1000);
      vi.advanceTimersByTime(500);
      expect(shouldBlockMobileInputFocus()).toBe(true);

      vi.advanceTimersByTime(500);
      expect(shouldBlockMobileInputFocus()).toBe(false);
    });

    it('does not block after timeout expires', () => {
      blockMobileInputFocus(100);
      vi.advanceTimersByTime(100);
      expect(shouldBlockMobileInputFocus()).toBe(false);
    });
  });
});
