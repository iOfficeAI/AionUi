import type { SlashCommandItem } from './types';

export interface CodexSlashCommandInput {
  enabledSkills?: string[];
  loadedSkills?: Array<{ name: string; description?: string }>;
}

const CODEX_NATIVE_COMMANDS: SlashCommandItem[] = [
  {
    name: 'compact',
    description: 'Compact the current Codex context',
    descriptionI18nKey: 'codex.slash.compactDescription',
    kind: 'template',
    source: 'codex',
    selectionBehavior: 'insert',
  },
  {
    name: 'goal',
    description: 'Set or inspect the current Codex goal',
    descriptionI18nKey: 'codex.slash.goalDescription',
    kind: 'template',
    source: 'codex',
    selectionBehavior: 'insert',
  },
];

const SLASH_COMMAND_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function normalizeSkillNames(enabledSkills: string[] | undefined): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const rawName of enabledSkills ?? []) {
    const name = rawName.trim();
    if (!name || !SLASH_COMMAND_NAME_RE.test(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function buildCodexSlashCommands(input: CodexSlashCommandInput): SlashCommandItem[] {
  const commands = CODEX_NATIVE_COMMANDS.map((command) => ({ ...command }));
  const seen = new Set(commands.map((command) => command.name));
  const descriptions = new Map((input.loadedSkills ?? []).map((skill) => [skill.name, skill.description?.trim()]));

  for (const name of normalizeSkillNames(input.enabledSkills)) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    commands.push({
      name,
      description: descriptions.get(name) || name,
      kind: 'template',
      source: 'skill',
      selectionBehavior: 'insert',
    });
  }

  return commands;
}
