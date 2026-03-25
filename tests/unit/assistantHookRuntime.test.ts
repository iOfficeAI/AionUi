import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadFile = vi.fn();
const mockAccess = vi.fn();

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    access: mockAccess,
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getHooksDir: () => '/mock/hooks',
  getBuiltinHooksCopyDir: () => '/mock/builtin-hooks',
}));

describe('AssistantHookRuntime', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockAccess.mockReset();
  });

  it('applies enabled before_user_prompt prompt-transform hooks in order', async () => {
    mockAccess.mockImplementation(async (filePath: string) => {
      if (filePath === '/mock/hooks/quality-gate') return;
      throw new Error(`ENOENT ${filePath}`);
    });

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/mock/hooks/quality-gate/manifest.json') {
        return JSON.stringify({
          name: 'quality-gate',
          executionType: 'prompt-transform',
          events: ['before_user_prompt'],
        });
      }
      if (filePath === '/mock/hooks/quality-gate/before_user_prompt.md') {
        return 'Checklist\n\n[User Request]\n{{userPrompt}}';
      }
      throw new Error(`ENOENT ${filePath}`);
    });

    const { AssistantHookRuntime } = await import('../../src/process/bridge/services/AssistantHookRuntime');
    const runtime = new AssistantHookRuntime();

    const result = await runtime.applyBeforeUserPrompt(
      {
        id: 'conv-1',
        type: 'acp',
        name: 'Conversation',
        createTime: Date.now(),
        modifyTime: Date.now(),
        extra: {
          backend: 'claude',
          workspace: '/workspace/project',
          enabledHooks: ['quality-gate'],
        },
      } as any,
      'Fix failing tests'
    );

    expect(result).toEqual({
      content: 'Checklist\n\n[User Request]\nFix failing tests',
      appliedHooks: ['quality-gate'],
    });
  });

  it('falls back to builtin hooks when the user hooks directory does not contain the hook', async () => {
    mockAccess.mockImplementation(async (filePath: string) => {
      if (filePath === '/mock/builtin-hooks/plan-before-coding') return;
      throw new Error(`ENOENT ${filePath}`);
    });

    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/mock/builtin-hooks/plan-before-coding/manifest.json') {
        return JSON.stringify({
          name: 'plan-before-coding',
          executionType: 'prompt-transform',
          events: ['before_user_prompt'],
          supportedBackends: ['gemini'],
        });
      }
      if (filePath === '/mock/builtin-hooks/plan-before-coding/before_user_prompt.md') {
        return 'Plan first for {{backend}}\n\n{{userPrompt}}';
      }
      throw new Error(`ENOENT ${filePath}`);
    });

    const { AssistantHookRuntime } = await import('../../src/process/bridge/services/AssistantHookRuntime');
    const runtime = new AssistantHookRuntime();

    const result = await runtime.applyBeforeUserPrompt(
      {
        id: 'conv-2',
        type: 'gemini',
        name: 'Conversation',
        model: { id: 'p', name: 'Provider', useModel: 'm', platform: 'gemini', baseUrl: '', apiKey: '' },
        createTime: Date.now(),
        modifyTime: Date.now(),
        extra: {
          workspace: '/workspace/project',
          enabledHooks: ['plan-before-coding'],
        },
      } as any,
      'Draft a release note'
    );

    expect(result.appliedHooks).toEqual(['plan-before-coding']);
    expect(result.content).toContain('Draft a release note');
  });
});
