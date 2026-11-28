/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetStateMachine } from '@/process/pet/petStateMachine';

describe('PetStateMachine user-interaction preemption', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a click reaction immediately instead of queueing it behind min-display', () => {
    const machine = new PetStateMachine();
    const states: string[] = [];
    machine.onStateChange((state) => states.push(state));

    // 'done' has MIN_DISPLAY_MS 3500 — a normal state would be queued, but a
    // click reaction (poke) must preempt it the moment it is requested.
    machine.requestState('done');
    const accepted = machine.requestState('poke-left');

    expect(accepted).toBe('poke-left');
    expect(machine.getCurrentState()).toBe('poke-left');
    expect(states).toEqual(['done', 'poke-left']);
    machine.dispose();
  });

  it('preempts states that used to outrank clicks (notification, sweeping, error)', () => {
    const machine = new PetStateMachine();

    // notification (priority 7) and sweeping (priority 6) previously rejected
    // clicks outright (poke is priority 2); interactions now always win.
    machine.forceState('notification');
    expect(machine.requestState('poke-right')).toBe('poke-right');
    expect(machine.getCurrentState()).toBe('poke-right');

    machine.forceState('sweeping');
    expect(machine.requestState('attention')).toBe('attention');
    expect(machine.getCurrentState()).toBe('attention');

    machine.dispose();
  });

  it('re-fires listeners when the same interaction state is requested again so the reaction replays', () => {
    const machine = new PetStateMachine();
    const states: string[] = [];
    machine.onStateChange((state) => states.push(state));

    machine.requestState('poke-left');
    machine.requestState('poke-left');

    expect(states).toEqual(['poke-left', 'poke-left']);
    machine.dispose();
  });

  it('never interrupts an active drag', () => {
    const machine = new PetStateMachine();
    const states: string[] = [];
    machine.onStateChange((state) => states.push(state));

    machine.forceState('dragging');
    const accepted = machine.requestState('attention');

    expect(accepted).toBeNull();
    expect(machine.getCurrentState()).toBe('dragging');
    expect(states).toEqual(['dragging']);
    machine.dispose();
  });

  it('still respects do-not-disturb for interaction states', () => {
    const machine = new PetStateMachine();
    machine.setDnd(true);

    expect(machine.requestState('poke-left')).toBeNull();
    expect(machine.requestState('juggling')).toBeNull();
    expect(machine.requestState('dragging')).toBe('dragging');
    machine.dispose();
  });

  it('keeps ordinary (non-interaction) queueing behaviour intact', () => {
    const machine = new PetStateMachine();
    const states: string[] = [];
    machine.onStateChange((state) => states.push(state));

    machine.requestState('thinking');
    // 'waking' has the same priority as 'thinking' and is NOT a user
    // interaction → queued behind MIN_DISPLAY_MS, applied once it elapses.
    expect(machine.requestState('waking')).toBeNull();
    expect(machine.getCurrentState()).toBe('thinking');

    vi.advanceTimersByTime(1000);
    expect(machine.getCurrentState()).toBe('waking');
    expect(states).toEqual(['thinking', 'waking']);
    machine.dispose();
  });
});
