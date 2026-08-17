import { WORKSPACE_HEADER_HEIGHT } from '@/renderer/pages/conversation/utils/layoutCalc';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React from 'react';
import WorkspaceOpenButton from './WorkspaceOpenButton';

type WorkspaceHeaderProps = {
  children?: React.ReactNode;
  showToggle?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  togglePlacement?: 'left' | 'right';
  workspacePath?: string;
  /**
   * Authoritative temp-workspace flag from
   * `conversation.extra.is_temporary_workspace`. Passed straight through
   * to `WorkspaceOpenButton`, which hides for temp workspaces.
   */
  isTemporaryWorkspace?: boolean;
};

// Compact header bar for the workspace side panel with optional collapse toggle
const WorkspacePanelHeader: React.FC<WorkspaceHeaderProps> = ({
  children,
  showToggle = false,
  collapsed,
  onToggle,
  togglePlacement = 'right',
  workspacePath,
  isTemporaryWorkspace = false,
}) => (
  <div
    className='workspace-panel-header flex items-center justify-start px-12px py-4px gap-12px border-b border-[var(--bg-3)]'
    style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}
  >
    {showToggle && togglePlacement === 'left' && (
      <button
        type='button'
        className='workspace-header__toggle me-4px'
        aria-label='Toggle workspace'
        onClick={onToggle}
      >
        {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
      </button>
    )}
    <div className='flex-1 truncate'>{children}</div>

    {/* Open workspace button - shown when workspace path is provided */}
    {workspacePath && !collapsed && (
      <WorkspaceOpenButton workspacePath={workspacePath} isTemporary={isTemporaryWorkspace} />
    )}

    {showToggle && togglePlacement === 'right' && (
      <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={onToggle}>
        {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
      </button>
    )}
  </div>
);

export default WorkspacePanelHeader;
