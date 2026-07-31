import { describe, expect, it } from 'vitest';
import {
  classifySkill,
  createSkillGroup,
  filterAndSortSkills,
  parseSkillOrganization,
} from '@/renderer/pages/settings/SkillsSettings/skillOrganization';

describe('skill organization', () => {
  it('sorts matched skills alphabetically, regardless of source order', () => {
    const skills = filterAndSortSkills(
      [
        { name: 'zebra', description: 'Security analysis' },
        { name: 'Alpha', description: 'Implementation helper' },
        { name: 'beta', description: 'Planning assistant' },
      ],
      ''
    );

    expect(skills.map((skill) => skill.name)).toEqual(['Alpha', 'beta', 'zebra']);
  });

  it('matches text search and type filters together', () => {
    const skills = filterAndSortSkills(
      [
        { name: 'auth-audit', description: 'Security review for authentication' },
        { name: 'security-plan', description: 'Create a security plan' },
      ],
      'audit',
      'security'
    );

    expect(skills.map((skill) => skill.name)).toEqual(['auth-audit']);
  });

  it('retains only valid, unique group assignments from persisted data', () => {
    expect(
      parseSkillOrganization({
        groups: [
          { id: 'focus', name: 'Focus', skillNames: ['alpha', 'alpha', 'beta'] },
          { id: '', name: 'Ignored', skillNames: ['alpha'] },
        ],
      })
    ).toEqual({ groups: [{ id: 'focus', name: 'Focus', skillNames: ['alpha', 'beta'] }] });
  });

  it('creates normalized user groups without assignments', () => {
    expect(createSkillGroup('  Security reviews  ', 'group-1')).toEqual({
      id: 'group-1',
      name: 'Security reviews',
      skillNames: [],
    });
  });

  it('classifies productivity and planning skills from their metadata', () => {
    expect(classifySkill({ name: 'office-docs', description: 'Create and edit Office documents' })).toBe(
      'productivity'
    );
    expect(classifySkill({ name: 'architecture', description: 'Plan a software architecture' })).toBe('planning');
  });
});
