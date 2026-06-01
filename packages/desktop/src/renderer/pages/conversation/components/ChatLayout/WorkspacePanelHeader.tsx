import { WORKSPACE_HEADER_HEIGHT } from '@/renderer/pages/conversation/utils/layoutCalc';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { ExpandLeft, ExpandRight, Right } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
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
  /** Phase 10 — Path C: project name displayed as the workspace header title. */
  projectName?: string;
  /** Phase 10 — Path C: file-change count rendered under the project name. */
  changeCount?: number;
};

const WorkspacePanelHeader: React.FC<WorkspaceHeaderProps> = ({
  children,
  showToggle = false,
  collapsed,
  onToggle,
  togglePlacement = 'right',
  workspacePath,
  isTemporaryWorkspace = false,
  projectName,
  changeCount,
}) => {
  const { t } = useTranslation();
  const hasReframe = Boolean(projectName);
  const filesLabel =
    changeCount === undefined
      ? ''
      : changeCount === 1
        ? t('conversation.workspace.fileCount', { defaultValue: '1 file' })
        : t('conversation.workspace.filesCount', {
            count: changeCount,
            defaultValue: '{{count}} files',
          });

  return (
    <div
      className='workspace-panel-header flex items-center justify-start px-12px gap-12px border-b border-b-light'
      style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}
    >
      {showToggle && togglePlacement === 'left' && (
        <button
          type='button'
          className='workspace-header__toggle mr-4px'
          aria-label='Toggle workspace'
          onClick={onToggle}
        >
          {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
        </button>
      )}
      {hasReframe ? (
        <div className='flex-1 min-w-0 flex flex-col justify-center leading-tight'>
          <span className='text-t-primary text-sm font-medium truncate' title={projectName}>
            {projectName}
          </span>
          {filesLabel && <span className='text-t-tertiary text-xs truncate'>{filesLabel}</span>}
        </div>
      ) : (
        <div className='flex-1 truncate'>{children}</div>
      )}

      {/* Open workspace button - shown when workspace path is provided */}
      {workspacePath && !collapsed && (
        <WorkspaceOpenButton workspacePath={workspacePath} isTemporary={isTemporaryWorkspace} />
      )}

      {hasReframe && !collapsed ? (
        <button
          type='button'
          className='workspace-header__toggle'
          aria-label={t('conversation.workspace.collapse', { defaultValue: 'Collapse workspace' })}
          onClick={onToggle}
        >
          <Right size={16} />
        </button>
      ) : (
        showToggle &&
        togglePlacement === 'right' && (
          <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={onToggle}>
            {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
          </button>
        )
      )}
    </div>
  );
};

// Small floating button shown when the workspace panel is collapsed on desktop
export const DesktopWorkspaceToggle: React.FC = () => (
  <button
    type='button'
    className='workspace-toggle-floating workspace-header__toggle absolute top-1/2 right-2 z-10'
    style={{ transform: 'translateY(-50%)' }}
    onClick={() => dispatchWorkspaceToggleEvent()}
    aria-label='Expand workspace'
  >
    <ExpandLeft size={16} />
  </button>
);

export default WorkspacePanelHeader;
