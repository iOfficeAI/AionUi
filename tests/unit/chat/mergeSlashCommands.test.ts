/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildGuidSlashCommands } from '@/common/chat/slash/guidSlashCommands';
import { buildSkillSlashCommands, mergeSlashCommands } from '@/common/chat/slash/mergeSlashCommands';
import type { SlashCommandItem } from '@/common/chat/slash/types';

const builtin = (name: string): SlashCommandItem => ({
  name,
  description: `builtin ${name}`,
  kind: 'builtin',
  source: 'builtin',
});
const acp = (name: string): SlashCommandItem => ({ name, description: `acp ${name}`, kind: 'template', source: 'acp' });

describe('buildSkillSlashCommands', () => {
  it('returns nothing when no skills are loaded', () => {
    expect(buildSkillSlashCommands(undefined, new Map(), 'Skill')).toEqual([]);
    expect(buildSkillSlashCommands([], new Map(), 'Skill')).toEqual([]);
  });

  it('maps each loaded skill to an insert-style template command', () => {
    const commands = buildSkillSlashCommands(['cron', 'officecli'], new Map([['cron', 'Scheduled tasks']]), 'Skill');

    expect(commands).toEqual([
      { name: 'cron', description: 'Scheduled tasks', kind: 'template', source: 'skill', selectionBehavior: 'insert' },
      // No indexed description → falls back to the provided label.
      { name: 'officecli', description: 'Skill', kind: 'template', source: 'skill', selectionBehavior: 'insert' },
    ]);
  });
});

describe('mergeSlashCommands', () => {
  it('keeps priority builtin > acp > skills on name collisions', () => {
    const skills = buildSkillSlashCommands(['copy', 'cron'], new Map(), 'Skill');
    const merged = mergeSlashCommands([builtin('copy')], [acp('copy'), acp('review')], skills);

    // `copy` exists in all three groups; builtin wins.
    expect(merged.find((c) => c.name === 'copy')?.source).toBe('builtin');
    // ACP-only command survives.
    expect(merged.find((c) => c.name === 'review')?.source).toBe('acp');
    // Skill-only command is appended.
    expect(merged.find((c) => c.name === 'cron')?.source).toBe('skill');
    // No duplicates.
    expect(merged.map((c) => c.name)).toEqual(['copy', 'review', 'cron']);
  });

  it('surfaces session skills when there are no other commands', () => {
    const skills = buildSkillSlashCommands(['cron'], new Map([['cron', 'Scheduled tasks']]), 'Skill');
    const merged = mergeSlashCommands([], [], skills);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'cron', source: 'skill', selectionBehavior: 'insert' });
  });
});

describe('buildGuidSlashCommands', () => {
  it('uses agent metadata commands before selected skill fallbacks', () => {
    const commands = buildGuidSlashCommands({
      builtinCommands: [builtin('open')],
      agentCommands: [acp('review'), acp('cron')],
      selectedSkills: ['cron', 'officecli'],
      descriptionByName: new Map([
        ['cron', 'Scheduled tasks'],
        ['officecli', 'Office automation'],
      ]),
      skillFallbackDescription: 'Skill',
    });

    expect(commands.map((command) => `${command.source}:${command.name}`)).toEqual([
      'builtin:open',
      'acp:review',
      'acp:cron',
    ]);
  });

  it('falls back to selected skills when agent metadata has no commands', () => {
    const commands = buildGuidSlashCommands({
      builtinCommands: [builtin('open')],
      agentCommands: [],
      selectedSkills: ['cron'],
      descriptionByName: new Map([['cron', 'Scheduled tasks']]),
      skillFallbackDescription: 'Skill',
    });

    expect(commands.map((command) => `${command.source}:${command.name}`)).toEqual(['builtin:open', 'skill:cron']);
  });
});
