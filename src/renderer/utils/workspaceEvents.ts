export const WORKSPACE_TOGGLE_EVENT = 'aionui-workspace-toggle';
export const WORKSPACE_STATE_EVENT = 'aionui-workspace-state';

export interface WorkspaceStateDetail {
  collapsed: boolean;
}

export function dispatchWorkspaceToggleEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_TOGGLE_EVENT));
}

export function dispatchWorkspaceStateEvent(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkspaceStateDetail>(WORKSPACE_STATE_EVENT, { detail: { collapsed } }));
}
