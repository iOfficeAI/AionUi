/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';

describe('useAgentModesForBackend', () => {
  it('uses static backend modes without reading /api/agents data', () => {
    const { result } = renderHook(() => useAgentModesForBackend('codex'));

    expect(result.current).toEqual([
      { value: 'read-only', label: 'Read Only' },
      { value: 'auto', label: 'Default' },
      { value: 'full-access', label: 'Full Access' },
    ]);
  });

  it('falls back to static modes when handshake data is unavailable', () => {
    const { result } = renderHook(() => useAgentModesForBackend('codex'));

    expect(result.current.map((mode) => mode.value)).toEqual(['read-only', 'auto', 'full-access']);
  });
});
