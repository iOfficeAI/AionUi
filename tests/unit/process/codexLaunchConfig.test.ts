import { describe, expect, it } from 'vitest';
import {
  applyCodexLaunchOptions,
  getCodexConfigPath,
  parseCodexApprovalPolicy,
} from '../../../src/process/agent/codex/connection/codexLaunchConfig';

describe('codexLaunchConfig', () => {
  it('prefers CODEX_HOME when resolving the config path and appends launch overrides', () => {
    const configPath = getCodexConfigPath(
      {
        CODEX_HOME: 'E:/codex-home',
      } as NodeJS.ProcessEnv,
      'E:/users/demo'
    );
    const args = applyCodexLaunchOptions(
      ['mcp-server'],
      {
        sandboxMode: 'danger-full-access',
      },
      'on-request'
    );

    expect(configPath).toBe('E:\\codex-home\\config.toml');
    expect(args).toEqual(['mcp-server', '-c', 'approval_policy=on-request', '-c', 'sandbox_mode="danger-full-access"']);
  });

  it('returns null when approval policy is absent and skips duplicate never policies', () => {
    expect(parseCodexApprovalPolicy('[profiles.default]\nsandbox_mode = "workspace-write"\n')).toBeNull();
    expect(applyCodexLaunchOptions(['mcp-server'], {}, 'never')).toEqual(['mcp-server']);
    expect(applyCodexLaunchOptions(['mcp-server'], { yoloMode: true }, 'on-request')).toEqual([
      'mcp-server',
      '-c',
      'approval_policy=never',
    ]);
  });
});
