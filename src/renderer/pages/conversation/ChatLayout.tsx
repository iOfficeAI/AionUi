import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { ConfigStorage } from '@/common/storage';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight, Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
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
import { iconColors } from '@/renderer/theme/colors';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';
import { usePreviewContext, PreviewPanel } from '@/renderer/pages/conversation/preview';
import { useResizableSplit } from '@/renderer/hooks/useResizableSplit';
import { WORKSPACE_TOGGLE_EVENT, dispatchWorkspaceStateEvent, dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspaceEvents';

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

const MOBILE_COLLAPSE_DURATION = 320;
const MIN_CHAT_RATIO = 25;
const MIN_WORKSPACE_RATIO = 12;
const MIN_PREVIEW_RATIO = 20;
const WORKSPACE_HEADER_HEIGHT = 32;

const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
  agentName?: string;
}> = (props) => {
  const { backend, agentName } = props;
  const layout = useLayoutContext();
  const { isPreviewOpen } = usePreviewContext();
  const isDesktop = !layout?.isMobile;

  const { data: customAgentConfig } = useSWR(backend === 'custom' && !agentName ? 'acp.customAgent' : null, () => ConfigStorage.get('acp.customAgent'));
  const displayName = agentName || (backend === 'custom' ? customAgentConfig?.name : null) || ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name || backend;

  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);
  const rightCollapsedRef = useRef(rightSiderCollapsed);
  const [autoRightCollapsing, setAutoRightCollapsing] = useState(false);
  const [manualRightCollapsing, setManualRightCollapsing] = useState(false);
  const autoRightCollapseTimer = useRef<number | undefined>(undefined);
  const manualRightCollapseTimer = useRef<number | undefined>(undefined);

  const previousPreviewOpenRef = useRef(false);
  const previousWorkspaceCollapsedRef = useRef<boolean | null>(null);
  const previousSiderCollapsedRef = useRef<boolean | null>(null);

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

  const effectiveWorkspaceRatio = isDesktop && !rightSiderCollapsed ? workspaceSplitRatio : 0;
  const chatFlex = isDesktop ? (isPreviewOpen ? chatSplitRatio : 100 - effectiveWorkspaceRatio) : 100;
  const workspaceFlex = effectiveWorkspaceRatio;
  const previewFlex = isDesktop && isPreviewOpen ? Math.max(0, 100 - chatFlex - workspaceFlex) : 0;

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

  useEffect(() => {
    if (!isPreviewOpen || !isDesktop || rightSiderCollapsed) {
      return;
    }
    const maxWorkspace = Math.max(MIN_WORKSPACE_RATIO, Math.min(40, 100 - chatSplitRatio - MIN_PREVIEW_RATIO));
    if (workspaceSplitRatio > maxWorkspace) {
      setWorkspaceSplitRatio(maxWorkspace);
    }
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setWorkspaceSplitRatio, workspaceSplitRatio]);

  useEffect(() => {
    if (!isPreviewOpen || !isDesktop) {
      return;
    }
    const activeWorkspaceRatio = rightSiderCollapsed ? 0 : workspaceSplitRatio;
    const maxChat = Math.max(MIN_CHAT_RATIO, Math.min(80, 100 - activeWorkspaceRatio - MIN_PREVIEW_RATIO));
    if (chatSplitRatio > maxChat) {
      setChatSplitRatio(maxChat);
    }
  }, [chatSplitRatio, isDesktop, isPreviewOpen, rightSiderCollapsed, setChatSplitRatio, workspaceSplitRatio]);

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

  const mobileWorkspaceHandle = layout?.isMobile
    ? createWorkspaceDragHandle({
        className: 'absolute left-0 top-0 bottom-0',
        style: { borderRight: 'none', borderLeft: '1px solid var(--bg-3)' },
        reverse: true,
      })
    : null;

  return (
    <ArcoLayout className='size-full'>
      <ArcoLayout.Content
        className='flex flex-col flex-1'
        onClick={() => {
          const isMobile = window.innerWidth < 768;
          if (isMobile && !rightSiderCollapsed) {
            setRightSiderCollapsed(true);
          }
        }}
      >
        <ArcoLayout.Header className={classNames('h-52px flex items-center justify-between p-16px gap-16px !bg-1 chat-layout-header')}>
          <FlexFullContainer className='h-full' containerClassName='flex items-center'>
            <span className='font-bold text-16px text-t-primary inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full'>{props.title}</span>
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

      {isPreviewOpen && (
        <div
          className='flex flex-col relative'
          style={{
            flexGrow: layout?.isMobile ? 0 : previewFlex,
            flexShrink: layout?.isMobile ? 0 : 1,
            flexBasis: layout?.isMobile ? '100%' : 0,
            borderLeft: '1px solid var(--bg-3)',
            minWidth: layout?.isMobile ? '100%' : '260px',
          }}
        >
          <PreviewPanel />
        </div>
      )}

      {!layout?.isMobile && (
        <div
          className={classNames('!bg-1 relative chat-layout-right-sider layout-sider transition-all duration-300', {
            'layout-sider--folding': autoRightCollapsing || manualRightCollapsing,
          })}
          style={{
            flexGrow: workspaceFlex,
            flexShrink: 1,
            flexBasis: rightSiderCollapsed ? '0px' : 0,
            width: rightSiderCollapsed ? '0px' : undefined,
            minWidth: rightSiderCollapsed ? '0px' : '220px',
            overflow: 'hidden',
            borderLeft: rightSiderCollapsed ? 'none' : '1px solid var(--bg-3)',
          }}
        >
          {isDesktop &&
            !rightSiderCollapsed &&
            createWorkspaceDragHandle({
              className: 'absolute left-0 top-0 bottom-0',
              style: { borderLeft: '1px solid var(--bg-3)' },
              reverse: true,
            })}
          <div className='workspace-panel-header flex items-center justify-start px-12px py-4px gap-12px border-b border-[var(--bg-3)]' style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}>
            <div className='flex-1 truncate'>{props.siderTitle}</div>
            <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={() => dispatchWorkspaceToggleEvent()}>
              {rightSiderCollapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
            </button>
          </div>
          <ArcoLayout.Content style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>{props.sider}</ArcoLayout.Content>
        </div>
      )}

      {layout?.isMobile && (
        <div
          className='!bg-1 relative chat-layout-right-sider'
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            height: '100vh',
            width: '80%',
            zIndex: 100,
            transform: rightSiderCollapsed || autoRightCollapsing ? 'translateX(100%)' : 'translateX(0)',
            transition: `transform ${MOBILE_COLLAPSE_DURATION}ms ease`,
            pointerEvents: rightSiderCollapsed || autoRightCollapsing ? 'none' : 'auto',
          }}
        >
          {mobileWorkspaceHandle}
          <div className='workspace-panel-header flex items-center justify-start px-12px py-4px gap-12px border-b border-[var(--bg-3)]' style={{ height: WORKSPACE_HEADER_HEIGHT, minHeight: WORKSPACE_HEADER_HEIGHT }}>
            <div className='flex-1 truncate'>{props.siderTitle}</div>
            <button type='button' className='workspace-header__toggle' aria-label='Toggle workspace' onClick={() => dispatchWorkspaceToggleEvent()}>
              {rightSiderCollapsed ? <ExpandRight size={16} /> : <ExpandLeft size={16} />}
            </button>
          </div>
          <ArcoLayout.Content className='bg-1' style={{ height: `calc(100% - ${WORKSPACE_HEADER_HEIGHT}px)` }}>
            {props.sider}
          </ArcoLayout.Content>
        </div>
      )}

      {!layout?.isMobile && rightSiderCollapsed && (
        <button type='button' className='workspace-toggle-floating workspace-header__toggle absolute top-1/2 right-2 z-10' style={{ transform: 'translateY(-50%)' }} onClick={() => dispatchWorkspaceToggleEvent()} aria-label='Expand workspace'>
          <ExpandLeft size={16} />
        </button>
      )}
    </ArcoLayout>
  );
};

export default ChatLayout;
