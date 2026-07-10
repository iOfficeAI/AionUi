import React from 'react';
import { Trigger } from '@arco-design/web-react';
import type { TeamAssistantOption } from '../assistantSelectUtils';
import TeamAssistantPicker from './TeamAssistantPicker';

/**
 * TeamAssistantPickerDropdown —— “点击加号 → 弹出下拉 → 选择助手”的公用组件。
 *
 * 团队相关界面里有多处这种交互：桌面/移动端团队页 Tab 栏的加号、新建团队弹窗窄屏的
 * “添加成员”。它们都是：一个锚点（加号按钮）触发一个下拉浮层，浮层里是带搜索的助手列表。
 * 这里统一浮层的定位、层级与外观（浅灰边框、圆角、阴影、内边距、软样式搜索框），
 * 各调用处只需提供锚点、助手列表和选中回调；选中后的业务逻辑（加草稿 / 调后端）由调用方持有。
 */
type Props = {
  /** 锚点元素（通常是“+”按钮）。 */
  children: React.ReactElement;
  assistants: TeamAssistantOption[];
  onSelect: (assistant: TeamAssistantOption) => void;
  /** 受控展开状态。 */
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  disabled?: boolean;
  /** 正在处理的助手 id（调用方异步添加时用于行内 loading）。 */
  pendingAssistantId?: string;
  /** testId 前缀，透传给内部 picker（搜索框/选项都基于它）。 */
  testIdPrefix: string;
  /** 浮层容器的 testId。 */
  panelTestId?: string;
  /** 浮层顶部标题（如“添加成员”）。不传则不渲染标题区。 */
  title?: React.ReactNode;
  /** 标题下的副标题（如“同一助手可被反复添加”）。仅在有 title 时渲染。 */
  subtitle?: React.ReactNode;
  /** 列表底部的辅助说明（如“同一助手可重复添加”）。 */
  footer?: React.ReactNode;
  /** 列表下方常驻的引导区（带上分隔线），如「找 Leader 拉人」。 */
  guidanceFooter?: React.ReactNode;
  /** 助手列表为空时展示的文案；不传则由内部 picker 展示默认空状态。 */
  emptyText?: React.ReactNode;
  /** 行密度，透传给内部 picker。默认 'modal'（较紧凑、无内部边框，适合浮层）。 */
  density?: 'compact' | 'modal';
};

const TeamAssistantPickerDropdown: React.FC<Props> = ({
  children,
  assistants,
  onSelect,
  visible,
  onVisibleChange,
  disabled = false,
  pendingAssistantId,
  testIdPrefix,
  panelTestId,
  title,
  subtitle,
  footer,
  guidanceFooter,
  emptyText,
  density = 'modal',
}) => {
  const showEmpty = emptyText !== undefined && assistants.length === 0;

  return (
    <Trigger
      popupVisible={visible}
      onVisibleChange={(next) => onVisibleChange(disabled ? false : next)}
      trigger='click'
      position='br'
      popupAlign={{ bottom: 8 }}
      getPopupContainer={() => document.body}
      classNames='team-assistant-picker-dropdown'
      popup={() => (
        <div
          data-testid={panelTestId}
          className='flex max-h-[min(360px,60vh)] w-260px min-h-0 flex-col rounded-10px border border-solid border-3 bg-dialog-fill-0 p-8px shadow-[0_4px_12px_rgba(0,0,0,0.1)]'
          style={{ zIndex: 10020 }}
        >
          {title ? (
            <div
              className='shrink-0 px-4px pb-8px pt-2px'
              data-testid={panelTestId ? `${panelTestId}-header` : undefined}
            >
              <div className='text-14px font-600 leading-20px text-t-primary'>{title}</div>
              {subtitle ? <div className='mt-2px text-12px leading-18px text-t-tertiary'>{subtitle}</div> : null}
            </div>
          ) : null}
          {showEmpty ? (
            <div className='flex items-center justify-center px-12px py-12px text-center text-13px text-t-tertiary'>
              {emptyText}
            </div>
          ) : (
            <TeamAssistantPicker
              assistants={assistants}
              onSelect={onSelect}
              disabled={disabled}
              pendingAssistantId={pendingAssistantId}
              testIdPrefix={testIdPrefix}
              density={density}
              searchVariant='inline'
              footer={footer}
            />
          )}
          {guidanceFooter ? (
            // 上分隔线贯穿整个下拉宽度（用负边距抵消 panel 的 p-8px），只留一根线 + 文字，不成盒子。
            <div
              className='shrink-0 -mx-8px mt-8px px-12px pt-8px border-t border-solid border-3'
              data-testid={panelTestId ? `${panelTestId}-guidance` : undefined}
            >
              {guidanceFooter}
            </div>
          ) : null}
        </div>
      )}
    >
      {children}
    </Trigger>
  );
};

export default TeamAssistantPickerDropdown;
