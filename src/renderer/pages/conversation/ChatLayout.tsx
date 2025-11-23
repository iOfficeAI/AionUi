import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { removeStack } from '@/renderer/utils/common';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight, MenuUnfold } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useLayoutContext } from '@/renderer/context/LayoutContext';

import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import { iconColors } from '@/renderer/theme/colors';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';

const addEventListener = <K extends keyof DocumentEventMap>(key: K, handler: (e: DocumentEventMap[K]) => void): (() => void) => {
  document.addEventListener(key, handler);
  return () => {
    document.removeEventListener(key, handler);
  };
};

const useSiderWidthWithDrag = (defaultWidth: number) => {
  const [siderWidth, setSiderWidth] = useState(defaultWidth);

  const handleDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const target = e.target as HTMLElement;

    const initDragStyle = () => {
      const originalUserSelect = document.body.style.userSelect;
      target.classList.add('bg-6/40');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      return () => {
        target.classList.remove('bg-6/40');
        document.body.style.userSelect = originalUserSelect;
        document.body.style.cursor = '';
        target.style.transform = '';
      };
    };

    const remove = removeStack(
      initDragStyle(),
      addEventListener('mousemove', (e: MouseEvent) => {
        const deltaX = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(500, siderWidth + deltaX));
        target.style.transform = `translateX(${siderWidth - newWidth}px)`;
      }),
      addEventListener('mouseup', (e) => {
        const deltaX = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(500, siderWidth + deltaX));
        setSiderWidth(newWidth);
        remove();
      })
    );
  };

  const dragContext = (
    <div
      className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize  z-10 hover:bg-6/20`}
      onMouseDown={handleDragStart}
      style={{
        borderLeft: '1px solid var(--bg-3)',
      }}
      onDoubleClick={() => {
        setSiderWidth(defaultWidth);
      }}
    />
  );

  return { siderWidth, dragContext };
};

const MOBILE_COLLAPSE_DURATION = 320;

const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
  backend?: string;
}> = (props) => {
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);

  const { siderWidth, dragContext } = useSiderWidthWithDrag(266);
  const { backend } = props;
  const layout = useLayoutContext();
  // 右侧栏的自动/手动折叠动画状态 / Auto & manual folding states for right sider
  const rightCollapsedRef = useRef(rightSiderCollapsed);
  const [autoRightCollapsing, setAutoRightCollapsing] = useState(false);
  const [manualRightCollapsing, setManualRightCollapsing] = useState(false);
  const autoRightCollapseTimer = useRef<number | undefined>(undefined);
  const manualRightCollapseTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    rightCollapsedRef.current = rightSiderCollapsed;
  }, [rightSiderCollapsed]);

  // 响应移动端状态变化，自动收起右侧边栏（含动画）/ Auto-collapse right sider on mobile switch
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
  }, [layout?.isMobile]); // 监听全局 isMobile 状态变化

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
            {layout?.isMobile && layout?.siderCollapsed && (
              <span className='inline-flex items-center justify-center w-18px h-18px mr-4px cursor-pointer' onClick={() => layout.setSiderCollapsed(false)} style={{ lineHeight: 0, transform: 'translateY(1px)' }}>
                <MenuUnfold theme='outline' size={18} fill={iconColors.secondary} strokeWidth={3} />
              </span>
            )}
            <span className='ml-8px font-bold text-16px text-t-primary inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%'>{props.title}</span>
          </FlexFullContainer>
          <div className='flex items-center gap-16px'>
            {backend && (
              <div className='ml-16px flex items-center gap-2 bg-2 w-fit rounded-full px-[8px] py-[2px]'>
                <img src={backend === 'claude' ? ClaudeLogo : backend === 'gemini' ? GeminiLogo : backend === 'qwen' ? QwenLogo : backend === 'iflow' ? IflowLogo : backend === 'codex' ? CodexLogo : ''} alt={`${backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />
                <span className='text-sm'>{ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name || backend}</span>
              </div>
            )}
            {rightSiderCollapsed ? <ExpandRight onClick={() => setRightSiderCollapsed(false)} className='cursor-pointer flex' theme='outline' size='24' fill={iconColors.secondary} strokeWidth={3} /> : <ExpandLeft onClick={() => setRightSiderCollapsed(true)} className='cursor-pointer flex' theme='outline' size='24' fill={iconColors.secondary} strokeWidth={3} />}
          </div>
        </ArcoLayout.Header>
        <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>{props.children}</ArcoLayout.Content>
      </ArcoLayout.Content>

      <ArcoLayout.Sider
        width={siderWidth}
        collapsedWidth={0}
        collapsed={rightSiderCollapsed}
        className={classNames('!bg-1 relative chat-layout-right-sider layout-sider', {
          'layout-sider--folding': autoRightCollapsing || manualRightCollapsing,
        })}
        style={
          layout?.isMobile
            ? {
                position: 'fixed',
                right: 0,
                top: 0,
                height: '100vh',
                zIndex: 100,
                transform: rightSiderCollapsed || autoRightCollapsing ? 'translateX(100%)' : 'translateX(0)',
                transition: `transform ${MOBILE_COLLAPSE_DURATION}ms ease`,
                pointerEvents: rightSiderCollapsed || autoRightCollapsing ? 'none' : 'auto',
              }
            : undefined
        }
      >
        {dragContext}
        <ArcoLayout.Header className='flex items-center justify-start p-16px gap-16px h-56px'>
          <div className='w-full'>{props.siderTitle}</div>
        </ArcoLayout.Header>
        <ArcoLayout.Content className='h-[calc(100%-106px)] bg-1'>{props.sider}</ArcoLayout.Content>
      </ArcoLayout.Sider>
    </ArcoLayout>
  );
};

export default ChatLayout;
