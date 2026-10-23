/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamWatchdogInterval, TeamWatchdogPrompt } from './watchdogTypes';

const WATCHDOG_INTERVAL_KEY_PREFIX = 'team-watchdog-interval-';
const WATCHDOG_PROMPT_KEY_PREFIX = 'team-watchdog-prompt-';

const VALID_INTERVALS = new Set<number>([0, 120_000, 300_000, 600_000]);

export function getWatchdogInterval(team_id: string): TeamWatchdogInterval {
  try {
    const raw = localStorage.getItem(`${WATCHDOG_INTERVAL_KEY_PREFIX}${team_id}`);
    if (raw) {
      const parsed = Number(raw);
      if (VALID_INTERVALS.has(parsed)) {
        return parsed as TeamWatchdogInterval;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return 0;
}

export function setWatchdogInterval(team_id: string, interval: TeamWatchdogInterval): void {
  try {
    localStorage.setItem(`${WATCHDOG_INTERVAL_KEY_PREFIX}${team_id}`, String(interval));
  } catch {
    // Ignore storage write errors
  }
}

export function getCachedLastPrompt(team_id: string): TeamWatchdogPrompt | null {
  try {
    const raw = sessionStorage.getItem(`${WATCHDOG_PROMPT_KEY_PREFIX}${team_id}`);
    if (raw) {
      return JSON.parse(raw) as TeamWatchdogPrompt;
    }
  } catch {
    // Ignore storage read errors
  }
  return null;
}

export function setCachedLastPrompt(team_id: string, prompt: TeamWatchdogPrompt | null): void {
  try {
    if (prompt) {
      const toStore: TeamWatchdogPrompt = {
        ...prompt,
        timestamp: prompt.timestamp ?? Date.now(),
      };
      sessionStorage.setItem(`${WATCHDOG_PROMPT_KEY_PREFIX}${team_id}`, JSON.stringify(toStore));
    } else {
      sessionStorage.removeItem(`${WATCHDOG_PROMPT_KEY_PREFIX}${team_id}`);
    }
  } catch {
    // Ignore storage write errors
  }
}
