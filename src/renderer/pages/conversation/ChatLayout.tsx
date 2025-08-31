import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { removeStack } from '@/renderer/utils/common';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { ExpandLeft, ExpandRight } from '@icon-park/react';
import React, { useEffect, useState } from 'react';

const addEventListener = <K extends keyof DocumentEventMap>(key: K, handler: (e: DocumentEventMap[K]) => void): (() => void) => {
  document.addEventListener(key, handler);
  return () => {
    document.removeEventListener(key, handler);
  };
};

const useSiderWidthWithDray = (defaultWidth: number) => {
  const minWidth = 200;
  const maxWidth = 500;
  const [siderWidth, setSiderWidth] = useState(defaultWidth);
  // 记录用户期望的基准宽度与基准窗口宽度，用于“随窗口缩放”的效果
  const [preferredWidth, setPreferredWidth] = useState(defaultWidth);
  const [baselineWindowWidth, setBaselineWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);

  // 窗口缩放时，按照比例在最小/最大宽度内进行收缩/放大
  useEffect(() => {
    const handleResize = () => {
      const current = window.innerWidth || baselineWindowWidth;
      const scale = current / (baselineWindowWidth || current);
      const target = Math.round(preferredWidth * scale);
      const clamped = Math.max(minWidth, Math.min(maxWidth, target));
      setSiderWidth(clamped);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [baselineWindowWidth, preferredWidth]);

  const handleDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const target = e.target as HTMLElement;

    const initDragStyle = () => {
      const originalUserSelect = document.body.style.userSelect;
      target.classList.add('bg-#86909C/40');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      return () => {
        target.classList.remove('bg-#86909C/40');
        document.body.style.userSelect = originalUserSelect;
        document.body.style.cursor = '';
        target.style.transform = '';
      };
    };

    const remove = removeStack(
      initDragStyle(),
      addEventListener('mousemove', (e: MouseEvent) => {
        const deltaX = startX - e.clientX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, siderWidth + deltaX));
        target.style.transform = `translateX(${siderWidth - newWidth}px)`;
      }),
      addEventListener('mouseup', (e) => {
        const deltaX = startX - e.clientX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, siderWidth + deltaX));
        setSiderWidth(newWidth);
        // 用户完成拖拽，重置基线，后续随窗口缩放
        setPreferredWidth(newWidth);
        setBaselineWindowWidth(window.innerWidth || baselineWindowWidth);
        remove();
      })
    );
  };

  const dragContext = (
    <div
      className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize  z-10 hover:bg-#86909C/20`}
      onMouseDown={handleDragStart}
      onDoubleClick={() => {
        setSiderWidth(defaultWidth);
        setPreferredWidth(defaultWidth);
        setBaselineWindowWidth(window.innerWidth || baselineWindowWidth);
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

  const { siderWidth, dragContext } = useSiderWidthWithDray(266);

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
        <ArcoLayout.Content className={'h-[calc(100%-56px)] bg-#F9FAFB'}>{props.children}</ArcoLayout.Content>
      </ArcoLayout.Content>

      <ArcoLayout.Sider width={siderWidth} collapsedWidth={0} collapsed={rightSiderCollapsed} className={'!bg-#F7F8FA relative'}>
        {/* Drag handle */}
        {/* <div className={`absolute left-0 top-0 bottom-0 w-6px cursor-col-resize transition-all duration-200 z-10 ${isDragging ? 'bg-#86909C/40' : 'hover:bg-#86909C/20'}`} onMouseDown={handleDragStart} onDoubleClick={handleDoubleClick} /> */}
        {dragContext}
        <ArcoLayout.Header className={'flex items-center justify-start p-16px gap-16px h-56px'}>
          <div className='flex-1'>{props.siderTitle}</div>
          <ExpandLeft theme='outline' size='24' fill='#86909C' className='cursor-pointer' strokeWidth={3} onClick={() => setRightSiderCollapsed(true)} />
        </ArcoLayout.Header>
        <ArcoLayout.Content className={'h-[calc(100%-56px)] bg-#F9FAFB'}>{props.sider}</ArcoLayout.Content>
      </ArcoLayout.Sider>
    </ArcoLayout>
  );
};

export default ChatLayout;
