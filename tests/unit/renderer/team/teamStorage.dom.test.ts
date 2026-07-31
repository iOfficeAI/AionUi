/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { pruneOrphanTeamStorage, TEAM_STORAGE_PREFIXES } from '@/renderer/pages/team/utils/teamStorage';

afterEach(() => localStorage.clear());

describe('pruneOrphanTeamStorage', () => {
  it('removes keys for teams not in the existing set, keeps others', () => {
    localStorage.setItem('team-view-mode-alive', 'board');
    localStorage.setItem('team-activity-controls-alive', '{}');
    localStorage.setItem('team-view-mode-dead', 'single');
    localStorage.setItem('team-member-colors-dead', '{}');
    localStorage.setItem('unrelated-key', 'x');

    pruneOrphanTeamStorage(['alive']);

    expect(localStorage.getItem('team-view-mode-alive')).toBe('board');
    expect(localStorage.getItem('team-activity-controls-alive')).toBe('{}');
    expect(localStorage.getItem('team-view-mode-dead')).toBeNull();
    expect(localStorage.getItem('team-member-colors-dead')).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('x');
  });

  it('covers all known per-team prefixes', () => {
    expect(TEAM_STORAGE_PREFIXES).toContain('team-activity-controls-');
    expect(TEAM_STORAGE_PREFIXES).toContain('team-view-mode-');
    expect(TEAM_STORAGE_PREFIXES).toContain('team-member-colors-');
    expect(TEAM_STORAGE_PREFIXES).toContain('team-active-slot-');
    expect(TEAM_STORAGE_PREFIXES).toContain('team-assistant-order-');
    expect(TEAM_STORAGE_PREFIXES).toContain('team-pending-permissions-');
  });
});
