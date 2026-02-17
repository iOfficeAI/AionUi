/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { RalphOrchestrator, extractSummary, extractFilesChanged, extractLearnings } from '@/agent/ralph/RalphOrchestrator';
import type { SendMessageFn, FileSystemFn, StatusCallback } from '@/agent/ralph/RalphOrchestrator';
import { RALPH_COMPLETION_SIGNAL } from '@/agent/ralph/types';
import type { RalphPrd } from '@/agent/ralph/types';

const testPrd: RalphPrd = {
  project: 'test-project',
  branchName: 'ralph/test-feature',
  description: 'Test feature',
  userStories: [
    {
      id: 'US-001',
      title: 'First story',
      description: 'As a user, I want X so that Y',
      acceptanceCriteria: ['AC1'],
      priority: 1,
      passes: false,
    },
    {
      id: 'US-002',
      title: 'Second story',
      description: 'As a user, I want A so that B',
      acceptanceCriteria: ['AC2'],
      priority: 2,
      passes: false,
    },
  ],
};

function createMockFs(files: Record<string, string> = {}): FileSystemFn {
  const storage = { ...files };
  return {
    readFile: jest.fn(async (path: string) => {
      if (storage[path] === undefined) throw new Error(`File not found: ${path}`);
      return storage[path];
    }) as jest.MockedFunction<FileSystemFn['readFile']>,
    writeFile: jest.fn(async (path: string, content: string) => {
      storage[path] = content;
    }) as jest.MockedFunction<FileSystemFn['writeFile']>,
    exists: jest.fn(async (path: string) => {
      return storage[path] !== undefined;
    }) as jest.MockedFunction<FileSystemFn['exists']>,
  };
}

