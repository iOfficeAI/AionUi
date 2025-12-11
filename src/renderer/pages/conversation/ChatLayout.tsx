import { ConfigStorage } from '@/common/storage';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { useResizableSplit } from '@/renderer/hooks/useResizableSplit';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/preview';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight, Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import OpenCodeLogo from '@/renderer/assets/logos/opencode.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import type { AcpBackend } from '@/types/acpTypes';

// Agent Logo 映射
const AGENT_LOGO_MAP: Partial<Record<AcpBackend, string>> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  codex: CodexLogo,
  iflow: IflowLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpenCodeLogo,
};

import { iconColors } from '@/renderer/theme/colors';
import { WORKSPACE_TOGGLE_EVENT, dispatchWorkspaceStateEvent, dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspaceEvents';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';

const MOBILE_COLLAPSE_DURATION = 280;
const MIN_CHAT_RATIO = 25;
const MIN_WORKSPACE_RATIO = 12;
const MIN_PREVIEW_RATIO = 20;
const WORKSPACE_HEADER_HEIGHT = 32;

const isMacEnvironment = () => {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.userAgent);
};

interface WorkspaceHeaderProps {
  children?: React.ReactNode;
  showToggle?: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

const WorkspacePanelHeader: React.FC<WorkspaceHeaderProps> = ({ children, showToggle = false, collapsed, onToggle }) => (
  <div className='workspace-panel-header flex items-center justify-start px-12px py-4px gap-12px border-b border-[var(--bg-3)]' style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}>
    <div className='flex-1 truncate'>{children}</div>
    {showToggle && (
      <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={onToggle}>
        {collapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
      </button>
    )}
  </div>
);

const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
  agentName?: string;
}> = (props) => {
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  const { backend, agentName } = props;
  const layout = useLayoutContext();
  const isMacRuntime = isMacEnvironment();
  // 右侧栏的自动/手动折叠动画状态 / Auto & manual folding states for right sider
  const rightCollapsedRef = useRef(rightSiderCollapsed);
  const [autoRightCollapsing, setAutoRightCollapsing] = useState(false);
  const [manualRightCollapsing, setManualRightCollapsing] = useState(false);
  const autoRightCollapseTimer = useRef<number | undefined>(undefined);
  const manualRightCollapseTimer = useRef<number | undefined>(undefined);
  const previousWorkspaceCollapsedRef = useRef<boolean | null>(null);
  const previousSiderCollapsedRef = useRef<boolean | null>(null);
  const previousPreviewOpenRef = useRef(false);

  // 预览面板状态 / Preview panel state
  const { isOpen: isPreviewOpen } = usePreviewContext();

  // Fetch custom agents config as fallback when agentName is not provided
  const { data: customAgents } = useSWR(backend === 'custom' && !agentName ? 'acp.customAgents' : null, () => ConfigStorage.get('acp.customAgents'));

  // Compute display name with fallback chain (use first custom agent as fallback for backward compatibility)
  const displayName = agentName || (backend === 'custom' && customAgents?.[0]?.name) || ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name || backend;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleWorkspaceToggle = () => {
      setRightSiderCollapsed((prev) => !prev);
    };
    window.addEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    return () => {
      window.removeEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    };
  }, []);

  useEffect(() => {
    dispatchWorkspaceStateEvent(rightSiderCollapsed);
  }, [rightSiderCollapsed]);

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

  useEffect(() => {
    if (!layout?.isMobile || rightCollapsedRef.current) {
      setAutoRightCollapsing(false);
      if (autoRightCollapseTimer.current !== undefined) {
        window.clearTimeout(autoRightCollapseTimer.current);
        autoRightCollapseTimer.current = undefined;
      }
      return;
    }
    setAutoRightCollapsing(true);
    if (autoRightCollapseTimer.current !== undefined) {
      window.clearTimeout(autoRightCollapseTimer.current);
    }
    autoRightCollapseTimer.current = window.setTimeout(() => {
      setAutoRightCollapsing(false);
      setRightSiderCollapsed(true);
      autoRightCollapseTimer.current = undefined;
    }, MOBILE_COLLAPSE_DURATION);

    return () => {
      if (autoRightCollapseTimer.current !== undefined) {
        window.clearTimeout(autoRightCollapseTimer.current);
        autoRightCollapseTimer.current = undefined;
      }
    };
  }, [layout?.isMobile]);

  // 手动折叠右侧栏时也做淡出 / Fade out when user folds the right sider manually
  useEffect(() => {
    if (!rightSiderCollapsed) {
      setManualRightCollapsing(false);
      if (manualRightCollapseTimer.current !== undefined) {
        window.clearTimeout(manualRightCollapseTimer.current);
        manualRightCollapseTimer.current = undefined;
      }
      return;
    }

    setManualRightCollapsing(true);
    if (manualRightCollapseTimer.current !== undefined) {
      window.clearTimeout(manualRightCollapseTimer.current);
    }
    // Delay pointer lock until fade-out finishes / 等淡出动画完成后再禁用交互
    manualRightCollapseTimer.current = window.setTimeout(() => {
      setManualRightCollapsing(false);
      manualRightCollapseTimer.current = undefined;
    }, MOBILE_COLLAPSE_DURATION);

    return () => {
      if (manualRightCollapseTimer.current !== undefined) {
        window.clearTimeout(manualRightCollapseTimer.current);
        manualRightCollapseTimer.current = undefined;
      }
    };
  }, [rightSiderCollapsed]);

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
  const effectiveWorkspaceRatio = isDesktop && !rightSiderCollapsed ? workspaceSplitRatio : 0;
  const chatFlex = isDesktop ? (isPreviewOpen ? chatSplitRatio : 100 - effectiveWorkspaceRatio) : 100;
  const workspaceFlex = effectiveWorkspaceRatio;
  const viewportWidth = containerWidth || (typeof window === 'undefined' ? 0 : window.innerWidth);
  const workspaceWidthPx = Math.min(500, Math.max(200, (workspaceSplitRatio / 100) * (viewportWidth || 0)));

  useEffect(() => {
    if (!isPreviewOpen || !isDesktop || rightSiderCollapsed) {
      return;
    }
    const maxWorkspace = Math.max(MIN_WORKSPACE_RATIO, Math.min(40, 100 - chatSplitRatio - MIN_PREVIEW_RATIO));
    if (workspaceSplitRatio > maxWorkspace) {
      setWorkspaceSplitRatio(maxWorkspace);
    }
    // 故意不将 workspaceSplitRatio 加入依赖，避免拖动工作空间时触发额外的 effect
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setWorkspaceSplitRatio]);

  useEffect(() => {
    if (!isPreviewOpen || !isDesktop) {
      return;
    }
    const activeWorkspaceRatio = rightSiderCollapsed ? 0 : workspaceSplitRatio;
    const maxChat = Math.max(MIN_CHAT_RATIO, Math.min(80, 100 - activeWorkspaceRatio - MIN_PREVIEW_RATIO));
    if (chatSplitRatio > maxChat) {
      setChatSplitRatio(maxChat);
    }
    // 故意不将 workspaceSplitRatio 加入依赖，避免拖动工作空间时影响会话面板
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setChatSplitRatio]);

  // 预览打开时自动收起侧边栏和工作空间 / Auto-collapse sidebar and workspace when preview opens
  useEffect(() => {
    if (!isDesktop) {
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
  }, [isPreviewOpen, isDesktop, layout, rightSiderCollapsed]);

  const mobileHandle = layout?.isMobile
    ? createWorkspaceDragHandle({
        className: 'absolute left-0 top-0 bottom-0',
        style: { borderRight: 'none', borderLeft: '1px solid var(--bg-3)' },
        reverse: true,
      })
    : null;

  return (
    <ArcoLayout className='size-full'>
      {/* 主内容区域：会话面板 + 工作空间面板 + 预览面板 / Main content area: chat + workspace + preview */}
      <div ref={containerRef} className='flex flex-1 relative w-full overflow-hidden'>
        {/* 会话面板（带拖动句柄）/ Chat panel (with drag handle) */}
        <div
          className='flex flex-col relative'
          style={{
            // 使用 flexBasis 设置宽度，避免 width 和 flexBasis 冲突
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
              const isMobile = window.innerWidth < 768;
              if (isMobile && !rightSiderCollapsed) {
                setRightSiderCollapsed(true);
              }
            }}
          >
            <ArcoLayout.Header className={classNames('h-52px flex items-center justify-between p-16px gap-16px !bg-1 chat-layout-header')}>
              <FlexFullContainer className='h-full' containerClassName='flex items-center'>
                <span className='font-bold text-16px text-t-primary inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%'>{props.title}</span>
              </FlexFullContainer>
              <div className='flex items-center gap-16px'>
                {backend && (
                  <div className='ml-16px flex items-center gap-2 bg-2 w-fit rounded-full px-[8px] py-[2px]'>
                    {AGENT_LOGO_MAP[backend as AcpBackend] ? <img src={AGENT_LOGO_MAP[backend as AcpBackend]} alt={`${backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} /> : <Robot theme='outline' size={16} fill={iconColors.primary} />}
                    <span className='text-sm'>{displayName}</span>
                  </div>
                )}
              </div>
            </ArcoLayout.Header>
            <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>{props.children}</ArcoLayout.Content>
          </ArcoLayout.Content>

          {/* 会话右侧拖动手柄：在桌面模式下调节会话和预览的宽度比例 */}
          {isPreviewOpen &&
            !layout?.isMobile &&
            createPreviewDragHandle({
              className: 'absolute right-0 top-0 bottom-0',
              style: {},
            })}
        </div>

        {/* 预览面板（移到中间位置）/ Preview panel (moved to middle position) */}
        {isPreviewOpen && (
          <div
            className='preview-panel flex flex-col relative my-[16px] mr-[16px] rounded-[15px]'
            style={{
              // 使用 flexGrow: 1 填充剩余空间（会话和工作空间使用固定 flexBasis）
              flexGrow: layout?.isMobile ? 0 : 1,
              flexShrink: layout?.isMobile ? 0 : 1,
              flexBasis: layout?.isMobile ? '100%' : 0,
              border: '1px solid var(--bg-3)',
              minWidth: layout?.isMobile ? '100%' : '260px',
            }}
          >
            <PreviewPanel />
          </div>
        )}

        {/* 工作空间面板（移到最右边）/ Workspace panel (moved to rightmost position) */}
        {!layout?.isMobile && (
          <div
            className={classNames('!bg-1 relative chat-layout-right-sider layout-sider', {
              'layout-sider--folding': autoRightCollapsing || manualRightCollapsing,
            })}
            style={{
              // 使用 flexBasis 设置宽度，避免 width 和 flexBasis 冲突
              flexGrow: isPreviewOpen ? 0 : workspaceFlex,
              flexShrink: 0,
              flexBasis: rightSiderCollapsed ? '0px' : isPreviewOpen ? `${workspaceFlex}%` : 0,
              minWidth: rightSiderCollapsed ? '0px' : '220px',
              overflow: 'hidden',
              borderLeft: rightSiderCollapsed ? 'none' : '1px solid var(--bg-3)',
            }}
          >
            {isDesktop &&
              !rightSiderCollapsed &&
              createWorkspaceDragHandle({
                className: 'absolute left-0 top-0 bottom-0',
                style: {},
                reverse: true,
              })}
            <WorkspacePanelHeader showToggle={!isMacRuntime} collapsed={rightSiderCollapsed} onToggle={() => dispatchWorkspaceToggleEvent()}>
              {props.siderTitle}
            </WorkspacePanelHeader>
            <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>{props.sider}</ArcoLayout.Content>
          </div>
        )}

        {/* 移动端工作空间（保持原有的固定定位）/ Mobile workspace (keep original fixed positioning) */}
        {layout?.isMobile && (
          <div
            className='!bg-1 relative chat-layout-right-sider'
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              height: '100vh',
              width: `${Math.round(workspaceWidthPx)}px`,
              zIndex: 100,
              transform: rightSiderCollapsed || autoRightCollapsing ? 'translateX(100%)' : 'translateX(0)',
              transition: `transform ${MOBILE_COLLAPSE_DURATION}ms ease`,
              pointerEvents: rightSiderCollapsed || autoRightCollapsing ? 'none' : 'auto',
            }}
          >
            {mobileHandle}
            <WorkspacePanelHeader showToggle={!isMacRuntime} collapsed={rightSiderCollapsed} onToggle={() => dispatchWorkspaceToggleEvent()}>
              {props.siderTitle}
            </WorkspacePanelHeader>
            <ArcoLayout.Content className='bg-1' style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
              {props.sider}
            </ArcoLayout.Content>
          </div>
        )}

        {!isMacRuntime && rightSiderCollapsed && !layout?.isMobile && (
          <button type='button' className='workspace-toggle-floating workspace-header__toggle absolute top-1/2 right-2 z-10' style={{ transform: 'translateY(-50%)' }} onClick={() => dispatchWorkspaceToggleEvent()} aria-label='Expand workspace'>
            <ExpandLeft size={16} />
          </button>
        )}
      </div>
    </ArcoLayout>
  );
};

export default ChatLayout;
