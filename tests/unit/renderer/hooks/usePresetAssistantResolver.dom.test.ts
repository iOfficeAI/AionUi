import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresetAssistantResolver } from '@/renderer/pages/guid/hooks/usePresetAssistantResolver';

const readAssistantRuleInvokeMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readAssistantRule: {
        invoke: (...args: unknown[]) => readAssistantRuleInvokeMock(...args),
      },
    },
  },
}));

describe('usePresetAssistantResolver', () => {
  beforeEach(() => {
    readAssistantRuleInvokeMock.mockReset();
  });

  it('prefers assistant_id over legacy custom_agent_id when resolving assistant fields', async () => {
    readAssistantRuleInvokeMock.mockResolvedValue('assistant rules');

    const { result } = renderHook(() =>
      usePresetAssistantResolver({
        localeKey: 'zh-CN',
        assistants: [
          {
            id: 'assistant-modern',
            preset_agent_type: 'aionrs',
            enabled_skills: ['skill-a'],
            disabled_builtin_skills: ['skill-b'],
          },
          {
            id: 'assistant-legacy',
            preset_agent_type: 'claude',
            enabled_skills: ['legacy-skill'],
            disabled_builtin_skills: ['legacy-disabled'],
          },
        ] as any,
      })
    );

    const agentInfo = {
      agent_type: 'acp',
      backend: 'claude',
      assistant_id: 'assistant-modern',
      custom_agent_id: 'assistant-legacy',
      context: 'legacy context',
    };

    const resolved = await result.current.resolvePresetRulesAndSkills(agentInfo);

    expect(readAssistantRuleInvokeMock).toHaveBeenCalledWith({
      assistant_id: 'assistant-modern',
      locale: 'zh-CN',
    });
    expect(resolved).toEqual({ rules: 'assistant rules' });
    expect(result.current.resolvePresetAgentType(agentInfo)).toBe('aionrs');
    expect(result.current.resolveEnabledSkills(agentInfo)).toEqual(['skill-a']);
    expect(result.current.resolveDisabledBuiltinSkills(agentInfo)).toEqual(['skill-b']);
  });

  it('uses preset_assistant_id before backend fallback when restoring legacy assistant conversations', async () => {
    readAssistantRuleInvokeMock.mockResolvedValue('assistant rules');

    const { result } = renderHook(() =>
      usePresetAssistantResolver({
        localeKey: 'zh-CN',
        assistants: [
          {
            id: 'assistant-modern',
            preset_agent_type: 'aionrs',
            enabled_skills: ['skill-a'],
            disabled_builtin_skills: ['skill-b'],
          },
        ] as any,
      })
    );

    const agentInfo = {
      agent_type: 'acp',
      backend: 'claude',
      preset_assistant_id: 'assistant-modern',
      context: 'legacy context',
    };

    const resolved = await result.current.resolvePresetRulesAndSkills(agentInfo as any);

    expect(readAssistantRuleInvokeMock).toHaveBeenCalledWith({
      assistant_id: 'assistant-modern',
      locale: 'zh-CN',
    });
    expect(resolved).toEqual({ rules: 'assistant rules' });
    expect(result.current.resolvePresetAgentType(agentInfo as any)).toBe('aionrs');
    expect(result.current.resolveEnabledSkills(agentInfo as any)).toEqual(['skill-a']);
    expect(result.current.resolveDisabledBuiltinSkills(agentInfo as any)).toEqual(['skill-b']);
  });

  it('ignores legacy custom_agent_id when it only points at a runtime row id', async () => {
    const { result } = renderHook(() =>
      usePresetAssistantResolver({
        localeKey: 'zh-CN',
        assistants: [
          {
            id: 'assistant-modern',
            preset_agent_type: 'aionrs',
            enabled_skills: ['skill-a'],
            disabled_builtin_skills: ['skill-b'],
          },
        ] as any,
      })
    );

    const agentInfo = {
      agent_type: 'acp',
      backend: 'claude',
      custom_agent_id: 'runtime-social',
      context: 'legacy context',
    };

    const resolved = await result.current.resolvePresetRulesAndSkills(agentInfo as any);

    expect(readAssistantRuleInvokeMock).not.toHaveBeenCalled();
    expect(resolved).toEqual({ rules: 'legacy context' });
    expect(result.current.resolvePresetAgentType(agentInfo as any)).toBe('claude');
    expect(result.current.resolveEnabledSkills(agentInfo as any)).toBeUndefined();
    expect(result.current.resolveDisabledBuiltinSkills(agentInfo as any)).toBeUndefined();
  });

  it('still resolves legacy custom_agent_id when it matches an assistant id', async () => {
    readAssistantRuleInvokeMock.mockResolvedValue('assistant rules');

    const { result } = renderHook(() =>
      usePresetAssistantResolver({
        localeKey: 'zh-CN',
        assistants: [
          {
            id: 'assistant-legacy',
            preset_agent_type: 'claude',
            enabled_skills: ['legacy-skill'],
            disabled_builtin_skills: ['legacy-disabled'],
          },
        ] as any,
      })
    );

    const agentInfo = {
      agent_type: 'acp',
      backend: 'claude',
      custom_agent_id: 'assistant-legacy',
      context: 'legacy context',
    };

    const resolved = await result.current.resolvePresetRulesAndSkills(agentInfo as any);

    expect(readAssistantRuleInvokeMock).toHaveBeenCalledWith({
      assistant_id: 'assistant-legacy',
      locale: 'zh-CN',
    });
    expect(resolved).toEqual({ rules: 'assistant rules' });
    expect(result.current.resolvePresetAgentType(agentInfo as any)).toBe('claude');
    expect(result.current.resolveEnabledSkills(agentInfo as any)).toEqual(['legacy-skill']);
    expect(result.current.resolveDisabledBuiltinSkills(agentInfo as any)).toEqual(['legacy-disabled']);
  });
});
