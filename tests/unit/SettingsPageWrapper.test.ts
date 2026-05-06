import { describe, it, expect } from 'vitest';
import { getBuiltinSettingsNavItems } from '@/renderer/pages/settings/components/SettingsPageWrapper';

const t = (key: string, options?: { defaultValue?: string }) => {
  const labels: Record<string, string> = {
    'settings.gemini': 'Gemini',
    'settings.model': 'Models',
    'settings.assistants': 'Assistants',
    'settings.agents': 'Agents',
    'settings.capabilities': 'Capabilities',
    'settings.display': 'Display',
    'settings.webui': 'WebUI',
    'settings.system': 'System',
    'settings.about': 'About',
  };

  return labels[key] ?? options?.defaultValue ?? key;
};

describe('getBuiltinSettingsNavItems', () => {
  it('returns mobile settings tabs in the same order as desktop sider', () => {
    const items = getBuiltinSettingsNavItems(false, t);

    expect(items.map((item) => item.id)).toEqual([
      'agent',
      'model',
      'assistants',
      'capabilities',
      'display',
      'webui',
      'system',
    ]);

    expect(items.map((item) => item.label)).toEqual([
      'Agents',
      'Models',
      'Assistants',
      'Capabilities',
      'Display',
      'WebUI',
      'System',
    ]);
  });

  it('keeps the webui route stable for mobile and desktop nav variants', () => {
    expect(getBuiltinSettingsNavItems(false, t).find((item) => item.id === 'webui')?.path).toBe('webui');
    expect(getBuiltinSettingsNavItems(true, t).find((item) => item.id === 'webui')?.path).toBe('webui');
  });
});