describe('RalphOrchestrator', () => {
  describe('run', () => {
    it('should complete all stories across iterations', async () => {
      let callCount = 0;
      const sendMessage: SendMessageFn = jest.fn(async () => {
        callCount++;
        if (callCount === 2) {
          return `Implemented second story.\n\n## Summary\nDid the thing.\n\n${RALPH_COMPLETION_SIGNAL}`;
        }
        return '## Summary\nImplemented first story successfully.';
      }) as jest.MockedFunction<SendMessageFn>;

      const fs = createMockFs({
        'prd.json': JSON.stringify(testPrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs, { maxIterations: 10 });
      const results = await orchestrator.run();

      expect(results).toHaveLength(2);
      expect(results[0].storyId).toBe('US-001');
      expect(results[0].success).toBe(true);
      expect(results[1].storyId).toBe('US-002');
      expect(results[1].allComplete).toBe(true);
      expect(orchestrator.status).toBe('completed');
    });

    it('should stop at max iterations', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => {
        return '## Summary\nWorked on the story.';
      }) as jest.MockedFunction<SendMessageFn>;

      // PRD with 5 stories but max 2 iterations
      const largePrd: RalphPrd = {
        ...testPrd,
        userStories: Array.from({ length: 5 }, (_, i) => ({
          id: `US-${String(i + 1).padStart(3, '0')}`,
          title: `Story ${i + 1}`,
          description: `Description ${i + 1}`,
          acceptanceCriteria: [`AC${i + 1}`],
          priority: i + 1,
          passes: false,
        })),
      };

      const fs = createMockFs({
        'prd.json': JSON.stringify(largePrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs, { maxIterations: 2 });
      const results = await orchestrator.run();

      expect(results).toHaveLength(2);
      expect(orchestrator.status).toBe('max_iterations_reached');
    });

    it('should complete immediately if all stories already pass', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => 'done') as jest.MockedFunction<SendMessageFn>;

      const completePrd: RalphPrd = {
        ...testPrd,
        userStories: testPrd.userStories.map((s) => ({ ...s, passes: true })),
      };

      const fs = createMockFs({
        'prd.json': JSON.stringify(completePrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs);
      const results = await orchestrator.run();

      expect(results).toHaveLength(0);
      expect(orchestrator.status).toBe('completed');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('should write progress.txt after each iteration', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => {
        return `## Summary\nDone.\n\n${RALPH_COMPLETION_SIGNAL}`;
      }) as jest.MockedFunction<SendMessageFn>;

      const singleStoryPrd: RalphPrd = {
        ...testPrd,
        userStories: [testPrd.userStories[0]],
      };

      const fs = createMockFs({
        'prd.json': JSON.stringify(singleStoryPrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs);
      await orchestrator.run();

      expect(fs.writeFile).toHaveBeenCalledWith('progress.txt', expect.stringContaining('US-001'));
    });

    it('should update prd.json after each iteration', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => {
        return `## Summary\nDone.\n\n${RALPH_COMPLETION_SIGNAL}`;
      }) as jest.MockedFunction<SendMessageFn>;

      const singleStoryPrd: RalphPrd = {
        ...testPrd,
        userStories: [testPrd.userStories[0]],
      };

      const fs = createMockFs({
        'prd.json': JSON.stringify(singleStoryPrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs);
      await orchestrator.run();

      // Verify prd.json was written with passes: true
      const writeCall = (fs.writeFile as jest.MockedFunction<FileSystemFn['writeFile']>).mock.calls.find((call) => call[0] === 'prd.json');
      expect(writeCall).toBeDefined();
      const writtenPrd = JSON.parse(writeCall![1]);
      expect(writtenPrd.userStories[0].passes).toBe(true);
    });

    it('should call status callback on each iteration', async () => {
      let callCount = 0;
      const sendMessage: SendMessageFn = jest.fn(async () => {
        callCount++;
        if (callCount >= 2) return `Done.\n\n${RALPH_COMPLETION_SIGNAL}`;
        return 'Working on it.';
      }) as jest.MockedFunction<SendMessageFn>;

      const fs = createMockFs({
        'prd.json': JSON.stringify(testPrd),
      });

      const statusUpdates: any[] = [];
      const onStatus: StatusCallback = (status) => {
        statusUpdates.push({ ...status });
      };

      const orchestrator = new RalphOrchestrator(sendMessage, fs, { maxIterations: 10 }, onStatus);
      await orchestrator.run();

      // Should have per-iteration updates plus final
      expect(statusUpdates.length).toBeGreaterThanOrEqual(2);
      expect(statusUpdates[0].iteration).toBe(1);
      expect(statusUpdates[0].storyId).toBe('US-001');
    });

    it('should set status to failed on error', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => {
        throw new Error('AI agent crashed');
      }) as jest.MockedFunction<SendMessageFn>;

      const fs = createMockFs({
        'prd.json': JSON.stringify(testPrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs);

      await expect(orchestrator.run()).rejects.toThrow('AI agent crashed');
      expect(orchestrator.status).toBe('failed');
    });

    it('should read AGENTS.md when it exists', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => {
        return `Done.\n\n${RALPH_COMPLETION_SIGNAL}`;
      }) as jest.MockedFunction<SendMessageFn>;

      const singleStoryPrd: RalphPrd = {
        ...testPrd,
        userStories: [testPrd.userStories[0]],
      };

      const fs = createMockFs({
        'prd.json': JSON.stringify(singleStoryPrd),
        'AGENTS.md': '# Project conventions\n\nUse TypeScript strict mode.',
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs);
      await orchestrator.run();

      expect(fs.readFile).toHaveBeenCalledWith('AGENTS.md');
    });
  });

  describe('runSingleIteration', () => {
    it('should run one iteration and return result', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => {
        return '## Summary\nImplemented the feature.';
      }) as jest.MockedFunction<SendMessageFn>;

      const fs = createMockFs({
        'prd.json': JSON.stringify(testPrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs);
      const result = await orchestrator.runSingleIteration(1);

      expect(result.iteration).toBe(1);
      expect(result.storyId).toBe('US-001');
      expect(result.success).toBe(true);
      expect(result.allComplete).toBe(false);
    });

    it('should return allComplete=true when no stories remain', async () => {
      const sendMessage: SendMessageFn = jest.fn(async () => 'done') as jest.MockedFunction<SendMessageFn>;

      const completePrd: RalphPrd = {
        ...testPrd,
        userStories: testPrd.userStories.map((s) => ({ ...s, passes: true })),
      };

      const fs = createMockFs({
        'prd.json': JSON.stringify(completePrd),
      });

      const orchestrator = new RalphOrchestrator(sendMessage, fs);
      const result = await orchestrator.runSingleIteration(1);

      expect(result.allComplete).toBe(true);
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('extractSummary', () => {
    it('should extract summary from ## Summary section', () => {
      const output = '## Summary\nImplemented user authentication.\n\n## Files Changed\n- src/auth.ts';
      expect(extractSummary(output)).toBe('Implemented user authentication.');
    });

    it('should extract from "What I did" section', () => {
      const output = '## What I did\nCreated the login page.\n\n## Notes\nSome notes.';
      expect(extractSummary(output)).toBe('Created the login page.');
    });

    it('should extract from "Changes Made" section', () => {
      const output = '## Changes Made\nRefactored the database layer.\n\n---';
      expect(extractSummary(output)).toBe('Refactored the database layer.');
    });

    it('should fall back to first paragraph', () => {
      const output = 'I completed the implementation of the user model with all required fields and validations.\n\nSecond paragraph here.';
      expect(extractSummary(output)).toContain('completed the implementation');
    });

    it('should truncate long summaries', () => {
      const longText = 'A'.repeat(600);
      const output = `## Summary\n${longText}`;
      expect(extractSummary(output).length).toBeLessThanOrEqual(500);
    });

    it('should return fallback for empty output', () => {
      expect(extractSummary('')).toBe('Iteration completed.');
    });
  });

  describe('extractFilesChanged', () => {
    it('should extract files from "Files Changed" section', () => {
      const output = '## Files Changed\n- src/auth.ts\n- src/models/User.ts\n\n## Notes';
      const files = extractFilesChanged(output);
      expect(files).toContain('src/auth.ts');
      expect(files).toContain('src/models/User.ts');
    });

    it('should extract from backtick-wrapped file names', () => {
      const output = '## Files Changed\n- `src/auth.ts`\n- `src/models/User.ts`';
      const files = extractFilesChanged(output);
      expect(files).toContain('src/auth.ts');
      expect(files).toContain('src/models/User.ts');
    });

    it('should extract from git output patterns', () => {
      const output = 'modified: src/auth.ts\ncreated: src/models/User.ts';
      const files = extractFilesChanged(output);
      expect(files).toContain('src/auth.ts');
      expect(files).toContain('src/models/User.ts');
    });

    it('should deduplicate files', () => {
      const output = '## Files Changed\n- src/auth.ts\n\nmodified: src/auth.ts';
      const files = extractFilesChanged(output);
      expect(files.filter((f) => f === 'src/auth.ts')).toHaveLength(1);
    });

    it('should return empty array when no files found', () => {
      expect(extractFilesChanged('Just some text.')).toEqual([]);
    });
  });

  describe('extractLearnings', () => {
    it('should extract from "Learnings" section', () => {
      const output = '## Learnings\n- TypeScript strict mode catches more bugs\n- Use zod for validation';
      const learnings = extractLearnings(output);
      expect(learnings).toContain('TypeScript strict mode catches more bugs');
      expect(learnings).toContain('Use zod for validation');
    });

    it('should extract from "Notes" section', () => {
      const output = '## Notes\n- Remember to handle edge cases\n- Database needs indexing';
      const learnings = extractLearnings(output);
      expect(learnings).toContain('Remember to handle edge cases');
    });

    it('should return empty array when no learnings found', () => {
      expect(extractLearnings('No learnings here.')).toEqual([]);
    });
  });
});
