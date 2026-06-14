import { describe, expect, it, vi } from 'vitest';
import { formatAgentModeLabel, type AgentModeOption } from '@/renderer/utils/model/agentModes';

function createT(translations: Record<string, string> = {}) {
  return vi.fn((key: string, options?: { defaultValue?: string }) => {
    return translations[key] ?? options?.defaultValue ?? key;
  });
}

describe('formatAgentModeLabel', () => {
  it('uses labelKey as the i18n key when present', () => {
    const t = createT({ 'agentMode.readOnly': '只读' });
    const mode: AgentModeOption = { value: 'read-only', label: 'Read Only', labelKey: 'readOnly' };

    const result = formatAgentModeLabel(t, mode);

    expect(result).toBe('只读');
    expect(t).toHaveBeenCalledWith('agentMode.readOnly', { defaultValue: 'Read Only' });
  });

  it('falls back to value when labelKey is absent', () => {
    const t = createT({ 'agentMode.agent': '代理' });
    const mode: AgentModeOption = { value: 'agent', label: 'Agent' };

    const result = formatAgentModeLabel(t, mode);

    expect(result).toBe('代理');
    expect(t).toHaveBeenCalledWith('agentMode.agent', { defaultValue: 'Agent' });
  });

  it('falls back to label when i18n translation is missing', () => {
    const t = createT({});
    const mode: AgentModeOption = { value: 'read-only', label: 'Read Only', labelKey: 'readOnly' };

    const result = formatAgentModeLabel(t, mode);

    expect(result).toBe('Read Only');
    expect(t).toHaveBeenCalledWith('agentMode.readOnly', { defaultValue: 'Read Only' });
  });

  it('preserves value when labelKey is undefined', () => {
    const t = createT({ 'agentMode.auto': '默认' });
    const mode: AgentModeOption = { value: 'auto', label: 'Default' };

    const result = formatAgentModeLabel(t, mode);

    expect(result).toBe('默认');
    expect(t).toHaveBeenCalledWith('agentMode.auto', { defaultValue: 'Default' });
  });
});
