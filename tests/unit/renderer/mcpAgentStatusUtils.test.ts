import { describe, expect, it } from 'vitest';

import { isDisplayableMcpAgentSource, sanitizeMcpAgentInstallStatus } from '@/renderer/hooks/mcp/mcpAgentStatusUtils';

describe('mcpAgentStatusUtils', () => {
  it('hides the internal aionui config source from install status', () => {
    expect(isDisplayableMcpAgentSource('aionui')).toBe(false);
    expect(isDisplayableMcpAgentSource('AionUi')).toBe(false);
    expect(isDisplayableMcpAgentSource('claude')).toBe(true);
  });

  it('removes aionui from cached agent install status', () => {
    expect(
      sanitizeMcpAgentInstallStatus({
        'chrome-devtools': ['claude', 'aionui', 'codex'],
        'db-only-server': ['aionui'],
      })
    ).toEqual({
      'chrome-devtools': ['claude', 'codex'],
    });
  });
});
