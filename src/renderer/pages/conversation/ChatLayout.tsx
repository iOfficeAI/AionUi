import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { removeStack } from '@/renderer/utils/common';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React, { useState, useEffect } from 'react';

import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import { ACP_BACKENDS_ALL } from '@/types/acpTypes';
import classNames from 'classnames';
import { iconColors } from '@/renderer/theme/colors';

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

  // 启动时检测移动端并自动收起右侧边栏
  useEffect(() => {
    const checkMobileOnLoad = () => {
      // 检测屏幕宽度小于768px（平板和手机的常见分界）
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setRightSiderCollapsed(true);
      }
    };

    // 只在组件首次加载时执行一次
    checkMobileOnLoad();
  }, []); // 空依赖数组确保只在组件初始化时执行一次

  return (
    <ArcoLayout className={'size-full'}>
      <ArcoLayout.Content className='flex flex-col flex-1'>
        <ArcoLayout.Header className={classNames('h-52px flex items-center justify-between p-16px gap-16px  !bg-1')}>
          <FlexFullContainer className='h-full'>
            <span className='ml-16px font-bold text-16px text-t-primary inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%'>{props.title}</span>
          </FlexFullContainer>
          <div className='flex items-center gap-16px'>
            {backend && (
              <div className='ml-16px flex items-center gap-2 bg-2 w-fit rounded-full px-[8px] py-[2px]'>
                <img src={backend === 'claude' ? ClaudeLogo : backend === 'gemini' ? GeminiLogo : backend === 'qwen' ? QwenLogo : backend === 'iflow' ? IflowLogo : backend === 'codex' ? CodexLogo : ''} alt={`${backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />
                <span className='font-medium text-t-primary'>{ACP_BACKENDS_ALL[backend as keyof typeof ACP_BACKENDS_ALL]?.name || backend}</span>
              </div>
            )}
            {rightSiderCollapsed ? <ExpandRight onClick={() => setRightSiderCollapsed(false)} className='cursor-pointer flex' theme='outline' size='24' fill={iconColors.secondary} strokeWidth={3} /> : <ExpandLeft onClick={() => setRightSiderCollapsed(true)} className='cursor-pointer flex' theme='outline' size='24' fill={iconColors.secondary} strokeWidth={3} />}
          </div>
        </ArcoLayout.Header>
        <ArcoLayout.Content className='flex flex-col flex-1 bg-1 overflow-hidden'>{props.children}</ArcoLayout.Content>
      </ArcoLayout.Content>

      <ArcoLayout.Sider width={siderWidth} collapsedWidth={0} collapsed={rightSiderCollapsed} className={'!bg-1 relative'}>
        {/* Drag handle */}
        {/* <div className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize transition-all duration-200 z-10 ${isDragging ? 'bg-#86909C/40' : 'hover:bg-#86909C/20'}`} onMouseDown={handleDragStart} onDoubleClick={handleDoubleClick} /> */}
        {dragContext}
        <ArcoLayout.Header className={'flex items-center justify-start p-16px gap-16px h-56px'}>
          <div className='w-full'>{props.siderTitle}</div>
          {/* <ExpandLeft theme='outline' size='24' fill='#86909C' className='cursor-pointer' strokeWidth={3} onClick={() => setRightSiderCollapsed(true)} /> */}
        </ArcoLayout.Header>
        <ArcoLayout.Content className={'h-[calc(100%-106px)] bg-1'}>{props.sider}</ArcoLayout.Content>
      </ArcoLayout.Sider>
    </ArcoLayout>
  );
};

export default ChatLayout;
