/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TTeam } from '@/common/types/team/teamTypes';
import { emitter } from '@/renderer/utils/emitter';
import {
  appendTeamMemory,
  clearTeamMemory,
  distillTeamSkills,
  extractSkillsHeuristic,
  formatMemoryForPrompt,
  getAgentMemory,
  getTeamMemory,
  injectRetainedSkillsIntoPrompt,
  isTaskMemoryInjected,
  markTaskMemoryInjected,
  parseDistillationOutput,
  removeTeamDirective,
  removeTeamSkill,
  resetTaskMemoryInjected,
  resetTeamForNewTask,
  saveAgentMemory,
  saveTeamMemory,
} from '@/renderer/pages/team/utils/teamMemoryManager';

const loadAllConversationMessagesPagedMock = vi.fn();
vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  loadAllConversationMessagesPaged: (...args: unknown[]) => loadAllConversationMessagesPagedMock(...args),
}));

const askSideQuestionMock = vi.fn();
const cancelRunMock = vi.fn();
const resetAgentContextMock = vi.fn();
const resetConversationMock = vi.fn();
const readAssistantRuleMock = vi.fn();
const writeAssistantRuleMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      askSideQuestion: { invoke: (...args: unknown[]) => askSideQuestionMock(...args) },
      reset: { invoke: (...args: unknown[]) => resetConversationMock(...args) },
    },
    team: {
      cancelRun: { invoke: (...args: unknown[]) => cancelRunMock(...args) },
      resetAgentContext: { invoke: (...args: unknown[]) => resetAgentContextMock(...args) },
    },
    fs: {
      readAssistantRule: { invoke: (...args: unknown[]) => readAssistantRuleMock(...args) },
      writeAssistantRule: { invoke: (...args: unknown[]) => writeAssistantRuleMock(...args) },
    },
  },
  uuid: () => 'mock-uuid-1',
}));

