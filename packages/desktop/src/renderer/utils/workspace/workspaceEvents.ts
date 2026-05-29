export const WORKSPACE_TOGGLE_EVENT = 'aionui-workspace-toggle';
export const WORKSPACE_STATE_EVENT = 'aionui-workspace-state';
export const WORKSPACE_HAS_FILES_EVENT = 'aionui-workspace-has-files';
export const WORKSPACE_HAS_TODOS_EVENT = 'aionui-workspace-has-todos';
export const WORKSPACE_HAS_APPROVALS_EVENT = 'aionui-workspace-has-approvals';

export interface WorkspaceStateDetail {
  collapsed: boolean;
}

export interface WorkspaceHasFilesDetail {
  hasFiles: boolean;
  conversation_id?: string;
  isInitial: boolean;
}

export interface WorkspaceHasTodosDetail {
  hasTodos: boolean;
  conversation_id?: string;
}

export interface WorkspaceHasApprovalsDetail {
  hasApprovals: boolean;
  conversation_id?: string;
}

export function dispatchWorkspaceToggleEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_TOGGLE_EVENT));
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

export function dispatchWorkspaceHasTodosEvent(hasTodos: boolean, conversation_id: string | undefined) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceHasTodosDetail>(WORKSPACE_HAS_TODOS_EVENT, {
      detail: { hasTodos, conversation_id },
    })
  );
}

/**
 * Dispatch when the conversation's pending-approvals status changes, so the
 * collapsed workspace pane can auto-expand to surface the Approvals tab.
 */
export function dispatchWorkspaceHasApprovalsEvent(hasApprovals: boolean, conversation_id: string | undefined) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceHasApprovalsDetail>(WORKSPACE_HAS_APPROVALS_EVENT, {
      detail: { hasApprovals, conversation_id },
    })
  );
}
