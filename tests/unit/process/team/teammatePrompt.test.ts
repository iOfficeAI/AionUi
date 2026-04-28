import { describe, expect, it } from 'vitest';
import { buildTeammatePrompt } from '@process/team/prompts/teammatePrompt';
import type { TeamAgent } from '@process/team/types';

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'slot-1',
    conversationId: 'conv-1',
    role: 'teammate',
    agentType: 'gemini',
    agentName: 'Researcher',
    conversationType: 'gemini',
    status: 'idle',
    ...overrides,
  };
}

describe('buildTeammatePrompt', () => {
  it('keeps greeting replies friendly and focused on role introduction', () => {
    const prompt = buildTeammatePrompt({
      agent: makeAgent(),
      leader: makeAgent({ slotId: 'slot-lead', role: 'leader', agentName: 'Leader', agentType: 'claude' }),
      teammates: [],
      assignedTasks: [],
      unreadMessages: [],
    });

    expect(prompt).toContain('If the user greets you, starts a new chat, or asks what you can do');
    expect(prompt).toContain('Briefly introduce yourself and your role on the team');
    expect(prompt).toContain('invite the user to share what they need');
    expect(prompt).toContain('Do NOT open with task board details, idle/waiting status, or coordination mechanics');
  });

  it('uses platform-safe execution guidance for Windows Office work', () => {
    const prompt = buildTeammatePrompt({
      agent: makeAgent({ agentName: 'Word Producer', agentType: 'aionrs' }),
      leader: makeAgent({ slotId: 'slot-lead', role: 'leader', agentName: 'Leader', agentType: 'claude' }),
      teammates: [],
      assignedTasks: [],
      unreadMessages: [],
      teamWorkspace: 'C:\\Users\\Craig\\AionUI Workspaces\\Test 4',
    });

    expect(prompt).not.toContain('Use your native tools (Read, Write, Bash, etc.) for implementation work');
    expect(prompt).toContain('Use available native tools for implementation work');
    expect(prompt).toContain('match shell commands to the workspace platform');
    expect(prompt).toContain('For Windows paths such as `C:\\...`, use `powershell.exe` or `cmd.exe`');
    expect(prompt).toContain('Do not use `/usr/bin/bash`, `/mnt/c`, WSL paths');
    expect(prompt).toContain('For Windows Office artifacts, use the approved Office tool path');
    expect(prompt).toContain('If only Linux Bash is exposed for Windows Office mutation, return blocked');
    expect(prompt).toContain('Concrete instructions from the Leader handoff beat stale task-board state');
  });
});
