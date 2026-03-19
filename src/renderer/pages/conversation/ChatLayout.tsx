import { ConfigStorage } from '@/common/storage';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import ConversationTabs from '@/renderer/pages/conversation/ConversationTabs';
import { useConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import { useContainerWidth } from '@/renderer/pages/conversation/hooks/useContainerWidth';
import { useLayoutConstraints } from '@/renderer/pages/conversation/hooks/useLayoutConstraints';
import { usePreviewAutoCollapse } from '@/renderer/pages/conversation/hooks/usePreviewAutoCollapse';
import { useTitleRename } from '@/renderer/pages/conversation/hooks/useTitleRename';
import { useWorkspaceCollapse } from '@/renderer/pages/conversation/hooks/useWorkspaceCollapse';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/preview';
import ConversationTitleMinimap from '@/renderer/pages/conversation/components/ConversationTitleMinimap';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';
import { isMacEnvironment, isWindowsEnvironment } from '@/renderer/pages/conversation/utils/detectPlatform';
import {
  MIN_WORKSPACE_RATIO,
  WORKSPACE_HEADER_HEIGHT,
  calcLayoutMetrics,
} from '@/renderer/pages/conversation/utils/layoutCalc';
import { Input, Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import './chat-layout.css';

type WorkspaceHeaderProps = {
  children?: React.ReactNode;
  showToggle?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  togglePlacement?: 'left' | 'right';
};

const WorkspacePanelHeader: React.FC<WorkspaceHeaderProps> = ({
  children,
  showToggle = false,
  collapsed,
  onToggle,
  togglePlacement = 'right',
}) => (
  <div
    className='workspace-panel-header flex items-center justify-start px-12px py-4px gap-12px border-b border-[var(--bg-3)]'
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
    <div className='flex-1 truncate'>{children}</div>
    {showToggle && togglePlacement === 'right' && (
      <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={onToggle}>
        {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
      </button>
    )}
  </div>
);

// headerExtra allows injecting custom actions (e.g., model picker) into the header's right area
const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
  agentName?: string;
  /** Custom agent logo (can be SVG path or emoji string) */
  agentLogo?: string;
  /** Whether the logo is an emoji */
  agentLogoIsEmoji?: boolean;
  headerExtra?: React.ReactNode;
  headerLeft?: React.ReactNode;
  workspaceEnabled?: boolean;
  /** Conversation ID for mode switching */
  conversationId?: string;
}> = (props) => {
  const { t } = useTranslation();
  const { conversationId } = props;
  const { backend, agentName, agentLogo, agentLogoIsEmoji, workspaceEnabled = true } = props;
  const layout = useLayoutContext();
  const isMacRuntime = isMacEnvironment();
  const isWindowsRuntime = isWindowsEnvironment();
  const isDesktop = !layout?.isMobile;
  const isMobile = Boolean(layout?.isMobile);

  // Preview panel state
  const { isOpen: isPreviewOpen } = usePreviewContext();

  // --- Hook A: workspace collapse ---
  const { rightSiderCollapsed, setRightSiderCollapsed } = useWorkspaceCollapse({
    workspaceEnabled,
    isMobile,
    conversationId,
  });

  // --- Hook B: container width ---
  const { containerRef, containerWidth } = useContainerWidth();

  // --- Hook C: title rename ---
  const { openTabs, updateTabName } = useConversationTabs();
  const hasTabs = openTabs.length > 0;

  const { editingTitle, setEditingTitle, titleDraft, setTitleDraft, renameLoading, canRenameTitle, submitTitleRename } =
    useTitleRename({
      title: props.title,
      conversationId,
      updateTabName,
    });

  // Fetch custom agents config as fallback when agentName is not provided
  const { data: customAgents } = useSWR(backend === 'custom' && !agentName ? 'acp.customAgents' : null, () =>
    ConfigStorage.get('acp.customAgents')
  );

  // Compute display name with fallback chain (use first custom agent as fallback for backward compatibility)
  const displayName =
    agentName ||
    (backend === 'custom' && customAgents?.[0]?.name) ||
    ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name ||
    backend;

  const {
    splitRatio: workspaceSplitRatio,
    setSplitRatio: setWorkspaceSplitRatio,
    createDragHandle: createWorkspaceDragHandle,
  } = useResizableSplit({
    defaultWidth: 20,
    minWidth: MIN_WORKSPACE_RATIO,
    maxWidth: 40,
    storageKey: 'chat-workspace-split-ratio',
  });

  // Pre-hook metrics: compute dynamic min/max for the chat-preview split hook
  const { dynamicChatMinRatio, dynamicChatMaxRatio } = calcLayoutMetrics({
    containerWidth,
    workspaceSplitRatio,
    chatSplitRatio: 60, // placeholder; only dynamicChatMinRatio/dynamicChatMaxRatio are used here
    workspaceEnabled,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    isMobile,
  });

  const {
    splitRatio: chatSplitRatio,
    setSplitRatio: setChatSplitRatio,
    createDragHandle: createPreviewDragHandle,
  } = useResizableSplit({
    defaultWidth: 60,
    minWidth: dynamicChatMinRatio,
    maxWidth: dynamicChatMaxRatio,
    storageKey: 'chat-preview-split-ratio',
  });

  // Full metrics with real chatSplitRatio
  const {
    chatFlex,
    workspaceFlex,
    workspaceWidthPx,
    titleAreaMaxWidth,
    mobileWorkspaceHandleRight,
    showDesktopWorkspaceSidebar,
    desktopWorkspaceSidebarWidth,
  } = calcLayoutMetrics({
    containerWidth,
    workspaceSplitRatio,
    chatSplitRatio,
    workspaceEnabled,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    isMobile,
  });

  // --- Hook D: preview auto-collapse ---
  usePreviewAutoCollapse({
    isPreviewOpen,
    isDesktop,
    workspaceEnabled,
    rightSiderCollapsed,
    setRightSiderCollapsed,
    siderCollapsed: layout?.siderCollapsed,
    setSiderCollapsed: layout?.setSiderCollapsed,
  });

  // --- Hook E: layout constraints ---
  useLayoutConstraints({
    containerWidth,
    workspaceEnabled,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    setRightSiderCollapsed,
    workspaceSplitRatio,
    setWorkspaceSplitRatio,
    chatSplitRatio,
    setChatSplitRatio,
    dynamicChatMinRatio,
    dynamicChatMaxRatio,
  });

  const headerBlock = (
    <>
      <ConversationTabs />
      <ArcoLayout.Header
        className={classNames(
          'min-h-44px flex items-center justify-between px-16px pt-8px pb-10px gap-16px !bg-1 chat-layout-header chat-layout-header--glass overflow-hidden',
          layout?.isMobile && 'chat-layout-header--mobile-unified'
        )}
      >
        <div className='shrink-0'>{props.headerLeft}</div>
        <FlexFullContainer className='h-full min-w-0' containerClassName='flex items-center gap-16px'>
          {!layout?.isMobile && !hasTabs && (
            <div
              className={classNames(
                'group flex min-w-0 max-w-full items-center rounded-12px border border-solid border-transparent transition-all duration-180',
                editingTitle
                  ? 'bg-fill-2 border-[var(--color-fill-3)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                  : 'hover:bg-fill-2 hover:border-[var(--color-fill-3)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)] focus-within:bg-fill-2 focus-within:border-[var(--color-fill-3)] focus-within:shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
              )}
              style={{ width: '100%', maxWidth: `${titleAreaMaxWidth}px` }}
            >
              <div className='min-w-0 flex-1 px-10px py-5px'>
                {editingTitle && canRenameTitle ? (
                  <Input
                    autoFocus
                    value={titleDraft}
                    disabled={renameLoading}
                    className='w-full min-w-0 max-w-full border-none bg-transparent shadow-none [&_.arco-input-inner-wrapper]:border-none [&_.arco-input-inner-wrapper]:bg-transparent [&_.arco-input-inner-wrapper]:shadow-none [&_.arco-input]:bg-transparent [&_.arco-input]:px-0 [&_.arco-input]:text-16px [&_.arco-input]:font-700 [&_.arco-input]:leading-24px [&_.arco-input]:text-[var(--color-text-1)]'
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                    }}
                    maxLength={120}
                    onChange={setTitleDraft}
                    onFocus={(event) => {
                      event.target.select();
                    }}
                    onPressEnter={() => {
                      void submitTitleRename();
                    }}
                    onBlur={() => {
                      void submitTitleRename();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setTitleDraft(typeof props.title === 'string' ? props.title : '');
                        setEditingTitle(false);
                      }
                    }}
                    placeholder={t('conversation.history.renamePlaceholder')}
                    size='default'
                  />
                ) : (
                  <span
                    role={canRenameTitle ? 'button' : undefined}
                    tabIndex={canRenameTitle ? 0 : undefined}
                    className={classNames(
                      'block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-16px font-bold text-t-primary transition-colors duration-150',
                      canRenameTitle &&
                        'cursor-text group-hover:text-[rgb(var(--primary-6))] group-focus-within:text-[rgb(var(--primary-6))] focus:outline-none'
                    )}
                    onClick={() => {
                      if (!canRenameTitle) return;
                      setEditingTitle(true);
                    }}
                    onKeyDown={(event) => {
                      if (!canRenameTitle) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setEditingTitle(true);
                      }
                    }}
                  >
                    {props.title}
                  </span>
                )}
              </div>
              {!editingTitle && (
                <div className='w-0 flex items-center overflow-hidden opacity-0 transition-all duration-180 group-hover:w-40px group-hover:opacity-100 group-focus-within:w-40px group-focus-within:opacity-100'>
                  <span className='h-16px w-1px shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--color-text-4)_44%,transparent)]' />
                  <div className='ml-4px mr-4px flex items-center justify-center'>
                    <ConversationTitleMinimap conversationId={conversationId} />
                  </div>
                </div>
              )}
            </div>
          )}
        </FlexFullContainer>
        <div className='flex items-center gap-12px shrink-0'>
          {props.headerExtra}
          {(backend || agentLogo) && (
            <AgentModeSelector
              backend={backend}
              agentName={displayName}
              agentLogo={agentLogo}
              agentLogoIsEmoji={agentLogoIsEmoji}
              compact={Boolean(layout?.isMobile)}
              showLogoInCompact={Boolean(layout?.isMobile)}
              compactLabelType={layout?.isMobile ? 'agent' : 'mode'}
            />
          )}
          {isWindowsRuntime && workspaceEnabled && (
            <button
              type='button'
              className='workspace-header__toggle'
              aria-label='Toggle workspace'
              onClick={() => dispatchWorkspaceToggleEvent()}
            >
              {rightSiderCollapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
            </button>
          )}
        </div>
      </ArcoLayout.Header>
    </>
  );

  // When preview is open on desktop, keep chat+preview below the header.
  const useHeaderFullWidth = isPreviewOpen && isDesktop;

  return (
    <ArcoLayout
      className='size-full color-black '
      style={
        {
          // fontFamily: `cursive,"anthropicSans","anthropicSans Fallback",system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif`,
        }
      }
    >
      <div
        ref={containerRef}
        className={classNames('flex flex-1 relative w-full overflow-hidden', useHeaderFullWidth && 'flex-col')}
      >
        {useHeaderFullWidth ? (
          <>
            {showDesktopWorkspaceSidebar ? (
              <div className='flex flex-1 min-h-0 relative'>
                <div className='flex flex-col flex-1 min-w-0'>
                  <div className='flex shrink-0 !bg-1'>
                    <div className='flex-1 min-w-0'>{headerBlock}</div>
                  </div>
                  <div className='flex flex-1 min-h-0 relative'>
                    <div
                      className='flex flex-col relative'
                      style={{ flexGrow: 0, flexShrink: 0, flexBasis: `${chatFlex}%`, minWidth: '240px' }}
                      onClick={() => layout?.isMobile && !rightSiderCollapsed && setRightSiderCollapsed(true)}
                    >
                      <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>
                        {props.children}
                      </ArcoLayout.Content>
                    </div>
                    <div
                      className='preview-panel flex flex-col relative overflow-visible mt-[6px] mb-[12px] mr-[12px] ml-[8px] rounded-[15px]'
                      style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        flexBasis: 0,
                        border: '1px solid var(--bg-3)',
                        minWidth: '260px',
                      }}
                    >
                      {createPreviewDragHandle({
                        className: 'absolute top-0 bottom-0 z-30',
                        style: { width: '20px', left: '-20px' },
                        linePlacement: 'end',
                        lineClassName: 'opacity-30 group-hover:opacity-100 group-active:opacity-100',
                        lineStyle: { width: '2px' },
                      })}
                      <div className='h-full w-full overflow-hidden rounded-[15px]'>
                        <PreviewPanel />
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  className={classNames('!bg-1 relative chat-layout-right-sider layout-sider')}
                  style={{
                    flexGrow: 0,
                    flexShrink: 0,
                    flexBasis: rightSiderCollapsed ? '0px' : `${desktopWorkspaceSidebarWidth}px`,
                    width: rightSiderCollapsed ? '0px' : `${desktopWorkspaceSidebarWidth}px`,
                    minWidth: rightSiderCollapsed ? '0px' : '220px',
                    overflow: 'hidden',
                    borderLeft: rightSiderCollapsed ? 'none' : '1px solid var(--bg-3)',
                  }}
                >
                  {!rightSiderCollapsed &&
                    createWorkspaceDragHandle({
                      className: 'absolute left-0 top-0 bottom-0',
                      style: {},
                      reverse: true,
                    })}
                  <WorkspacePanelHeader
                    showToggle={!isMacRuntime && !isWindowsRuntime}
                    collapsed={rightSiderCollapsed}
                    onToggle={() => dispatchWorkspaceToggleEvent()}
                    togglePlacement='right'
                  >
                    {props.siderTitle}
                  </WorkspacePanelHeader>
                  <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
                    {props.sider}
                  </ArcoLayout.Content>
                </div>
              </div>
            ) : (
              <>
                <div className='flex shrink-0 !bg-1'>
                  <div className='flex-1 min-w-0'>{headerBlock}</div>
                </div>
                <div className='flex flex-1 min-h-0 relative'>
                  <div
                    className='flex flex-col relative'
                    style={{ flexGrow: 0, flexShrink: 0, flexBasis: `${chatFlex}%`, minWidth: '240px' }}
                    onClick={() => layout?.isMobile && !rightSiderCollapsed && setRightSiderCollapsed(true)}
                  >
                    <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>
                      {props.children}
                    </ArcoLayout.Content>
                  </div>
                  <div
                    className='preview-panel flex flex-col relative overflow-visible mt-[6px] mb-[12px] mr-[12px] ml-[8px] rounded-[15px]'
                    style={{
                      flexGrow: 1,
                      flexShrink: 1,
                      flexBasis: 0,
                      border: '1px solid var(--bg-3)',
                      minWidth: '260px',
                    }}
                  >
                    {createPreviewDragHandle({
                      className: 'absolute top-0 bottom-0 z-30',
                      style: { width: '20px', left: '-20px' },
                      linePlacement: 'end',
                      lineClassName: 'opacity-30 group-hover:opacity-100 group-active:opacity-100',
                      lineStyle: { width: '2px' },
                    })}
                    <div className='h-full w-full overflow-hidden rounded-[15px]'>
                      <PreviewPanel />
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div
              className='flex flex-col relative'
              style={{
                flexGrow: isPreviewOpen && isDesktop ? 0 : chatFlex,
                flexShrink: 0,
                flexBasis: isPreviewOpen && isDesktop ? `${chatFlex}%` : 0,
                display: isPreviewOpen && layout?.isMobile ? 'none' : 'flex',
                minWidth: isDesktop ? '240px' : '100%',
              }}
            >
              <ArcoLayout.Content
                className='flex flex-col h-full'
                onClick={() => {
                  if (window.innerWidth < 768 && !rightSiderCollapsed) setRightSiderCollapsed(true);
                }}
              >
                {headerBlock}
                <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>
                  {props.children}
                </ArcoLayout.Content>
              </ArcoLayout.Content>
            </div>
            {isPreviewOpen && (
              <div
                className={classNames(
                  'preview-panel flex flex-col relative overflow-visible rounded-[15px]',
                  layout?.isMobile ? 'm-[8px]' : 'my-[12px] mr-[12px] ml-[8px]'
                )}
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  border: '1px solid var(--bg-3)',
                  width: layout?.isMobile ? 'calc(100% - 16px)' : undefined,
                  maxWidth: layout?.isMobile ? 'calc(100% - 16px)' : undefined,
                  minWidth: layout?.isMobile ? 0 : '260px',
                  boxSizing: 'border-box',
                }}
              >
                {!layout?.isMobile &&
                  createPreviewDragHandle({
                    className: 'absolute top-0 bottom-0 z-30',
                    style: { width: '20px', left: '-20px' },
                    linePlacement: 'end',
                    lineClassName: 'opacity-30 group-hover:opacity-100 group-active:opacity-100',
                    lineStyle: { width: '2px' },
                  })}
                <div className='h-full w-full overflow-hidden rounded-[15px]'>
                  <PreviewPanel />
                </div>
              </div>
            )}
            {workspaceEnabled && !layout?.isMobile && (
              <div
                className={classNames('!bg-1 relative chat-layout-right-sider layout-sider')}
                style={{
                  flexGrow: isPreviewOpen ? 0 : workspaceFlex,
                  flexShrink: 0,
                  flexBasis: rightSiderCollapsed ? '0px' : isPreviewOpen ? `${Math.round(workspaceWidthPx)}px` : 0,
                  width: rightSiderCollapsed ? '0px' : isPreviewOpen ? `${Math.round(workspaceWidthPx)}px` : undefined,
                  minWidth: rightSiderCollapsed ? '0px' : '220px',
                  overflow: 'hidden',
                  borderLeft: rightSiderCollapsed ? 'none' : '1px solid var(--bg-3)',
                }}
              >
                {isDesktop &&
                  !rightSiderCollapsed &&
                  createWorkspaceDragHandle({ className: 'absolute left-0 top-0 bottom-0', style: {}, reverse: true })}
                <WorkspacePanelHeader
                  showToggle={!isMacRuntime && !isWindowsRuntime}
                  collapsed={rightSiderCollapsed}
                  onToggle={() => dispatchWorkspaceToggleEvent()}
                  togglePlacement={layout?.isMobile ? 'left' : 'right'}
                >
                  {props.siderTitle}
                </WorkspacePanelHeader>
                <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
                  {props.sider}
                </ArcoLayout.Content>
              </div>
            )}
          </>
        )}

        {/* Mobile workspace backdrop */}
        {workspaceEnabled && layout?.isMobile && !rightSiderCollapsed && (
          <div
            className='fixed inset-0 bg-black/30 z-90'
            onClick={() => setRightSiderCollapsed(true)}
            aria-hidden='true'
          />
        )}

        {/* Mobile workspace (keep original fixed positioning) */}
        {workspaceEnabled && layout?.isMobile && (
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
            >
              {props.siderTitle}
            </WorkspacePanelHeader>
            <ArcoLayout.Content className='bg-1' style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
              {props.sider}
            </ArcoLayout.Content>
          </div>
        )}

        {workspaceEnabled && layout?.isMobile && !rightSiderCollapsed && (
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

        {!isMacRuntime && !isWindowsRuntime && workspaceEnabled && rightSiderCollapsed && !layout?.isMobile && (
          <button
            type='button'
            className='workspace-toggle-floating workspace-header__toggle absolute top-1/2 right-2 z-10'
            style={{ transform: 'translateY(-50%)' }}
            onClick={() => dispatchWorkspaceToggleEvent()}
            aria-label='Expand workspace'
          >
            <ExpandLeft size={16} />
          </button>
        )}
      </div>
    </ArcoLayout>
  );
};

export default ChatLayout;
