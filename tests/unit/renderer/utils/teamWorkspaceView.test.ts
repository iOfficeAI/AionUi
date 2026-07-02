import { describe, expect, it } from 'vitest';
import { resolveTeamWorkspaceView } from '@/renderer/pages/team/utils/teamWorkspaceView';

describe('resolveTeamWorkspaceView', () => {
  it('prefers teams.workspace over leader fallback', () => {
    const view = resolveTeamWorkspaceView('/project/app', '/tmp/leader');
    expect(view.workspacePath).toBe('/project/app');
    expect(view.workspaceEnabled).toBe(true);
    expect(view.isTemporaryWorkspace).toBe(false);
  });

  it('uses leader workspace only as display fallback for legacy empty teams.workspace', () => {
    const view = resolveTeamWorkspaceView('', '/tmp/aion/conversations/acp-temp-leader');
    expect(view.workspacePath).toBe('/tmp/aion/conversations/acp-temp-leader');
    expect(view.workspaceEnabled).toBe(true);
    expect(view.isTemporaryWorkspace).toBe(true);
  });

  it('marks Team-scoped temp workspace as temporary even when teams.workspace is non-empty', () => {
    const view = resolveTeamWorkspaceView('/tmp/aion/conversations/team-temp-team123', '');
    expect(view.workspacePath).toBe('/tmp/aion/conversations/team-temp-team123');
    expect(view.workspaceEnabled).toBe(true);
    expect(view.isTemporaryWorkspace).toBe(true);
  });

  it('marks per-conversation temp workspace as temporary for compatibility display', () => {
    const view = resolveTeamWorkspaceView('/tmp/aion/conversations/acp-temp-conv123', '');
    expect(view.isTemporaryWorkspace).toBe(true);
  });
});