describe('teamMemoryManager', () => {
  const teamId = 'test-team-123';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    askSideQuestionMock.mockResolvedValue({ status: 'ok', answer: '' });
    cancelRunMock.mockResolvedValue({ status: 'ok' });
    resetAgentContextMock.mockResolvedValue({ status: 'ok' });
    resetConversationMock.mockResolvedValue({ status: 'ok' });
    readAssistantRuleMock.mockResolvedValue('');
    writeAssistantRuleMock.mockResolvedValue({ status: 'ok' });
    loadAllConversationMessagesPagedMock.mockResolvedValue([]);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Storage CRUD', () => {
    it('returns empty memory when nothing stored', () => {
      const memory = getTeamMemory(teamId);
      expect(memory).toEqual({
        teamId,
        skills: [],
        systemDirectives: [],
      });
    });

    it('returns empty memory for invalid or empty teamId', () => {
      expect(getTeamMemory('')).toEqual({
        teamId: '',
        skills: [],
        systemDirectives: [],
      });
    });

    it('persists and retrieves team memory', () => {
      saveTeamMemory(teamId, {
        teamId,
        skills: [{ id: 's1', title: 'React Hooks', description: 'Always memoize callbacks', extractedAt: 1000 }],
        systemDirectives: ['Do not use any'],
      });

      const memory = getTeamMemory(teamId);
      expect(memory.skills).toHaveLength(1);
      expect(memory.skills[0].title).toBe('React Hooks');
      expect(memory.systemDirectives).toEqual(['Do not use any']);
    });

    it('appends new skills and directives without duplicating existing titles or directives', () => {
      saveTeamMemory(teamId, {
        teamId,
        skills: [{ id: 's1', title: 'Vitest setup', description: 'Use dom.test.ts', extractedAt: 1000 }],
        systemDirectives: ['Rule 1'],
      });

      const updated = appendTeamMemory(
        teamId,
        [
          { title: 'vitest setup', description: 'Duplicate casing should be ignored' },
          { title: 'New Skill', description: 'Use proper types' },
        ],
        ['rule 1', 'Rule 2']
      );

      expect(updated.skills).toHaveLength(2);
      expect(updated.skills[0].title).toBe('Vitest setup');
      expect(updated.skills[1].title).toBe('New Skill');
      expect(updated.systemDirectives).toEqual(['Rule 1', 'Rule 2']);
    });

    it('clears memory and injection flags', () => {
      saveTeamMemory(teamId, {
        teamId,
        skills: [{ id: 's1', title: 'Test', description: 'Test', extractedAt: 100 }],
        systemDirectives: ['Dir 1'],
      });
      markTaskMemoryInjected(teamId);
      expect(isTaskMemoryInjected(teamId)).toBe(true);

      clearTeamMemory(teamId);
      expect(getTeamMemory(teamId).skills).toHaveLength(0);
      expect(isTaskMemoryInjected(teamId)).toBe(false);
    });

    it('removes a specific skill by id', () => {
      saveTeamMemory(teamId, {
        teamId,
        skills: [
          { id: 's1', title: 'Skill 1', description: 'Desc 1', extractedAt: 100 },
          { id: 's2', title: 'Skill 2', description: 'Desc 2', extractedAt: 200 },
        ],
        systemDirectives: [],
      });

      const res = removeTeamSkill(teamId, 's1');
      expect(res.skills).toHaveLength(1);
      expect(res.skills[0].id).toBe('s2');
      expect(getTeamMemory(teamId).skills).toHaveLength(1);
    });

    it('removes a specific directive by index', () => {
      saveTeamMemory(teamId, {
        teamId,
        skills: [],
        systemDirectives: ['Directive 0', 'Directive 1', 'Directive 2'],
      });

      const res = removeTeamDirective(teamId, 1);
      expect(res.systemDirectives).toEqual(['Directive 0', 'Directive 2']);
      expect(getTeamMemory(teamId).systemDirectives).toEqual(['Directive 0', 'Directive 2']);
    });

    it('stores and retrieves agent-specific memory', () => {
      const slotId = 'slot-worker-1';
      expect(getAgentMemory(teamId, slotId)).toEqual({ teamId, skills: [], systemDirectives: [] });

      saveAgentMemory(teamId, slotId, {
        teamId,
        skills: [{ id: 'a1', title: 'Agent Skill', description: 'Agent Desc', extractedAt: 300 }],
        systemDirectives: ['Agent directive'],
      });

      const agentMem = getAgentMemory(teamId, slotId);
      expect(agentMem.skills).toHaveLength(1);
      expect(agentMem.skills[0].title).toBe('Agent Skill');
      expect(agentMem.systemDirectives).toEqual(['Agent directive']);
    });
  });

  describe('Prompt Injection', () => {
    it('formats empty memory as empty string', () => {
      expect(formatMemoryForPrompt({ teamId, skills: [], systemDirectives: [] })).toBe('');
    });

    it('formats skills and directives into structured section', () => {
      const formatted = formatMemoryForPrompt({
        teamId,
        skills: [{ id: 's1', title: 'TypeScript Rules', description: 'Strict mode required', extractedAt: 1 }],
        systemDirectives: ['Never use eval()', 'Always handle errors'],
      });

      expect(formatted).toContain('[Retained Team Skills & Operational Directives]');
      expect(formatted).toContain('• **TypeScript Rules**: Strict mode required');
      expect(formatted).toContain('• Never use eval()');
      expect(formatted).toContain('• Always handle errors');
    });

    it('injects retained skills only on the first prompt of a task', () => {
      saveTeamMemory(teamId, {
        teamId,
        skills: [{ id: 's1', title: 'FastAPI', description: 'Use async def', extractedAt: 1 }],
        systemDirectives: ['Check status'],
      });

      expect(isTaskMemoryInjected(teamId)).toBe(false);

      // First prompt - should inject
      const firstPrompt = injectRetainedSkillsIntoPrompt(teamId, 'Write an endpoint');
      expect(firstPrompt).toContain('[Retained Team Skills & Operational Directives]');
      expect(firstPrompt).toContain('Write an endpoint');
      expect(isTaskMemoryInjected(teamId)).toBe(true);

      // Second prompt - should NOT inject
      const secondPrompt = injectRetainedSkillsIntoPrompt(teamId, 'Now add authentication');
      expect(secondPrompt).toBe('Now add authentication');
      expect(secondPrompt).not.toContain('[Retained Team Skills & Operational Directives]');

      // Reset task memory injected
      resetTaskMemoryInjected(teamId);
      expect(isTaskMemoryInjected(teamId)).toBe(false);

      // Next task first prompt - should inject again
      const thirdPrompt = injectRetainedSkillsIntoPrompt(teamId, 'Start new task');
      expect(thirdPrompt).toContain('[Retained Team Skills & Operational Directives]');
      expect(thirdPrompt).toContain('Start new task');
    });

    it('force-injects when force flag is true even if already injected', () => {
      saveTeamMemory(teamId, {
        teamId,
        skills: [{ id: 's1', title: 'Test', description: 'Test', extractedAt: 1 }],
        systemDirectives: [],
      });
      markTaskMemoryInjected(teamId);

      const res = injectRetainedSkillsIntoPrompt(teamId, 'Hello', true);
      expect(res).toContain('[Retained Team Skills & Operational Directives]');
    });
  });

  describe('Distillation Output Parsing', () => {
    it('parses valid JSON inside markdown block', () => {
      const llmOutput = `
Here is what was learned:
\`\`\`json
{
  "skills": [
    { "title": "Database Migrations", "description": "Always backup before running migrations" }
  ],
  "systemDirectives": [
    "Run tests before committing",
    "Use semantic versioning"
  ]
}
\`\`\`
Hope this helps!
`;
      const parsed = parseDistillationOutput(llmOutput);
      expect(parsed.skills).toHaveLength(1);
      expect(parsed.skills[0].title).toBe('Database Migrations');
      expect(parsed.skills[0].description).toBe('Always backup before running migrations');
      expect(parsed.systemDirectives).toEqual(['Run tests before committing', 'Use semantic versioning']);
    });

    it('parses JSON without markdown code fence', () => {
      const rawJson = JSON.stringify({
        skills: [{ title: 'Code Review', description: 'Keep PRs under 400 lines' }],
        systemDirectives: ['Check CI'],
      });
      const parsed = parseDistillationOutput(rawJson);
      expect(parsed.skills).toHaveLength(1);
      expect(parsed.skills[0].title).toBe('Code Review');
      expect(parsed.systemDirectives).toEqual(['Check CI']);
    });

    it('falls back to markdown bullet point extraction if JSON is invalid', () => {
      const markdown = `
### Skills Learned
- Docker configuration: Multi-stage builds reduce image size significantly
- Logging: Use JSON logs in production

### Directives
- Always lint before push
- Keep comments up to date
`;
      const parsed = parseDistillationOutput(markdown);
      expect(parsed.skills).toHaveLength(2);
      expect(parsed.skills[0].title).toBe('Docker configuration');
      expect(parsed.skills[0].description).toBe('Multi-stage builds reduce image size significantly');
      expect(parsed.systemDirectives).toContain('Always lint before push');
    });
  });

  describe('Heuristic Skill Extraction', () => {
    it('extracts user directives and assistant summary skills when reflection is unavailable', () => {
      const messages: TMessage[] = [
        {
          id: 'm1',
          type: 'text',
          position: 'right',
          content: { content: 'Please make sure to always use UnoCSS utility classes and avoid raw CSS.' },
          created_at: 100,
        },
        {
          id: 'm2',
          type: 'text',
          position: 'left',
          content: {
            content: `
Summary of conventions:
- UnoCSS rule: Use UnoCSS classes directly in JSX className props
- Arco Design: Never use raw button or input elements
`,
          },
          created_at: 200,
        },
      ];

      const heuristic = extractSkillsHeuristic(messages);
      expect(heuristic.systemDirectives.length).toBeGreaterThan(0);
      expect(
        heuristic.systemDirectives.some((d) => d.toLowerCase().includes('always use unocss utility classes'))
      ).toBe(true);

      expect(heuristic.skills.length).toBeGreaterThan(0);
      expect(heuristic.skills.some((s) => s.title === 'UnoCSS rule')).toBe(true);
      expect(heuristic.skills.some((s) => s.title === 'Arco Design')).toBe(true);
    });
  });

  describe('distillTeamSkills and resetTeamForNewTask', () => {
    const mockTeam: TTeam = {
      id: 'team-distill-test',
      name: 'Engineering Team',
      assistants: [
        {
          slot_id: 'leader-slot',
          role: 'leader',
          assistant_id: 'asst-leader',
          assistant_name: 'Tech Lead',
          conversation_id: 'conv-lead',
        },
        {
          slot_id: 'worker-slot',
          role: 'teammate',
          assistant_id: 'asst-worker',
          assistant_name: 'Coder',
          conversation_id: 'conv-worker',
        },
      ],
    };

    it('distills skills using side question and syncs to team memory and assistant rules', async () => {
      loadAllConversationMessagesPagedMock.mockImplementation((convId: string) => {
        if (convId === 'conv-lead') {
          return Promise.resolve([
            {
              id: 'msg-1',
              type: 'text',
              position: 'right',
              content: { content: 'Please configure the project to use Vitest for unit tests.' },
              created_at: 10,
            },
          ]);
        }
        return Promise.resolve([
          {
            id: 'msg-2',
            type: 'text',
            position: 'left',
            content: { content: 'Vitest configured with happy-dom environment.' },
            created_at: 20,
          },
        ]);
      });

      askSideQuestionMock.mockResolvedValue({
        status: 'ok',
        answer: JSON.stringify({
          skills: [{ title: 'Vitest setup', description: 'Configure Vitest with happy-dom' }],
          systemDirectives: ['Run tests with bun run test'],
        }),
      });

      readAssistantRuleMock.mockResolvedValue('Base assistant rule.');

      const result = await distillTeamSkills(mockTeam);

      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].title).toBe('Vitest setup');
      expect(result.systemDirectives).toEqual(['Run tests with bun run test']);

      // Check team memory persisted
      const stored = getTeamMemory('team-distill-test');
      expect(stored.skills).toHaveLength(1);
      expect(stored.systemDirectives).toEqual(['Run tests with bun run test']);

      // Check assistant rule synced
      expect(writeAssistantRuleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          assistant_id: 'asst-leader',
          content: expect.stringContaining('<!-- TEAM_LEARNED_SKILLS_START -->'),
        })
      );
    });

    it('resetTeamForNewTask clears conversations, runtime context, active run, and emits reset events', async () => {
      const clearSpy = vi.fn();
      const resetSpy = vi.fn();
      const historySpy = vi.fn();

      emitter.on('conversation.messages.clear', clearSpy);
      emitter.on('team.task.reset', resetSpy);
      emitter.on('chat.history.refresh', historySpy);

      markTaskMemoryInjected(mockTeam.id);

      await resetTeamForNewTask({
        team: mockTeam,
        activeRunId: 'run-999',
      });

      // Active run cancelled
      expect(cancelRunMock).toHaveBeenCalledWith({
        team_id: mockTeam.id,
        team_run_id: 'run-999',
        reason: 'new_task',
      });

      // Context reset for both agents
      expect(resetAgentContextMock).toHaveBeenCalledTimes(2);
      expect(resetConversationMock).toHaveBeenCalledTimes(2);

      // Message clear events emitted for both conversations
      expect(clearSpy).toHaveBeenCalledWith('conv-lead');
      expect(clearSpy).toHaveBeenCalledWith('conv-worker');

      // Task memory injected flag reset
      expect(isTaskMemoryInjected(mockTeam.id)).toBe(false);

      // Team reset and history refresh events emitted
      expect(resetSpy).toHaveBeenCalledWith(mockTeam.id);
      expect(historySpy).toHaveBeenCalled();
    });
  });
});
