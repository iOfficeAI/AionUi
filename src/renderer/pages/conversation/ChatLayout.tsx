import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
  siderTitle?: React.ReactNode;
}> = (props) => {
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);
  const [siderWidth, setSiderWidth] = useState(266);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Drag start handler
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = siderWidth;
  }, [siderWidth]);

  // Drag move handler
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = dragStartX.current - e.clientX;
    const newWidth = Math.max(200, Math.min(500, dragStartWidth.current + deltaX));
    setSiderWidth(newWidth);
  }, [isDragging]);

  // Drag end handler
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Reset width to default
  const handleDoubleClick = useCallback(() => {
    setSiderWidth(266);
  }, []);

  return (
    <ArcoLayout className={'size-full'}>
      <ArcoLayout.Content>
        <ArcoLayout.Header className={'flex items-center justify-between p-16px gap-16px h-56px !bg-#F7F8FA'}>
          <FlexFullContainer className='h-full'>
            <span className=' ml-16px font-bold text-16px inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%'>{props.title}</span>
          </FlexFullContainer>
          {rightSiderCollapsed && (
            <div className='flex items-center gap-16px'>
              <ExpandRight onClick={() => setRightSiderCollapsed(false)} className='cursor-pointer flex' theme='outline' size='24' fill='#86909C' strokeWidth={3} />
            </div>
          )}
        </ArcoLayout.Header>
        <ArcoLayout.Content className={'h-[calc(100%-66px)] bg-#F9FAFB'}>{props.children}</ArcoLayout.Content>
      </ArcoLayout.Content>
      
      <ArcoLayout.Sider width={siderWidth} collapsedWidth={0} collapsed={rightSiderCollapsed} className={'!bg-#F7F8FA relative'}>
        {/* Drag handle */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize transition-all duration-200 z-10 ${
            isDragging ? 'bg-#86909C/40' : 'hover:bg-#86909C/20'
          }`}
          onMouseDown={handleDragStart}
          onDoubleClick={handleDoubleClick}
        />
        
        <ArcoLayout.Header className={'flex items-center justify-start p-16px gap-16px h-56px'}>
          <div className='flex-1'>{props.siderTitle}</div>
          <ExpandLeft theme='outline' size='24' fill='#86909C' className='cursor-pointer' strokeWidth={3} onClick={() => setRightSiderCollapsed(true)} />
        </ArcoLayout.Header>
        <ArcoLayout.Content className={'h-[calc(100%-66px)] bg-#F9FAFB'}>{props.sider}</ArcoLayout.Content>
      </ArcoLayout.Sider>
    </ArcoLayout>
  );
};

export default ChatLayout;
