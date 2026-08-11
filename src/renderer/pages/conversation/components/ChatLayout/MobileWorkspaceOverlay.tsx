import WorkspacePanelHeader from './WorkspacePanelHeader';
import { WORKSPACE_HEADER_HEIGHT } from '@/renderer/pages/conversation/utils/layoutCalc';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import React from 'react';

type MobileWorkspaceOverlayProps = {
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: (collapsed: boolean) => void;
  workspaceWidthPx: number;
  mobileWorkspaceHandleRight: number;
  siderTitle?: React.ReactNode;
  sider: React.ReactNode;
  workspacePath?: string;
};

// Full-screen overlay + fixed workspace panel + floating collapse handle for mobile viewports
const MobileWorkspaceOverlay: React.FC<MobileWorkspaceOverlayProps> = ({
  rightSiderCollapsed,
  setRightSiderCollapsed,
  workspaceWidthPx,
  mobileWorkspaceHandleRight,
  siderTitle,
  sider,
  workspacePath,
}) => (
  <>
    {/* Backdrop */}
    {!rightSiderCollapsed && (
      <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setRightSiderCollapsed(true)} aria-hidden='true' />
    )}

    {/* Fixed workspace panel */}
    <div
      className='!bg-1 relative chat-layout-right-sider'
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        height: '100vh',
        width: `${Math.round(workspaceWidthPx)}px`,
        zIndex: 100,
        transform: rightSiderCollapsed ? 'translateX(100%)' : 'translateX(0)',
        transition: 'none',
        pointerEvents: rightSiderCollapsed ? 'none' : 'auto',
      }}
    >
      <WorkspacePanelHeader
        showToggle
        collapsed={rightSiderCollapsed}
        onToggle={() => dispatchWorkspaceToggleEvent()}
        togglePlacement='left'
        workspacePath={workspacePath}
      >
        {siderTitle}
      </WorkspacePanelHeader>
      <ArcoLayout.Content className='bg-1' style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
        {sider}
      </ArcoLayout.Content>
    </div>

    {/* Floating collapse handle */}
    {!rightSiderCollapsed && (
      <button
        type='button'
        className='fixed z-101 flex items-center justify-center transition-colors workspace-toggle-floating'
        style={{
          top: '50%',
          right: `${mobileWorkspaceHandleRight}px`,
          transform: 'translateY(-50%)',
          width: '20px',
          height: '64px',
          borderTopLeftRadius: '10px',
          borderBottomLeftRadius: '10px',
          borderTopRightRadius: '0',
          borderBottomRightRadius: '0',
          borderRight: 'none',
          backgroundColor: 'var(--bg-2)',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
        }}
        onClick={() => dispatchWorkspaceToggleEvent()}
        aria-label='Collapse workspace'
      >
        <span className='flex flex-col items-center justify-center gap-5px text-t-secondary'>
          <span className='block w-8px h-2px rd-999px bg-current opacity-85'></span>
          <span className='block w-8px h-2px rd-999px bg-current opacity-65'></span>
          <span className='block w-8px h-2px rd-999px bg-current opacity-45'></span>
        </span>
      </button>
    )}
  </>
);

export default MobileWorkspaceOverlay;
