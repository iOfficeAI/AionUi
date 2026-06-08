/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { deriveAcpPillState } from '@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall';

describe('deriveAcpPillState', () => {
  describe('execute kind (exit-code driven)', () => {
    it('returns success when kind=execute and exitCode=0', () => {
      expect(deriveAcpPillState('completed', 0, 'execute')).toBe('success');
    });

    it('returns failed when kind=execute and exitCode=1', () => {
      expect(deriveAcpPillState('completed', 1, 'execute')).toBe('failed');
    });

    it('returns failed when kind=execute and exitCode is non-zero (e.g. 127)', () => {
      expect(deriveAcpPillState('in_progress', 127, 'execute')).toBe('failed');
    });

    it('falls back to status mapping when kind=execute but exitCode is undefined', () => {
      expect(deriveAcpPillState('completed', undefined, 'execute')).toBe('success');
      expect(deriveAcpPillState('in_progress', undefined, 'execute')).toBe('running');
      expect(deriveAcpPillState('failed', undefined, 'execute')).toBe('failed');
    });

    it('falls back to status mapping when kind=execute but status is missing', () => {
      expect(deriveAcpPillState(undefined, undefined, 'execute')).toBe('queued');
    });
  });

  describe('non-execute kind (status-driven)', () => {
    it('returns success for status=completed regardless of kind', () => {
      expect(deriveAcpPillState('completed', undefined, 'edit')).toBe('success');
      expect(deriveAcpPillState('completed', undefined, 'read')).toBe('success');
      expect(deriveAcpPillState('completed', undefined, 'unknown')).toBe('success');
    });

    it('returns failed for status=failed regardless of kind', () => {
      expect(deriveAcpPillState('failed', undefined, 'edit')).toBe('failed');
      expect(deriveAcpPillState('failed', undefined, 'read')).toBe('failed');
      expect(deriveAcpPillState('failed', undefined, 'unknown')).toBe('failed');
    });

    it('returns running for status=in_progress', () => {
      expect(deriveAcpPillState('in_progress', undefined, 'edit')).toBe('running');
      expect(deriveAcpPillState('in_progress', undefined, 'read')).toBe('running');
    });

    it('returns queued for status=pending', () => {
      expect(deriveAcpPillState('pending', undefined, 'edit')).toBe('queued');
      expect(deriveAcpPillState('pending', undefined, 'read')).toBe('queued');
    });

    it('returns queued when status is undefined', () => {
      expect(deriveAcpPillState(undefined, undefined, 'edit')).toBe('queued');
      expect(deriveAcpPillState(undefined, undefined, 'read')).toBe('queued');
    });
  });

  describe('precedence', () => {
    it('ignores a non-execute exitCode and uses status', () => {
      // exitCode is bash-specific; for non-execute kinds, status wins.
      expect(deriveAcpPillState('completed', 0, 'edit')).toBe('success');
      expect(deriveAcpPillState('in_progress', 1, 'read')).toBe('running');
    });
  });
});
