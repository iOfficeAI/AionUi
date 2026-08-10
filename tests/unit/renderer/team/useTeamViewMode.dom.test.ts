/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { useTeamViewMode } from '@/renderer/pages/team/hooks/useTeamViewMode';

beforeEach(() => localStorage.clear());

test('migrates legacy "flow" stored value to "board"', () => {
  localStorage.setItem('team-view-mode-t1', 'flow');
  const { result } = renderHook(() => useTeamViewMode('t1'));
  expect(result.current[0]).toBe('board');
});

test('persists board selection', () => {
  const { result } = renderHook(() => useTeamViewMode('t1'));
  act(() => result.current[1]('board'));
  expect(localStorage.getItem('team-view-mode-t1')).toBe('board');
});
