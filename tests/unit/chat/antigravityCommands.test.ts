/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  expandAntigravitySlashCommand,
  formatAntigravityPrompt,
  getAntigravitySlashCommands,
  isAntigravitySlashCommand,
  isTeamworkSlashCommand,
  extractTeamworkTask,
} from '@/common/chat/slash/antigravityCommands';

describe('antigravityCommands', () => {
  const fakeT = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;

  describe('getAntigravitySlashCommands', () => {
    it('returns all Antigravity slash commands with expected metadata', () => {
      const commands = getAntigravitySlashCommands(fakeT);
      const names = commands.map((c) => c.name);

      expect(names).toEqual([
        'goal',
        'teamwork',
        'teamwork-preview',
        'plan',
        'grill-me',
        'boost',
        'browser',
        'schedule',
        'learn',
      ]);

      commands.forEach((c) => {
        expect(c.kind).toBe('template');
        expect(c.source).toBe('builtin');
        expect(c.hint).toBe('Antigravity');
        expect(c.selectionBehavior).toBe('insert');
        expect(c.description).toBeTruthy();
      });
    });
  });

  describe('isAntigravitySlashCommand', () => {
    it('identifies valid Antigravity commands case-insensitively', () => {
      expect(isAntigravitySlashCommand('goal')).toBe(true);
      expect(isAntigravitySlashCommand('GOAL')).toBe(true);
      expect(isAntigravitySlashCommand('teamwork')).toBe(true);
      expect(isAntigravitySlashCommand('teamwork-preview')).toBe(true);
      expect(isAntigravitySlashCommand('Plan')).toBe(true);
      expect(isAntigravitySlashCommand('grill-me')).toBe(true);
      expect(isAntigravitySlashCommand('boost')).toBe(true);
      expect(isAntigravitySlashCommand('browser')).toBe(true);
      expect(isAntigravitySlashCommand('schedule')).toBe(true);
      expect(isAntigravitySlashCommand('learn')).toBe(true);
    });

    it('rejects non-Antigravity commands', () => {
      expect(isAntigravitySlashCommand('open')).toBe(false);
      expect(isAntigravitySlashCommand('copy')).toBe(false);
      expect(isAntigravitySlashCommand('btw')).toBe(false);
      expect(isAntigravitySlashCommand('random')).toBe(false);
    });
  });

  describe('expandAntigravitySlashCommand', () => {
    it('expands /goal with prompt instructions and completion tokens', () => {
      const expanded = expandAntigravitySlashCommand('/goal Fix memory leak in background worker');
      expect(expanded).toContain('[Antigravity /goal Mode]');
      expect(expanded).toContain('Goal: Fix memory leak in background worker');
      expect(expanded).toContain('<!-- GOAL_COMPLETE -->');
      expect(expanded).toContain('<!-- GOAL_CANCELLED -->');
    });

    it('expands /teamwork-preview with multi-agent workflow directives', () => {
      const expanded = expandAntigravitySlashCommand('/teamwork-preview Build customer analytics dashboard');
      expect(expanded).toContain('[Antigravity /teamwork-preview Mode]');
      expect(expanded).toContain('Project: Build customer analytics dashboard');
      expect(expanded).toContain('Phase 1 (Scoping & Verification)');
      expect(expanded).toContain('Phase 2 (Delegation & Execution)');
    });

    it('expands /plan with structured planning directives', () => {
      const expanded = expandAntigravitySlashCommand('/plan Refactor authentication service');
      expect(expanded).toContain('[Antigravity /plan Mode]');
      expect(expanded).toContain('Task: Refactor authentication service');
      expect(expanded).toContain('step-by-step implementation plan');
    });

    it('expands /grill-me with interview directives', () => {
      const expanded = expandAntigravitySlashCommand('/grill-me SQLite schema migration strategy');
      expect(expanded).toContain('[Antigravity /grill-me Mode]');
      expect(expanded).toContain('Topic: SQLite schema migration strategy');
      expect(expanded).toContain('interactive interview');
    });

    it('expands /boost with deep thinking directives', () => {
      const expanded = expandAntigravitySlashCommand('/boost Optimize AST traversal performance');
      expect(expanded).toContain('[Antigravity /boost Mode]');
      expect(expanded).toContain('Task: Optimize AST traversal performance');
      expect(expanded).toContain('deep strategic thinking');
    });

    it('expands /browser with web lookup directives', () => {
      const expanded = expandAntigravitySlashCommand('/browser Electron 37 window title bar overlay');
      expect(expanded).toContain('[Antigravity /browser Mode]');
      expect(expanded).toContain('Query: Electron 37 window title bar overlay');
      expect(expanded).toContain('web browsing, documentation lookup');
    });

    it('expands /schedule with cron/timer directives', () => {
      const expanded = expandAntigravitySlashCommand('/schedule Ping healthcheck endpoint every 5 minutes');
      expect(expanded).toContain('[Antigravity /schedule Mode]');
      expect(expanded).toContain('Instruction: Ping healthcheck endpoint every 5 minutes');
      expect(expanded).toContain('recurring cron schedule');
    });

    it('expands /learn with convention persistence directives', () => {
      const expanded = expandAntigravitySlashCommand('/learn Always prefer UnoCSS over inline styles');
      expect(expanded).toContain('[Antigravity /learn Mode]');
      expect(expanded).toContain('Instruction: Always prefer UnoCSS over inline styles');
      expect(expanded).toContain('persist key learnings');
    });

    it('provides helpful fallback text when command has no payload', () => {
      const expanded = expandAntigravitySlashCommand('/goal');
      expect(expanded).toContain('[Antigravity /goal Mode]');
      expect(expanded).toContain('(No details provided - please clarify your goal)');
    });

    it('leaves non-Antigravity commands and regular text untouched', () => {
      expect(expandAntigravitySlashCommand('/open myfile.txt')).toBe('/open myfile.txt');
      expect(expandAntigravitySlashCommand('/copy')).toBe('/copy');
      expect(expandAntigravitySlashCommand('Hello world')).toBe('Hello world');
      expect(expandAntigravitySlashCommand('/unknown test')).toBe('/unknown test');
    });
  });

  describe('formatAntigravityPrompt', () => {
    it('formats each command directly', () => {
      const goal = formatAntigravityPrompt('goal', 'Run tests');
      expect(goal).toContain('Goal: Run tests');
    });
  });

  describe('isTeamworkSlashCommand and extractTeamworkTask', () => {
    it('identifies /teamwork and /teamwork-preview commands', () => {
      expect(isTeamworkSlashCommand('/teamwork Build feature')).toBe(true);
      expect(isTeamworkSlashCommand('/teamwork-preview Refactor system')).toBe(true);
      expect(isTeamworkSlashCommand('   /teamwork    ')).toBe(true);
      expect(isTeamworkSlashCommand('/goal test')).toBe(false);
      expect(isTeamworkSlashCommand('regular message')).toBe(false);
    });

    it('extracts task payload cleanly from teamwork command', () => {
      expect(extractTeamworkTask('/teamwork Build multi-agent workflow')).toBe('Build multi-agent workflow');
      expect(extractTeamworkTask('/teamwork-preview   Analyze AST   ')).toBe('Analyze AST');
      expect(extractTeamworkTask('/teamwork')).toBe('');
      expect(extractTeamworkTask('No slash command')).toBe('No slash command');
    });
  });
});
