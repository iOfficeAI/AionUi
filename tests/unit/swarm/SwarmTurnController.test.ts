/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SwarmTurnController } from '../../../src/agent/swarm/SwarmTurnController';

describe('SwarmTurnController', () => {
  test('round-robin alternates between agents', () => {
    const controller = new SwarmTurnController('round-robin', ['navigator', 'driver'], 10);
    expect(controller.next()).toBe('navigator');
    expect(controller.next()).toBe('driver');
    expect(controller.next()).toBe('navigator');
    expect(controller.next()).toBe('driver');
  });

  test('isExhausted returns true after maxTurns', () => {
    const controller = new SwarmTurnController('round-robin', ['navigator', 'driver'], 3);
    controller.next(); // turn 1
    controller.next(); // turn 2
    controller.next(); // turn 3
    expect(controller.isExhausted()).toBe(true);
  });

  test('isExhausted returns false before maxTurns', () => {
    const controller = new SwarmTurnController('round-robin', ['navigator', 'driver'], 10);
    controller.next();
    expect(controller.isExhausted()).toBe(false);
  });

  test('getTurnCount tracks total turns', () => {
    const controller = new SwarmTurnController('round-robin', ['a', 'b'], 100);
    expect(controller.getTurnCount()).toBe(0);
    controller.next();
    controller.next();
    expect(controller.getTurnCount()).toBe(2);
  });

  test('getStrategy returns the strategy', () => {
    const controller = new SwarmTurnController('round-robin', ['a', 'b'], 10);
    expect(controller.getStrategy()).toBe('round-robin');
  });

  test('wraps around agent list correctly', () => {
    const controller = new SwarmTurnController('round-robin', ['a', 'b', 'c'], 10);
    expect(controller.next()).toBe('a');
    expect(controller.next()).toBe('b');
    expect(controller.next()).toBe('c');
    expect(controller.next()).toBe('a'); // wraps around
    expect(controller.next()).toBe('b');
  });
});
