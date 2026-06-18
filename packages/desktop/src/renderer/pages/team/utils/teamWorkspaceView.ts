export type TeamWorkspaceView = {
  workspacePath: string;
  workspaceEnabled: boolean;
  isTemporaryWorkspace: boolean;
};

const TEMP_WORKSPACE_PATTERN = /(?:^|[/\\])conversations[/\\](?:team-temp-|[^/\\]+-temp-)[^/\\]*$/;

function cleanWorkspace(value?: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isTemporaryTeamWorkspacePath(workspacePath: string): boolean {
  return TEMP_WORKSPACE_PATTERN.test(workspacePath);
}

export function resolveTeamWorkspaceView(teamWorkspace?: string, leaderWorkspace?: string): TeamWorkspaceView {
  const normalizedTeamWorkspace = cleanWorkspace(teamWorkspace);
  const normalizedLeaderWorkspace = cleanWorkspace(leaderWorkspace);
  const workspacePath = normalizedTeamWorkspace || normalizedLeaderWorkspace;
  return {
    workspacePath,
    workspaceEnabled: workspacePath.length > 0,
    isTemporaryWorkspace: !normalizedTeamWorkspace || isTemporaryTeamWorkspacePath(normalizedTeamWorkspace),
  };
}
