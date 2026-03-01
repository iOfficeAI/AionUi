import { ConfigStorage } from '@/common/storage';
import { STORAGE_KEYS } from '@/common/storageKeys';
import AgentModeSelector from '@/renderer/components/AgentModeSelector';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { useResizableSplit } from '@/renderer/hooks/useResizableSplit';
import ConversationTabs from '@/renderer/pages/conversation/ConversationTabs';
import { useConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/preview';
import { blurActiveElement } from '@/renderer/utils/focus';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { WORKSPACE_HAS_FILES_EVENT, WORKSPACE_TOGGLE_EVENT, dispatchWorkspaceStateEvent, dispatchWorkspaceToggleEvent, type WorkspaceHasFilesDetail } from '@/renderer/utils/workspaceEvents';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';
import { isElectronDesktop } from '@/renderer/utils/platform';

const MIN_CHAT_RATIO = 25;
const MIN_WORKSPACE_RATIO = 12;
const MIN_PREVIEW_RATIO = 20;
const WORKSPACE_HEADER_HEIGHT = 32;

const detectMobileViewportOrTouch = () => {
  if (typeof window === 'undefined') return false;
  if (isElectronDesktop()) {
    return window.innerWidth < 768;
  }
  const width = window.innerWidth;
  const byWidth = width < 768;
  const smallScreen = width < 1024;
  const byMedia = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
  const byTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return byWidth || (smallScreen && (byMedia || byTouchPoints));
};

const isMacEnvironment = () => {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.userAgent);
};

const isWindowsEnvironment = () => {
  if (typeof navigator === 'undefined') return false;
  return /win/i.test(navigator.userAgent);
};

interface WorkspaceHeaderProps {
  children?: React.ReactNode;
  showToggle?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  togglePlacement?: 'left' | 'right';
}

