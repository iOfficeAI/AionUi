/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  buildInterviewPrompt,
  parseQuestionsFromLLM,
  generateDefaultQuestions,
  buildScopingQuestions,
  generateOriginalRequestDoc,
  generateMilestones,
  generateProjectPlanDoc,
  persistWorkspaceArtifacts,
} from '@/process/services/teamwork/scopingEngine';
import type { InterviewQuestion } from '@/common/types/teamwork';

describe('Teamwork ScopingEngine', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'teamwork-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('buildInterviewPrompt', () => {
    it('should generate a prompt containing Sentinel role instructions and user request', () => {
      const prompt = buildInterviewPrompt('Implement multi-agent teamwork');
      expect(prompt).toContain('Sentinel');
      expect(prompt).toContain('Implement multi-agent teamwork');
      expect(prompt).toContain('Architecture & Boundaries');
      expect(prompt).toContain('Testing Bounds & Strategy');
      expect(prompt).toContain('Constraints & Non-Functional Requirements');
    });

    it('should trim surrounding whitespace from the user request', () => {
      const prompt = buildInterviewPrompt('   Build notification widget   ');
      expect(prompt).toContain('User Request: "Build notification widget"');
    });
  });

  describe('parseQuestionsFromLLM', () => {
    it('should parse a clean JSON array string', () => {
      const rawJson = JSON.stringify([
        {
          id: 'q1',
          question: 'Which database?',
          options: ['PostgreSQL', 'SQLite'],
          category: 'architecture',
        },
      ]);
      const result = parseQuestionsFromLLM(rawJson);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('q1');
      expect(result[0].options).toEqual(['PostgreSQL', 'SQLite']);
      expect(result[0].category).toBe('architecture');
    });

    it('should parse JSON wrapped in markdown code fence', () => {
      const markdown = `
Here are the clarifying questions:
\`\`\`json
[
  {
    "id": "q1",
    "question": "What test framework?",
    "options": ["Vitest", "Jest"],
    "category": "testing"
  }
]
\`\`\`
Hope this helps!
`;
      const result = parseQuestionsFromLLM(markdown);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('q1');
      expect(result[0].category).toBe('testing');
    });

    it('should extract JSON array embedded within conversational prose without code blocks', () => {
      const text = 'Sure, here are questions: [{"id":"q_emb","question":"Scope?","category":"scope"}] Thanks!';
      const result = parseQuestionsFromLLM(text);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('q_emb');
    });

    it('should return an empty array for completely malformed or unparseable input', () => {
      const result = parseQuestionsFromLLM('This is just plain text with no brackets at all.');
      expect(result).toEqual([]);
    });

    it('should return an empty array for invalid JSON syntax inside brackets', () => {
      const result = parseQuestionsFromLLM('[{ invalid json: here }]');
      expect(result).toEqual([]);
    });
  });

  describe('generateDefaultQuestions', () => {
    it('should tailor architecture question for backend/IPC requests', () => {
      const questions = generateDefaultQuestions('Build a backend IPC service');
      expect(questions.length).toBeGreaterThanOrEqual(3);
      const arch = questions.find((q) => q.category === 'architecture');
      expect(arch).toBeDefined();
      expect(arch?.question).toContain('architectural communication pattern');
      expect(arch?.options?.[0]).toContain('IPC bridge');
    });

    it('should tailor architecture question for UI/React requests', () => {
      const questions = generateDefaultQuestions('Create a new UI component with React');
      const arch = questions.find((q) => q.category === 'architecture');
      expect(arch).toBeDefined();
      expect(arch?.question).toContain('UI component architecture');
      expect(arch?.options?.[0]).toContain('Arco Design');
    });

    it('should provide sensible defaults for general requests', () => {
      const questions = generateDefaultQuestions('Optimize application performance');
      expect(questions).toHaveLength(4);
      const categories = questions.map((q) => q.category);
      expect(categories).toContain('architecture');
      expect(categories).toContain('testing');
      expect(categories).toContain('constraints');
      expect(categories).toContain('scope');
    });
  });

  describe('buildScopingQuestions', () => {
    it('should use LLM output when it provides >= 3 questions', () => {
      const llmOutput = JSON.stringify([
        { id: '1', question: 'Q1?', category: 'architecture' },
        { id: '2', question: 'Q2?', category: 'testing' },
        { id: '3', question: 'Q3?', category: 'constraints' },
      ]);
      const questions = buildScopingQuestions('My Request', llmOutput);
      expect(questions).toHaveLength(3);
      expect(questions[0].id).toBe('1');
    });

    it('should fall back to default questions when LLM output has fewer than 3 questions', () => {
      const llmOutput = JSON.stringify([{ id: '1', question: 'Only one question?', category: 'testing' }]);
      const questions = buildScopingQuestions('My Request', llmOutput);
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions[0].id).toBe('q_arch');
    });

    it('should fall back to default questions when LLM output is undefined or malformed', () => {
      const questions = buildScopingQuestions('My Request', undefined);
      expect(questions.length).toBeGreaterThanOrEqual(3);
      expect(questions[0].id).toBe('q_arch');
    });
  });

  describe('generateOriginalRequestDoc', () => {
    it('should generate markdown document with user request, answers, and constraints', () => {
      const questions: InterviewQuestion[] = [
        { id: 'q1', question: 'Target coverage?', category: 'testing' },
        { id: 'q2', question: 'UI library?', category: 'architecture' },
      ];
      const answers = {
        q1: '80% unit test coverage',
        q2: 'Arco Design',
      };

      const doc = generateOriginalRequestDoc('Implement multi-agent workflow', questions, answers);

      expect(doc).toContain('# ORIGINAL_REQUEST.md');
      expect(doc).toContain('Implement multi-agent workflow');
      expect(doc).toContain('Target coverage?');
      expect(doc).toContain('80% unit test coverage');
      expect(doc).toContain('Arco Design');
      expect(doc).toContain('Architectural Constraints & Non-Negotiable Bounds');
      expect(doc).toContain('Verification Gate');
    });

    it('should handle missing answers gracefully with fallback message', () => {
      const questions: InterviewQuestion[] = [{ id: 'q1', question: 'Target coverage?', category: 'testing' }];
      const doc = generateOriginalRequestDoc('Implement feature', questions, {});
      expect(doc).toContain('Not specified (default applied)');
    });
  });

  describe('generateMilestones', () => {
    it('should generate 4 sequential milestones with subtasks and acceptance criteria', () => {
      const milestones = generateMilestones('Implement feature', [], {});
      expect(milestones).toHaveLength(4);

      expect(milestones[0].id).toBe('milestone-1');
      expect(milestones[0].status).toBe('pending');
      expect(milestones[0].subtasks.length).toBeGreaterThan(0);
      expect(milestones[0].acceptanceCriteria.length).toBeGreaterThan(0);

      // Verify subtasks have assigned roles
      const allSubtasks = milestones.flatMap((m) => m.subtasks);
      const roles = allSubtasks.map((st) => st.assignedRole);
      expect(roles).toContain('explorer');
      expect(roles).toContain('worker');
      expect(roles).toContain('auditor');
    });
  });

  describe('generateProjectPlanDoc', () => {
    it('should generate markdown document with all milestones, subtasks, and verification protocol', () => {
      const milestones = generateMilestones('Add teamwork mode', [], {});
      const planDoc = generateProjectPlanDoc('Add teamwork mode', milestones);

      expect(planDoc).toContain('# PROJECT_PLAN.md');
      expect(planDoc).toContain('Add teamwork mode');
      expect(planDoc).toContain('Milestone 1:');
      expect(planDoc).toContain('Auditor Acceptance Criteria:');
      expect(planDoc).toContain('Verification Gate Protocol');
      expect(planDoc).toContain('Explorer provides context briefs');
      expect(planDoc).toContain('Auditor executes verification tests');
    });
  });

  describe('persistWorkspaceArtifacts', () => {
    it('should write ORIGINAL_REQUEST.md and PROJECT_PLAN.md to the specified workspace path', async () => {
      const originalDoc = '# Original Request Content';
      const planDoc = '# Project Plan Content';

      const result = await persistWorkspaceArtifacts(tempDir, originalDoc, planDoc);

      expect(fs.existsSync(result.originalRequestPath)).toBe(true);
      expect(fs.existsSync(result.projectPlanPath)).toBe(true);

      const savedOriginal = await fs.promises.readFile(result.originalRequestPath, 'utf-8');
      const savedPlan = await fs.promises.readFile(result.projectPlanPath, 'utf-8');

      expect(savedOriginal).toBe(originalDoc);
      expect(savedPlan).toBe(planDoc);
    });

    it('should create subdirectories recursively if workspace folder does not exist yet', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'workspace');
      const result = await persistWorkspaceArtifacts(nestedDir, 'req', 'plan');

      expect(fs.existsSync(result.originalRequestPath)).toBe(true);
      expect(fs.existsSync(result.projectPlanPath)).toBe(true);
    });
  });
});
