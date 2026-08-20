export const WORKSPACE_TOGGLE_EVENT = 'aionui-workspace-toggle';
export const WORKSPACE_OPEN_EVENT = 'aionui-workspace-open';
export const WORKSPACE_STATE_EVENT = 'aionui-workspace-state';
export const WORKSPACE_HAS_FILES_EVENT = 'aionui-workspace-has-files';
/** Requests the explorer sidebar to switch to the side-conversation tab. */
export const EXPLORER_SHOW_SIDE_EVENT = 'aionui-explorer-show-side';

export interface WorkspaceStateDetail {
  collapsed: boolean;
}

export interface WorkspaceHasFilesDetail {
  hasFiles: boolean;
  conversation_id?: string;
  /**
   * True when this signal corresponds to the workspace tree's first load for
   * this conversation. Lets listeners distinguish backend-seeded files
   * (rules/skills present from the start) from files that appear mid-session.
   *
   * Note: a fresh tree mount counts as initial — switching away from a
   * conversation and back will report `isInitial: true` again, so files added
   * while the conversation was unmounted are not detectable here.
   */
  isInitial: boolean;
}

/** Dispatch a workspace toggle request and report whether an enabled workspace handled it. */
export function dispatchWorkspaceToggleEvent(): boolean {
  if (typeof window === 'undefined') return false;
  const event = new CustomEvent(WORKSPACE_TOGGLE_EVENT, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Explicit-open request: expands the workspace / project panel if collapsed, but
 * never toggles a visible panel closed (unlike {@link dispatchWorkspaceToggleEvent}).
 */
export function dispatchWorkspaceOpenEvent(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_OPEN_EVENT));
}

/** Ask every mounted ExplorerContainer to switch to the side-conversation tab. */
export function dispatchExplorerShowSideEvent(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EXPLORER_SHOW_SIDE_EVENT));
}

export function dispatchWorkspaceStateEvent(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkspaceStateDetail>(WORKSPACE_STATE_EVENT, { detail: { collapsed } }));
}

/**
 * 当工作空间文件状态变化时触发
 * Dispatch when workspace files status changes
 */
export function dispatchWorkspaceHasFilesEvent(
  hasFiles: boolean,
  conversation_id: string | undefined,
  isInitial: boolean
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceHasFilesDetail>(WORKSPACE_HAS_FILES_EVENT, {
      detail: { hasFiles, conversation_id, isInitial },
    })
  );
}
