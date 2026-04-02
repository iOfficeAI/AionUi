import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockReadFile, mockEmitConv, mockEmitOc, mockHasCronSkillFile, mockValidateSkillContent } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockEmitConv: vi.fn(),
  mockEmitOc: vi.fn(),
  mockHasCronSkillFile: vi.fn(async () => false),
  mockValidateSkillContent: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile,
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { responseStream: { emit: mockEmitConv } },
    openclawConversation: { responseStream: { emit: mockEmitOc } },
  },
}));
vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'mock-uuid'),
}));
vi.mock('@/process/services/cron/cronSkillFile', () => ({
  hasCronSkillFile: mockHasCronSkillFile,
  validateSkillContent: mockValidateSkillContent,
}));

import { skillSuggestWatcher } from '@/process/services/cron/SkillSuggestWatcher';

describe('SkillSuggestWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Clean internal state by unregistering known keys
    for (const id of ['conv-1', 'conv-2', 'unknown-conv']) {
      skillSuggestWatcher.unregister(id);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should register and track conversations', () => {
    expect(skillSuggestWatcher.has('conv-1')).toBe(false);
    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    expect(skillSuggestWatcher.has('conv-1')).toBe(true);
  });

  it('should not overwrite existing registration', () => {
    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace-a');
    skillSuggestWatcher.register('conv-1', 'job-2', '/workspace-b');
    expect(skillSuggestWatcher.has('conv-1')).toBe(true);
  });

  it('should unregister conversations', () => {
    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    skillSuggestWatcher.unregister('conv-1');
    expect(skillSuggestWatcher.has('conv-1')).toBe(false);
  });

  it('should not trigger check for unregistered conversation', () => {
    skillSuggestWatcher.onFinish('unknown-conv');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should schedule retry checks with increasing delays on onFinish', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    skillSuggestWatcher.onFinish('conv-1');

    // First retry at 1000ms
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockReadFile).toHaveBeenCalledTimes(1);

    // Second retry at 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockReadFile).toHaveBeenCalledTimes(2);

    // Third retry at 3000ms
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockReadFile).toHaveBeenCalledTimes(3);

    // No more retries
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockReadFile).toHaveBeenCalledTimes(3);
  });

  it('should emit skill_suggest when file is valid and content changed', async () => {
    const validContent = '---\nname: Test\ndescription: Desc\n---\n\nBody';
    mockReadFile.mockResolvedValue(validContent);
    mockHasCronSkillFile.mockResolvedValue(false);
    mockValidateSkillContent.mockReturnValue({ name: 'Test', description: 'Desc', body: 'Body' });

    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    skillSuggestWatcher.onFinish('conv-1');

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockEmitConv).toHaveBeenCalledTimes(1);
    const emitted = mockEmitConv.mock.calls[0][0];
    expect(emitted).toMatchObject({
      type: 'skill_suggest',
      conversation_id: 'conv-1',
      data: {
        cronJobId: 'job-1',
        name: 'Test',
        description: 'Desc',
        skillContent: validContent,
      },
    });
  });

  it('should not emit again if content hash is unchanged', async () => {
    const validContent = '---\nname: Test\ndescription: Desc\n---\n\nBody';
    mockReadFile.mockResolvedValue(validContent);
    mockHasCronSkillFile.mockResolvedValue(false);
    mockValidateSkillContent.mockReturnValue({ name: 'Test', description: 'Desc', body: 'Body' });

    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');

    // First finish — emits
    skillSuggestWatcher.onFinish('conv-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockEmitConv).toHaveBeenCalledTimes(1);

    // Second finish with same content — should not emit again
    mockEmitConv.mockClear();
    skillSuggestWatcher.onFinish('conv-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockEmitConv).not.toHaveBeenCalled();
  });

  it('should unregister when user already has a dedicated skill file', async () => {
    mockReadFile.mockResolvedValue('some content');
    mockHasCronSkillFile.mockResolvedValue(true);

    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    skillSuggestWatcher.onFinish('conv-1');

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockEmitConv).not.toHaveBeenCalled();
    expect(skillSuggestWatcher.has('conv-1')).toBe(false);
  });

  it('should not emit when validation fails', async () => {
    mockReadFile.mockResolvedValue('invalid content');
    mockHasCronSkillFile.mockResolvedValue(false);
    mockValidateSkillContent.mockReturnValue(null);

    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    skillSuggestWatcher.onFinish('conv-1');

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockEmitConv).not.toHaveBeenCalled();
  });

  it('should not emit when file content is empty', async () => {
    mockReadFile.mockResolvedValue('   ');

    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    skillSuggestWatcher.onFinish('conv-1');

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockEmitConv).not.toHaveBeenCalled();
  });

  it('should update lastHash via setLastHash', async () => {
    const validContent = '---\nname: Test\ndescription: Desc\n---\n\nBody';
    mockReadFile.mockResolvedValue(validContent);
    mockHasCronSkillFile.mockResolvedValue(false);
    mockValidateSkillContent.mockReturnValue({ name: 'Test', description: 'Desc', body: 'Body' });

    skillSuggestWatcher.register('conv-1', 'job-1', '/workspace');
    // Pre-set the hash to match what the file will produce
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(validContent).digest('hex');
    skillSuggestWatcher.setLastHash('conv-1', hash);

    skillSuggestWatcher.onFinish('conv-1');
    await vi.advanceTimersByTimeAsync(1000);

    // Should not emit because hash matches
    expect(mockEmitConv).not.toHaveBeenCalled();
  });
});
