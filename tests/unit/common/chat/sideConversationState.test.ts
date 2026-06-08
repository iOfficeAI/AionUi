/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { nextSideState, type SideState } from '@/common/chat/sideConversationState';

describe('nextSideState', () => {
  it('open from none → empty', () => {
    expect(nextSideState('none', 'open')).toBe<SideState>('empty');
  });
  it('first turn: empty → active', () => {
    expect(nextSideState('empty', 'turn')).toBe<SideState>('active');
  });
  it('collapse keeps thread alive', () => {
    expect(nextSideState('active', 'collapse')).toBe<SideState>('collapsed');
  });
  it('reopen from collapsed → active', () => {
    expect(nextSideState('collapsed', 'open')).toBe<SideState>('active');
  });
  it('promote → promoted (terminal)', () => {
    expect(nextSideState('active', 'promote')).toBe<SideState>('promoted');
  });
  it('discard → discarded (terminal)', () => {
    expect(nextSideState('collapsed', 'discard')).toBe<SideState>('discarded');
  });
});
