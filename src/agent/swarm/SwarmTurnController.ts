/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TurnStrategy } from './types';

/**
 * Controls turn-taking between swarm agents.
 */
export class SwarmTurnController {
  private strategy: TurnStrategy;
  private agentOrder: string[];
  private currentIndex: number = 0;
  private turnCount: number = 0;
  private maxTurns: number;

  constructor(strategy: TurnStrategy, agents: string[], maxTurns: number) {
    this.strategy = strategy;
    this.agentOrder = agents;
    this.maxTurns = maxTurns;
  }

  /** Get the next agent role that should act */
  next(): string {
    const role = this.agentOrder[this.currentIndex % this.agentOrder.length];
    this.currentIndex++;
    this.turnCount++;
    return role;
  }

  /** Check if max turns reached */
  isExhausted(): boolean {
    return this.turnCount >= this.maxTurns;
  }

  /** Get turn count */
  getTurnCount(): number {
    return this.turnCount;
  }

  /** Get strategy */
  getStrategy(): TurnStrategy {
    return this.strategy;
  }
}
