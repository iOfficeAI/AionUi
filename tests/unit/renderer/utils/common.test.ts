/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { removeStack, ToolConfirmationOutcome } from '@/renderer/utils/common';

describe('common utils', () => {
  describe('removeStack', () => {
    it('returns a function that calls cleanup functions in reverse order', () => {
      const order: number[] = [];
      const cleanup1 = vi.fn(() => order.push(1));
      const cleanup2 = vi.fn(() => order.push(2));
      const cleanup3 = vi.fn(() => order.push(3));

      const cleanupAll = removeStack(cleanup1, cleanup2, cleanup3);
      cleanupAll();

      expect(order).toEqual([3, 2, 1]);
      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup3).toHaveBeenCalledTimes(1);
    });

    it('calls each cleanup function once', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      const cleanupAll = removeStack(cleanup1, cleanup2);
      cleanupAll();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('handles single cleanup function', () => {
      const cleanup = vi.fn();

      const cleanupAll = removeStack(cleanup);
      cleanupAll();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('handles empty stack', () => {
      const cleanupAll = removeStack();
      expect(() => cleanupAll()).not.toThrow();
    });

    it('can be called multiple times', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      const cleanupAll = removeStack(cleanup1, cleanup2);
      cleanupAll();
      cleanupAll();

      expect(cleanup1).toHaveBeenCalledTimes(2);
      expect(cleanup2).toHaveBeenCalledTimes(2);
    });

    it('does not throw if a cleanup function throws', () => {
      const cleanup1 = vi.fn(() => {
        throw new Error('cleanup1 error');
      });
      const cleanup2 = vi.fn();

      const cleanupAll = removeStack(cleanup1, cleanup2);

      expect(() => cleanupAll()).toThrow('cleanup1 error');
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(cleanup1).toHaveBeenCalledTimes(1);
    });
  });

  describe('ToolConfirmationOutcome', () => {
    it('defines expected enum values', () => {
      expect(ToolConfirmationOutcome.ProceedOnce).toBe('proceed_once');
      expect(ToolConfirmationOutcome.ProceedAlways).toBe('proceed_always');
      expect(ToolConfirmationOutcome.ProceedAlwaysServer).toBe('proceed_always_server');
      expect(ToolConfirmationOutcome.ProceedAlwaysTool).toBe('proceed_always_tool');
      expect(ToolConfirmationOutcome.ModifyWithEditor).toBe('modify_with_editor');
      expect(ToolConfirmationOutcome.Cancel).toBe('cancel');
    });

    it('has all expected enum keys', () => {
      const keys = Object.keys(ToolConfirmationOutcome);
      expect(keys).toContain('ProceedOnce');
      expect(keys).toContain('ProceedAlways');
      expect(keys).toContain('ProceedAlwaysServer');
      expect(keys).toContain('ProceedAlwaysTool');
      expect(keys).toContain('ModifyWithEditor');
      expect(keys).toContain('Cancel');
    });
  });
});
