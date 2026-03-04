/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import DirectorySelectionModal from '@/renderer/components/DirectorySelectionModal';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { Button, Empty, Input, Modal } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import WorkspaceCollapse from '../WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useExport } from './hooks/useExport';
import type { ConversationRowProps, WorkspaceGroupedHistoryProps } from './types';

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({ onSessionClick, collapsed = false, tooltipEnabled = false, batchMode = false, onBatchModeChange }) => {
  const { id } = useParams();
  const { t } = useTranslation();

  const { conversations, expandedWorkspaces, pinnedConversations, timelineSections, handleToggleWorkspace } = useConversations();

  const { selectedConversationIds, setSelectedConversationIds, selectedCount, allSelected, toggleSelectedConversation, handleToggleSelectAll } = useBatchSelection(batchMode, conversations);

  const { renameModalVisible, renameModalName, setRenameModalName, renameLoading, dropdownVisibleId, handleConversationClick, handleDeleteClick, handleBatchDelete, handleEditStart, handleRenameConfirm, handleRenameCancel, handleTogglePin, handleMenuVisibleChange, handleOpenMenu } = useConversationActions({
    batchMode,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
  });

  const { exportTask, exportModalVisible, exportTargetPath, exportModalLoading, showExportDirectorySelector, setShowExportDirectorySelector, closeExportModal, handleSelectExportDirectoryFromModal, handleSelectExportFolder, handleExportConversation, handleBatchExport, handleConfirmExport } = useExport({
    conversations,
    selectedConversationIds,
    setSelectedConversationIds,
    onBatchModeChange,
  });

  const renderConversation = (conversation: TChatConversation) => {
    const rowProps: ConversationRowProps = {
      conversation,
      collapsed,
      tooltipEnabled,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onEditStart: handleEditStart,
      onDelete: handleDeleteClick,
      onExport: handleExportConversation,
      onTogglePin: handleTogglePin,
    };

    return <ConversationRow key={conversation.id} {...rowProps} />;
  };

  if (timelineSections.length === 0 && pinnedConversations.length === 0) {
    return (
      <FlexFullContainer>
        <div className='flex-center'>
          <Empty description={t('conversation.history.noHistory')} />
        </div>
      </FlexFullContainer>
    );
  }

  return (
    <FlexFullContainer>
      <Modal title={t('conversation.history.renameTitle')} visible={renameModalVisible} onOk={handleRenameConfirm} onCancel={handleRenameCancel} okText={t('conversation.history.saveName')} cancelText={t('conversation.history.cancelEdit')} confirmLoading={renameLoading} okButtonProps={{ disabled: !renameModalName.trim() }} style={{ borderRadius: '12px' }} alignCenter getPopupContainer={() => document.body}>
        <Input autoFocus value={renameModalName} onChange={setRenameModalName} onPressEnter={handleRenameConfirm} placeholder={t('conversation.history.renamePlaceholder')} allowClear />
      </Modal>

      <Modal visible={exportModalVisible} title={t('conversation.history.exportDialogTitle')} onCancel={closeExportModal} footer={null} style={{ borderRadius: '12px' }} className='conversation-export-modal' alignCenter getPopupContainer={() => document.body}>
        <div className='py-8px'>
          <div className='text-14px mb-16px text-t-secondary'>{exportTask?.mode === 'batch' ? t('conversation.history.exportDialogBatchDescription', { count: exportTask.conversationIds.length }) : t('conversation.history.exportDialogSingleDescription')}</div>

          <div className='mb-16px p-16px rounded-12px bg-fill-1'>
            <div className='text-14px mb-8px text-t-primary'>{t('conversation.history.exportTargetFolder')}</div>
            <div
              className='flex items-center justify-between px-12px py-10px rounded-8px transition-colors'
              style={{
                backgroundColor: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-2)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
                opacity: exportModalLoading ? 0.55 : 1,
              }}
              onClick={() => {
                void handleSelectExportFolder();
              }}
            >
              <span className='text-14px overflow-hidden text-ellipsis whitespace-nowrap' style={{ color: exportTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}>
                {exportTargetPath || t('conversation.history.exportSelectFolder')}
              </span>
              <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
            </div>
          </div>

          <div className='flex items-center gap-8px mb-20px text-14px text-t-secondary'>
            <span>💡</span>
            <span>{t('conversation.history.exportDialogHint')}</span>
          </div>

          <div className='flex gap-12px justify-end'>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={closeExportModal}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: exportModalLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '1';
                }
              }}
              onClick={() => {
                void handleConfirmExport();
              }}
              disabled={exportModalLoading}
            >
              {exportModalLoading ? t('conversation.history.exporting') : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      <DirectorySelectionModal visible={showExportDirectorySelector} onConfirm={handleSelectExportDirectoryFromModal} onCancel={() => setShowExportDirectorySelector(false)} />

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>{t('conversation.history.selectedCount', { count: selectedCount })}</div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button className='!col-span-2 !w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap' size='mini' type='secondary' onClick={handleToggleSelectAll}>
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap' size='mini' type='secondary' onClick={handleBatchExport}>
                {t('conversation.history.batchExport')}
              </Button>
              <Button className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap' size='mini' status='warning' onClick={handleBatchDelete}>
                {t('conversation.history.batchDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className='size-full overflow-y-auto overflow-x-hidden'>
        {pinnedConversations.length > 0 && (
          <div className='mb-8px min-w-0'>
            {!collapsed && <div className='chat-history__section px-12px py-8px text-13px text-t-secondary font-bold'>{t('conversation.history.pinnedSection')}</div>}
            <div className='min-w-0'>{pinnedConversations.map((conversation) => renderConversation(conversation))}</div>
          </div>
        )}

        {timelineSections.map((section) => (
          <div key={section.timeline} className='mb-8px min-w-0'>
            {!collapsed && <div className='chat-history__section px-12px py-8px text-13px text-t-secondary font-bold'>{section.timeline}</div>}

            {section.items.map((item) => {
              if (item.type === 'workspace' && item.workspaceGroup) {
                const group = item.workspaceGroup;
                return (
                  <div key={group.workspace} className={classNames('min-w-0', { 'px-8px': !collapsed })}>
                    <WorkspaceCollapse
                      expanded={expandedWorkspaces.includes(group.workspace)}
                      onToggle={() => handleToggleWorkspace(group.workspace)}
                      siderCollapsed={collapsed}
                      header={
                        <div className='flex items-center gap-8px text-14px min-w-0'>
                          <span className='font-medium truncate flex-1 text-t-primary min-w-0'>{group.displayName}</span>
                        </div>
                      }
                    >
                      <div className={classNames('flex flex-col gap-2px min-w-0', { 'mt-4px': !collapsed })}>{group.conversations.map((conversation) => renderConversation(conversation))}</div>
                    </WorkspaceCollapse>
                  </div>
                );
              }

              if (item.type === 'conversation' && item.conversation) {
                return renderConversation(item.conversation);
              }

              return null;
            })}
          </div>
        ))}
      </div>
    </FlexFullContainer>
  );
};

export default WorkspaceGroupedHistory;
