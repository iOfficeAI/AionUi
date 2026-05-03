import { describe, expect, it } from 'vitest';
import { buildSmokeTargets, buildCodexBridgeEnv, REPORT_PATH } from '../../scripts/aionui-wsl-acp-smoke';

describe('AionUi WSL ACP smoke harness', () => {
  it('defines additive WSL Claude/Codex targets without replacing native backend names', () => {
    const targets = buildSmokeTargets();

    expect(targets.map((target) => target.id)).toEqual(['claude-wsl', 'codex-wsl']);
    expect(targets[0]).toMatchObject({
      id: 'claude-wsl',
      label: 'Claude Code WSL via claude-agent-acp bridge',
      command: 'npx',
      args: ['@agentclientprotocol/claude-agent-acp@0.29.2'],
      env: expect.objectContaining({ CLAUDE_CODE_EXECUTABLE: 'C:\\AI_LAB\\bin\\claude-wsl.exe' }),
    });
    expect(targets[1]).toMatchObject({
      id: 'codex-wsl',
      label: 'Codex WSL via codex-acp bridge',
      command: 'npx',
      args: ['@zed-industries/codex-acp@0.9.5'],
    });
  });

  it('puts C:\\AI_LAB\\bin before Windows npm only for Codex WSL bridge tests', () => {
    const env = buildCodexBridgeEnv('C:\\Users\\Administrator\\AppData\\Roaming\\npm;C:\\Windows\\System32');

    expect(env.PATH?.startsWith('C:\\AI_LAB\\bin;C:\\Users\\Administrator\\AppData\\Roaming\\npm;')).toBe(true);
  });

  it('writes reports to the AI_LAB app handover area', () => {
    expect(REPORT_PATH).toBe('C:\\AI_LAB\\apps\\AionUi-WSL-ACP-Smoke-Report.md');
  });
});
