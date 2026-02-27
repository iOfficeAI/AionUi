/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { getAgentLogo } from '@/renderer/utils/agentLogo';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { usePresetAssistantInfo } from '@/renderer/hooks/usePresetAssistantInfo';
import { CronJobIndicator, useCronJobsMap } from '@/renderer/pages/cron';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@/renderer/utils/siderTooltip';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { Checkbox, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { DeleteOne, EditOne, Export, MessageOne, Pushpin } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { ConversationRowProps } from './types';
import { getBackendKeyFromConversation } from './utils/exportHelpers';
import { isConversationPinned } from './utils/groupingHelpers';

const ConversationRow: React.FC<ConversationRowProps> = (props) => {
  const { conversation, collapsed, tooltipEnabled, batchMode, checked, selected, menuVisible } = props;
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { onToggleChecked, onConversationClick, onOpenMenu, onMenuVisibleChange, onEditStart, onDelete, onExport, onTogglePin } = props;
  const { t } = useTranslation();
  const { getJobStatus } = useCronJobsMap();
  const { info: assistantInfo } = usePresetAssistantInfo(conversation);
  const isPinned = isConversationPinned(conversation);
  const cronStatus = getJobStatus(conversation.id);
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  const inlineNameTooltipEnabled = !collapsed && !isMobile && !!conversation.name;

  const renderLeadingIcon = () => {
    if (cronStatus !== 'none') {
      return <CronJobIndicator status={cronStatus} size={20} className='flex-shrink-0' />;
    }

    if (assistantInfo) {
      if (assistantInfo.isEmoji) {
        return <span className='text-18px leading-none flex-shrink-0'>{assistantInfo.logo}</span>;
      }
      return <img src={assistantInfo.logo} alt={assistantInfo.name} className='w-20px h-20px rounded-50% flex-shrink-0' />;
    }

    const backendKey = getBackendKeyFromConversation(conversation);
    const logo = getAgentLogo(backendKey);
    if (logo) {
      return <img src={logo} alt={`${backendKey || 'agent'} logo`} className='w-20px h-20px rounded-50% flex-shrink-0' />;
    }

    return <MessageOne theme='outline' size='20' className='line-height-0 flex-shrink-0' />;
  };

  const handleRowClick = () => {
    cleanupSiderTooltips();
    if (batchMode) {
      onToggleChecked(conversation);
      return;
    }
    onConversationClick(conversation);
  };

  return (
    <Tooltip key={conversation.id} {...siderTooltipProps} content={conversation.name || t('conversation.welcome.newConversation')} position='right'>
      <div
        id={'c-' + conversation.id}
        className={classNames('chat-history__item px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px min-w-0 transition-colors', {
          'hover:bg-[rgba(var(--primary-6),0.14)]': !batchMode,
          '!bg-active': selected,
          'bg-[rgba(var(--primary-6),0.08)]': batchMode && checked,
        })}
        onClick={handleRowClick}
      >
        {batchMode && (
          <span
            className='mr-8px flex-center'
            onClick={(event) => {
              event.stopPropagation();
              onToggleChecked(conversation);
            }}
          >
            <Checkbox checked={checked} />
          </span>
        )}
        {renderLeadingIcon()}
        <FlexFullContainer className='h-24px min-w-0 flex-1 collapsed-hidden ml-10px'>
          <Tooltip content={conversation.name} disabled={!inlineNameTooltipEnabled} trigger={inlineNameTooltipEnabled ? 'hover' : []} popupVisible={inlineNameTooltipEnabled ? undefined : false} unmountOnExit popupHoverStay={false} position='top'>
            <div className={classNames('chat-history__item-name overflow-hidden text-ellipsis block w-full text-14px lh-24px whitespace-nowrap min-w-0 group-hover:text-1', selected && !batchMode ? 'text-1 font-medium' : 'text-2')}>{conversation.name}</div>
          </Tooltip>
        </FlexFullContainer>

        {!batchMode && (
          <div
            className={classNames('absolute right-0px top-0px h-full items-center justify-end !collapsed-hidden pr-8px', {
              flex: isPinned || menuVisible,
              'hidden group-hover:flex': !isPinned && !menuVisible,
            })}
            style={{
              backgroundImage: selected ? `linear-gradient(to right, transparent, var(--aou-2) 50%)` : `linear-gradient(to right, transparent, var(--aou-1) 50%)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {isPinned && !menuVisible && (
              <span className='flex-center text-t-secondary group-hover:hidden pr-4px'>
                <Pushpin theme='outline' size='16' />
              </span>
            )}
            <Dropdown
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    if (key === 'pin') {
                      onTogglePin(conversation);
                      return;
                    }
                    if (key === 'rename') {
                      onEditStart(conversation);
                      return;
                    }
                    if (key === 'export') {
                      onExport(conversation);
                      return;
                    }
                    if (key === 'delete') {
                      onDelete(conversation.id);
                    }
                  }}
                >
                  <Menu.Item key='pin'>
                    <div className='flex items-center gap-8px'>
                      <Pushpin theme='outline' size='14' />
                      <span>{isPinned ? t('conversation.history.unpin') : t('conversation.history.pin')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='rename'>
                    <div className='flex items-center gap-8px'>
                      <EditOne theme='outline' size='14' />
                      <span>{t('conversation.history.rename')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='export'>
                    <div className='flex items-center gap-8px'>
                      <Export theme='outline' size='14' />
                      <span>{t('conversation.history.export')}</span>
                    </div>
                  </Menu.Item>
                  <Menu.Item key='delete'>
                    <div className='flex items-center gap-8px text-[rgb(var(--warning-6))]'>
                      <DeleteOne theme='outline' size='14' />
                      <span>{t('conversation.history.deleteTitle')}</span>
                    </div>
                  </Menu.Item>
                </Menu>
              }
              trigger='click'
              position='br'
              popupVisible={menuVisible}
              onVisibleChange={(visible) => onMenuVisibleChange(conversation.id, visible)}
              getPopupContainer={() => document.body}
              unmountOnExit={false}
            >
              <span
                className={classNames('flex-center cursor-pointer hover:bg-fill-2 rd-4px p-4px transition-colors relative text-t-primary', {
                  flex: menuVisible,
                  'hidden group-hover:flex': !menuVisible,
                })}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenMenu(conversation);
                }}
              >
                <div className='flex flex-col gap-2px items-center justify-center' style={{ width: '16px', height: '16px' }}>
                  <div className='w-2px h-2px rounded-full bg-current'></div>
                  <div className='w-2px h-2px rounded-full bg-current'></div>
                  <div className='w-2px h-2px rounded-full bg-current'></div>
                </div>
              </span>
            </Dropdown>
          </div>
        )}
      </div>
    </Tooltip>
  );
};

export default ConversationRow;
