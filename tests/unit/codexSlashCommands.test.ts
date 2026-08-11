import { describe, expect, it } from 'vitest';
import { buildCodexSlashCommands } from '@/common/chat/slash/codexCommands';

describe('buildCodexSlashCommands', () => {
  it('returns Codex native commands as insert-only slash commands', () => {
    const commands = buildCodexSlashCommands({});

    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'compact',
          kind: 'template',
          source: 'codex',
          selectionBehavior: 'insert',
          descriptionI18nKey: 'codex.slash.compactDescription',
        }),
        expect.objectContaining({
          name: 'goal',
          kind: 'template',
          source: 'codex',
          selectionBehavior: 'insert',
          descriptionI18nKey: 'codex.slash.goalDescription',
        }),
      ])
    );
  });

  it('adds enabled skills without duplicating native command names', () => {
    const commands = buildCodexSlashCommands({
      enabledSkills: ['officecli-docx', 'compact', '', 'story_roleplay'],
      loadedSkills: [{ name: 'officecli-docx', description: 'Work with Word documents' }],
    });

    expect(commands.filter((command) => command.name === 'compact')).toHaveLength(1);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'officecli-docx',
          description: 'Work with Word documents',
          source: 'skill',
          selectionBehavior: 'insert',
        }),
        expect.objectContaining({
          name: 'story_roleplay',
          description: 'story_roleplay',
          source: 'skill',
          selectionBehavior: 'insert',
        }),
      ])
    );
  });
});