const WorkspacePanelHeader: React.FC<WorkspaceHeaderProps> = ({ children, showToggle = false, collapsed, onToggle, togglePlacement = 'right' }) => (
  <div className='workspace-panel-header flex items-center justify-start px-12px py-4px gap-12px border-b border-[var(--bg-3)]' style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}>
    {showToggle && togglePlacement === 'left' && (
      <button type='button' className='workspace-header__toggle mr-4px' aria-label='Toggle workspace' onClick={onToggle}>
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

// headerExtra 用于在会话头部右侧插入自定义操作（如模型选择）
// headerExtra allows injecting custom actions (e.g., model picker) into the header's right area
const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
  agentName?: string;
  /** 自定义 agent logo（可以是 SVG 路径或 emoji 字符串）/ Custom agent logo (can be SVG path or emoji string) */
  agentLogo?: string;
  /** 是否为 emoji 类型的 logo / Whether the logo is an emoji */
  agentLogoIsEmoji?: boolean;
  headerExtra?: React.ReactNode;
  headerLeft?: React.ReactNode;
  workspaceEnabled?: boolean;
  /** 会话 ID，用于模式切换 / Conversation ID for mode switching */
  conversationId?: string;
}> = (props) => {
  const { conversationId } = props;
  // 工作空间面板折叠状态 - 全局持久化
  // Workspace panel collapse state - globally persisted
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(() => {
    if (detectMobileViewportOrTouch()) {
      return true;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.WORKSPACE_PANEL_COLLAPSE);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch {
      // 忽略错误
    }
    return true; // 默认折叠
  });
  // 当前活跃的会话 ID（用于记录用户手动操作偏好）
  // Current active conversation ID (for recording user manual operation preference)
  const currentConversationIdRef = useRef<string | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  const { backend, agentName, agentLogo, agentLogoIsEmoji, workspaceEnabled = true } = props;
  const layout = useLayoutContext();
  const isMacRuntime = isMacEnvironment();
  const isWindowsRuntime = isWindowsEnvironment();
  // 右侧栏折叠状态引用 / Mirror ref for collapse state
  const rightCollapsedRef = useRef(rightSiderCollapsed);
  const previousWorkspaceCollapsedRef = useRef<boolean | null>(null);
  const previousSiderCollapsedRef = useRef<boolean | null>(null);
  const previousPreviewOpenRef = useRef(false);

  // 预览面板状态 / Preview panel state
  const { isOpen: isPreviewOpen } = usePreviewContext();

  // Fetch custom agents config as fallback when agentName is not provided
  const { data: customAgents } = useSWR(backend === 'custom' && !agentName ? 'acp.customAgents' : null, () => ConfigStorage.get('acp.customAgents'));

  // Compute display name with fallback chain (use first custom agent as fallback for backward compatibility)
  const displayName = agentName || (backend === 'custom' && customAgents?.[0]?.name) || ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name || backend;

  // 获取 tabs 状态，有 tabs 时隐藏会话标题
  const { openTabs } = useConversationTabs();
  const hasTabs = openTabs.length > 0;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleWorkspaceToggle = () => {
      if (!workspaceEnabled) {
        return;
      }
      setRightSiderCollapsed((prev) => {
        const newState = !prev;
        // 记录用户手动操作偏好 / Record user manual operation preference
        const conversationId = currentConversationIdRef.current;
        if (conversationId) {
          try {
            localStorage.setItem(`workspace-preference-${conversationId}`, newState ? 'collapsed' : 'expanded');
          } catch {
            // 忽略错误
          }
        }
        return newState;
      });
    };
    window.addEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    return () => {
      window.removeEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    };
  }, [workspaceEnabled]);

  // 根据文件状态自动展开/折叠工作空间面板（优先使用用户手动偏好）
  // Auto expand/collapse workspace panel based on files state (user preference takes priority)
  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceEnabled) {
      return undefined;
    }
    const handleHasFiles = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHasFilesDetail>).detail;
      const conversationId = detail.conversationId;

      // 更新当前会话 ID / Update current conversation ID
      currentConversationIdRef.current = conversationId;

      // 移动端始终保持工作空间收起，避免进入会话时被自动拉起覆盖主对话区
      if (layout?.isMobile) {
        if (!rightCollapsedRef.current) {
          setRightSiderCollapsed(true);
        }
        return;
      }

      // 检查用户是否有手动设置的偏好 / Check if user has manual preference
      let userPreference: 'expanded' | 'collapsed' | null = null;
      if (conversationId) {
        try {
          const stored = localStorage.getItem(`workspace-preference-${conversationId}`);
          if (stored === 'expanded' || stored === 'collapsed') {
            userPreference = stored;
          }
        } catch {
          // 忽略错误
        }
      }

      // 如果有用户偏好，按偏好设置；否则按文件状态决定
      // If user has preference, use it; otherwise decide by file state
      if (userPreference) {
        const shouldCollapse = userPreference === 'collapsed';
        if (shouldCollapse !== rightSiderCollapsed) {
          setRightSiderCollapsed(shouldCollapse);
        }
      } else {
        // 无用户偏好：有文件展开，没文件折叠
        // No user preference: expand if has files, collapse if not
        if (detail.hasFiles && rightSiderCollapsed) {
          setRightSiderCollapsed(false);
        } else if (!detail.hasFiles && !rightSiderCollapsed) {
          setRightSiderCollapsed(true);
        }
      }
    };
    window.addEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    return () => {
      window.removeEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    };
  }, [layout?.isMobile, workspaceEnabled, rightSiderCollapsed]);

  useEffect(() => {
    if (!workspaceEnabled) {
      dispatchWorkspaceStateEvent(true);
      return;
    }
    dispatchWorkspaceStateEvent(rightSiderCollapsed);
  }, [rightSiderCollapsed, workspaceEnabled]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      setContainerWidth(typeof window === 'undefined' ? 0 : window.innerWidth);
      return;
    }
    setContainerWidth(element.offsetWidth);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      if (!entries.length) return;
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    rightCollapsedRef.current = rightSiderCollapsed;
  }, [rightSiderCollapsed]);

  // 持久化工作空间面板折叠状态
  // Persist workspace panel collapse state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSPACE_PANEL_COLLAPSE, String(rightSiderCollapsed));
    } catch {
      // 忽略错误
    }
  }, [rightSiderCollapsed]);

  useEffect(() => {
    if (!workspaceEnabled) {
      setRightSiderCollapsed(true);
    }
  }, [workspaceEnabled]);

  useEffect(() => {
    if (!workspaceEnabled || !layout?.isMobile || rightCollapsedRef.current) {
      return;
    }
    setRightSiderCollapsed(true);
  }, [layout?.isMobile, workspaceEnabled]);

  // 移动端切换会话时强制收起工作空间，防止第一次进入会话被工作空间面板覆盖
  useEffect(() => {
    if (!workspaceEnabled || !layout?.isMobile) {
      return;
    }
    setRightSiderCollapsed(true);
  }, [conversationId, layout?.isMobile, workspaceEnabled]);

  // 移动端切换会话时，强制清除输入焦点，避免软键盘被自动唤起
  useEffect(() => {
    if (!layout?.isMobile) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      blurActiveElement();
    });
    return () => cancelAnimationFrame(rafId);
  }, [conversationId, layout?.isMobile]);

  const {
    splitRatio: chatSplitRatio,
    setSplitRatio: setChatSplitRatio,
    createDragHandle: createPreviewDragHandle,
  } = useResizableSplit({
    defaultWidth: 60,
    minWidth: MIN_CHAT_RATIO,
    maxWidth: 80,
    storageKey: 'chat-preview-split-ratio',
  });
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

  const isDesktop = !layout?.isMobile;
  const effectiveWorkspaceRatio = workspaceEnabled && isDesktop && !rightSiderCollapsed ? workspaceSplitRatio : 0;
  const chatFlex = isDesktop ? (isPreviewOpen ? chatSplitRatio : 100 - effectiveWorkspaceRatio) : 100;
  const workspaceFlex = effectiveWorkspaceRatio;
  const viewportWidth = containerWidth || (typeof window === 'undefined' ? 0 : window.innerWidth);
  const mobileViewportWidth = viewportWidth || window.innerWidth;
  const mobileWorkspaceWidthPx = Math.min(Math.max(300, Math.round(mobileViewportWidth * 0.84)), Math.max(300, Math.min(420, mobileViewportWidth - 20)));
  const desktopWorkspaceWidthPx = Math.min(500, Math.max(200, (workspaceSplitRatio / 100) * (viewportWidth || 0)));
  const workspaceWidthPx = workspaceEnabled ? (layout?.isMobile ? mobileWorkspaceWidthPx : desktopWorkspaceWidthPx) : 0;

  useEffect(() => {
    if (!workspaceEnabled || !isPreviewOpen || !isDesktop || rightSiderCollapsed) {
      return;
    }
    const maxWorkspace = Math.max(MIN_WORKSPACE_RATIO, Math.min(40, 100 - chatSplitRatio - MIN_PREVIEW_RATIO));
    if (workspaceSplitRatio > maxWorkspace) {
      setWorkspaceSplitRatio(maxWorkspace);
    }
    // 故意不将 workspaceSplitRatio 加入依赖，避免拖动工作空间时触发额外的 effect
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setWorkspaceSplitRatio, workspaceEnabled]);

  useEffect(() => {
    if (!workspaceEnabled || !isPreviewOpen || !isDesktop) {
      return;
    }
    const activeWorkspaceRatio = rightSiderCollapsed ? 0 : workspaceSplitRatio;
    const maxChat = Math.max(MIN_CHAT_RATIO, Math.min(80, 100 - activeWorkspaceRatio - MIN_PREVIEW_RATIO));
    if (chatSplitRatio > maxChat) {
      setChatSplitRatio(maxChat);
    }
    // 故意不将 workspaceSplitRatio 加入依赖，避免拖动工作空间时影响会话面板
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setChatSplitRatio, workspaceEnabled]);

  // 预览打开时自动收起侧边栏和工作空间 / Auto-collapse sidebar and workspace when preview opens
  useEffect(() => {
    if (!workspaceEnabled || !isDesktop) {
      previousPreviewOpenRef.current = false;
      return;
    }

    if (isPreviewOpen && !previousPreviewOpenRef.current) {
      if (previousWorkspaceCollapsedRef.current === null) {
        previousWorkspaceCollapsedRef.current = rightSiderCollapsed;
      }
      if (previousSiderCollapsedRef.current === null && typeof layout?.siderCollapsed !== 'undefined') {
        previousSiderCollapsedRef.current = layout.siderCollapsed;
      }
      setRightSiderCollapsed(true);
      layout?.setSiderCollapsed?.(true);
    } else if (!isPreviewOpen && previousPreviewOpenRef.current) {
      if (previousWorkspaceCollapsedRef.current !== null) {
        setRightSiderCollapsed(previousWorkspaceCollapsedRef.current);
        previousWorkspaceCollapsedRef.current = null;
      }
      if (previousSiderCollapsedRef.current !== null && layout?.setSiderCollapsed) {
        layout.setSiderCollapsed(previousSiderCollapsedRef.current);
        previousSiderCollapsedRef.current = null;
      }
    }

    previousPreviewOpenRef.current = isPreviewOpen;
  }, [isPreviewOpen, isDesktop, layout, rightSiderCollapsed, workspaceEnabled]);

  const mobileWorkspaceHandleRight = rightSiderCollapsed ? 0 : Math.max(0, Math.round(workspaceWidthPx) - 14);

  const headerBlock = (
    <>
      <ConversationTabs />
      <ArcoLayout.Header className={classNames('h-36px flex items-center justify-between p-16px gap-16px !bg-1 chat-layout-header overflow-hidden', layout?.isMobile && 'chat-layout-header--mobile-unified')}>
        <div className='shrink-0'>{props.headerLeft}</div>
        <FlexFullContainer className='h-full min-w-0' containerClassName='flex items-center gap-16px'>
          {!layout?.isMobile && !hasTabs && <span className='font-bold text-16px text-t-primary inline-block overflow-hidden text-ellipsis whitespace-nowrap max-w-full'>{props.title}</span>}
        </FlexFullContainer>
        <div className='flex items-center gap-12px shrink-0'>
          {props.headerExtra}
          {(backend || agentLogo) && <AgentModeSelector backend={backend} agentName={displayName} agentLogo={agentLogo} agentLogoIsEmoji={agentLogoIsEmoji} compact={Boolean(layout?.isMobile)} showLogoInCompact={Boolean(layout?.isMobile)} compactLabelType={layout?.isMobile ? 'agent' : 'mode'} />}
          {isWindowsRuntime && workspaceEnabled && (
            <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={() => dispatchWorkspaceToggleEvent()}>
              {rightSiderCollapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
            </button>
          )}
        </div>
      </ArcoLayout.Header>
    </>
  );

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
      <div ref={containerRef} className={classNames('flex flex-1 relative w-full overflow-hidden', useHeaderFullWidth && 'flex-col')}>
        {useHeaderFullWidth ? (
          <>
            <div className='flex flex-col shrink-0 !bg-1'>{headerBlock}</div>
            <div className='flex flex-1 min-h-0 relative'>
              <div className='flex flex-col relative' style={{ flexGrow: 0, flexShrink: 0, flexBasis: `${chatFlex}%`, minWidth: '240px' }} onClick={() => layout?.isMobile && !rightSiderCollapsed && setRightSiderCollapsed(true)}>
                <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>{props.children}</ArcoLayout.Content>
                {createPreviewDragHandle({ className: 'absolute right-0 top-0 bottom-0', style: {} })}
              </div>
              <div className='preview-panel flex flex-col relative overflow-hidden mt-[6px] mb-[12px] mr-[12px] ml-[8px] rounded-[15px]' style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, border: '1px solid var(--bg-3)', minWidth: '260px' }}>
                <PreviewPanel />
              </div>
              {workspaceEnabled && (
                <div className={classNames('!bg-1 relative chat-layout-right-sider layout-sider')} style={{ flexGrow: 0, flexShrink: 0, flexBasis: rightSiderCollapsed ? '0px' : `${workspaceFlex}%`, minWidth: rightSiderCollapsed ? '0px' : '220px', overflow: 'hidden', borderLeft: rightSiderCollapsed ? 'none' : '1px solid var(--bg-3)' }}>
                  {!rightSiderCollapsed && createWorkspaceDragHandle({ className: 'absolute left-0 top-0 bottom-0', style: {}, reverse: true })}
                  <WorkspacePanelHeader showToggle={!isMacRuntime && !isWindowsRuntime} collapsed={rightSiderCollapsed} onToggle={() => dispatchWorkspaceToggleEvent()} togglePlacement='right'>
                    {props.siderTitle}
                  </WorkspacePanelHeader>
                  <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>{props.sider}</ArcoLayout.Content>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className='flex flex-col relative' style={{ flexGrow: isPreviewOpen && isDesktop ? 0 : chatFlex, flexShrink: 0, flexBasis: isPreviewOpen && isDesktop ? `${chatFlex}%` : 0, display: isPreviewOpen && layout?.isMobile ? 'none' : 'flex', minWidth: isDesktop ? '240px' : '100%' }}>
              <ArcoLayout.Content
                className='flex flex-col h-full'
                onClick={() => {
                  if (window.innerWidth < 768 && !rightSiderCollapsed) setRightSiderCollapsed(true);
                }}
              >
                {headerBlock}
                <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>{props.children}</ArcoLayout.Content>
              </ArcoLayout.Content>
              {isPreviewOpen && !layout?.isMobile && createPreviewDragHandle({ className: 'absolute right-0 top-0 bottom-0', style: {} })}
            </div>
            {isPreviewOpen && (
              <div
                className={classNames('preview-panel flex flex-col relative overflow-hidden rounded-[15px]', layout?.isMobile ? 'm-[8px]' : 'my-[12px] mr-[12px] ml-[8px]')}
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
                <PreviewPanel />
              </div>
            )}
            {workspaceEnabled && !layout?.isMobile && (
              <div className={classNames('!bg-1 relative chat-layout-right-sider layout-sider')} style={{ flexGrow: isPreviewOpen ? 0 : workspaceFlex, flexShrink: 0, flexBasis: rightSiderCollapsed ? '0px' : isPreviewOpen ? `${workspaceFlex}%` : 0, minWidth: rightSiderCollapsed ? '0px' : '220px', overflow: 'hidden', borderLeft: rightSiderCollapsed ? 'none' : '1px solid var(--bg-3)' }}>
                {isDesktop && !rightSiderCollapsed && createWorkspaceDragHandle({ className: 'absolute left-0 top-0 bottom-0', style: {}, reverse: true })}
                <WorkspacePanelHeader showToggle={!isMacRuntime && !isWindowsRuntime} collapsed={rightSiderCollapsed} onToggle={() => dispatchWorkspaceToggleEvent()} togglePlacement={layout?.isMobile ? 'left' : 'right'}>
                  {props.siderTitle}
                </WorkspacePanelHeader>
                <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>{props.sider}</ArcoLayout.Content>
              </div>
            )}
          </>
        )}

        {/* 移动端工作空间遮罩层 / Mobile workspace backdrop */}
        {workspaceEnabled && layout?.isMobile && !rightSiderCollapsed && <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setRightSiderCollapsed(true)} aria-hidden='true' />}

        {/* 移动端工作空间（保持原有的固定定位）/ Mobile workspace (keep original fixed positioning) */}
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
            <WorkspacePanelHeader showToggle collapsed={rightSiderCollapsed} onToggle={() => dispatchWorkspaceToggleEvent()} togglePlacement='left'>
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
          <button type='button' className='workspace-toggle-floating workspace-header__toggle absolute top-1/2 right-2 z-10' style={{ transform: 'translateY(-50%)' }} onClick={() => dispatchWorkspaceToggleEvent()} aria-label='Expand workspace'>
            <ExpandLeft size={16} />
          </button>
        )}
      </div>
    </ArcoLayout>
  );
};

export default ChatLayout;
