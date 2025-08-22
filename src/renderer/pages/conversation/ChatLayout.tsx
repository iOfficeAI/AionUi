import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { removeStack } from '@/renderer/utils/common';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React, { useState } from 'react';
import { useThemeColors, useTextColor } from '../../themes/index';

const addEventListener = <K extends keyof DocumentEventMap>(key: K, handler: (e: DocumentEventMap[K]) => void): (() => void) => {
  document.addEventListener(key, handler);
  return () => {
    document.removeEventListener(key, handler);
  };
};

const useSiderWidthWithDray = (defaultWidth: number) => {
  const [siderWidth, setSiderWidth] = useState(defaultWidth);
  const themeColors = useThemeColors();

  const handleDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const target = e.target as HTMLElement;

    const initDragStyle = () => {
      const originalUserSelect = document.body.style.userSelect;
      target.style.backgroundColor = themeColors.textSecondary + '40'; // 40 for opacity
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      return () => {
        target.style.backgroundColor = '';
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
      className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize z-10 hover:opacity-80`}
      style={{
        backgroundColor: 'transparent',
      }}
      onMouseDown={handleDragStart}
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
}> = (props) => {
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);
  const themeColors = useThemeColors();
  const getTextColor = useTextColor();

  const { siderWidth, dragContext } = useSiderWidthWithDray(266);

  return (
    <ArcoLayout className={'size-full'}>
      <ArcoLayout.Content>
        <ArcoLayout.Header className={'flex items-center justify-between p-16px gap-16px h-56px'} style={{ backgroundColor: themeColors.background }}>
          <FlexFullContainer className='h-full'>
            <span className=' ml-16px font-bold text-16px inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%' style={{ color: getTextColor('conversation.title', 'textPrimary') }}>
              {props.title}
            </span>
          </FlexFullContainer>
          {rightSiderCollapsed && (
            <div className='flex items-center gap-16px'>
              <ExpandRight onClick={() => setRightSiderCollapsed(false)} className='cursor-pointer flex' theme='outline' size='24' fill={getTextColor('conversation.expandRight', 'textSecondary')} strokeWidth={3} />
            </div>
          )}
        </ArcoLayout.Header>
        <ArcoLayout.Content className={'h-[calc(100%-66px)]'} style={{ backgroundColor: themeColors.background }}>
          {props.children}
        </ArcoLayout.Content>
      </ArcoLayout.Content>

      <ArcoLayout.Sider width={siderWidth} collapsedWidth={0} collapsed={rightSiderCollapsed} className={'relative'} style={{ backgroundColor: themeColors.sidebarBackground }}>
        {/* Drag handle */}
        {/* <div className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize transition-all duration-200 z-10 ${isDragging ? 'bg-#86909C/40' : 'hover:bg-#86909C/20'}`} onMouseDown={handleDragStart} onDoubleClick={handleDoubleClick} /> */}
        {dragContext}
        <ArcoLayout.Header className={'flex items-center justify-start p-16px gap-16px h-56px'} style={{ backgroundColor: themeColors.sidebarBackground }}>
          <div className='flex-1' style={{ color: getTextColor('conversation.siderTitle', 'textPrimary') }}>
            {props.siderTitle}
          </div>
          <ExpandLeft theme='outline' size='24' fill={getTextColor('conversation.expandLeft', 'textSecondary')} className='cursor-pointer' strokeWidth={3} onClick={() => setRightSiderCollapsed(true)} />
        </ArcoLayout.Header>
        <ArcoLayout.Content className={'h-[calc(100%-66px)]'} style={{ backgroundColor: themeColors.sidebarBackground }}>
          {props.sider}
        </ArcoLayout.Content>
      </ArcoLayout.Sider>
    </ArcoLayout>
  );
};

export default ChatLayout;
