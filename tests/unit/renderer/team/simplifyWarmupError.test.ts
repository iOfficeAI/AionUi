/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { simplifyWarmupError } from '@/renderer/pages/team/components/TeamWarmupOverlay';

describe('simplifyWarmupError', () => {
  it('strips the rebuild noise and generic wrapper prefixes', () => {
    const raw =
      "Invalid request: failed to warm up rebuilt agent 019f459c-1f5c-7652-b996-33782c32418e: Invalid request: Bad request: Provider 'aionrs' not found";
    expect(simplifyWarmupError(raw)).toBe("Provider 'aionrs' not found");
  });

  it('keeps a plain error untouched', () => {
    expect(simplifyWarmupError('ACP error')).toBe('ACP error');
  });

  it('passes through undefined', () => {
    expect(simplifyWarmupError(undefined)).toBeUndefined();
  });

  it('falls back to the original text when stripping empties it out', () => {
    expect(simplifyWarmupError('Invalid request:')).toBe('Invalid request:');
  });
});
