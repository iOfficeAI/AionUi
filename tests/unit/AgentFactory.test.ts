import { describe, it, expect, vi } from 'vitest';
import { AgentFactory } from '../../src/process/task/AgentFactory';
import { UnknownAgentTypeError } from '../../src/process/task/IAgentFactory';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

describe('AgentFactory', () => {
  it('creates agent using registered creator', () => {
    const factory = new AgentFactory();
    const mockAgent = { type: 'gemini', status: undefined, workspace: '', conversation_id: 'c1' } as any;
    const creator = vi.fn(() => mockAgent);
    factory.register('gemini', creator);

    const conv = { id: 'c1', type: 'gemini', extra: {} } as any;
    const result = factory.create(conv);

    expect(creator).toHaveBeenCalledWith(conv, undefined);
    expect(result).toBe(mockAgent);
  });

  it('throws UnknownAgentTypeError for unregistered type', () => {
    const factory = new AgentFactory();
    const conv = { id: 'c1', type: 'gemini', extra: {} } as any;
    expect(() => factory.create(conv)).toThrow(UnknownAgentTypeError);
  });

  it('latest registered creator wins', () => {
    const factory = new AgentFactory();
    const agent1 = { type: 'gemini' } as any;
    const agent2 = { type: 'gemini' } as any;
    factory.register('gemini', () => agent1);
    factory.register('gemini', () => agent2);
    const conv = { id: 'c1', type: 'gemini', extra: {} } as any;
    expect(factory.create(conv)).toBe(agent2);
  });
});
