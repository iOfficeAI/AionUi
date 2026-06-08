/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type SideState = 'none' | 'empty' | 'active' | 'collapsed' | 'promoted' | 'discarded';
export type SideEvent = 'open' | 'turn' | 'collapse' | 'promote' | 'discard';

const TRANSITIONS: Record<SideState, Partial<Record<SideEvent, SideState>>> = {
  none: { open: 'empty' },
  empty: { turn: 'active', collapse: 'collapsed', discard: 'discarded' },
  active: { collapse: 'collapsed', promote: 'promoted', discard: 'discarded' },
  collapsed: { open: 'active', promote: 'promoted', discard: 'discarded' },
  promoted: {},
  discarded: {},
};

export function nextSideState(state: SideState, event: SideEvent): SideState {
  return TRANSITIONS[state][event] ?? state;
}
