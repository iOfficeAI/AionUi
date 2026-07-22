/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AionModal from '@renderer/components/base/AionModal';
import TeamAssistantPicker from '@renderer/pages/team/components/memberPicker/TeamAssistantPicker';
import { AssistantOptionLabel } from '@renderer/pages/team/components/assistantSelectUtils';
import type { TeamAssistantOption } from '@renderer/pages/team/components/assistantSelectUtils';

export type AgentSelectorModalProps = {
  visible: boolean;
  assistants: TeamAssistantOption[];
  isLoading: boolean;
  confirmLoading?: boolean;
  onClose: () => void;
  onConfirm: (assistant: TeamAssistantOption) => void;
};

/**
 * Modal for picking an agent to join a normal conversation as an ad-hoc team.
 */
export const AgentSelectorModal: React.FC<AgentSelectorModalProps> = ({
  visible,
  assistants,
  isLoading,
  confirmLoading = false,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<TeamAssistantOption | null>(null);

  const handleConfirm = () => {
    if (selected) onConfirm(selected);
  };

  const handleClose = () => {
    if (confirmLoading) return;
    setSelected(null);
    onClose();
  };

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      variant='standard'
      size='medium'
      header={{ title: t('conversation.collaboration.selectAgentTitle', { defaultValue: 'Select agent' }) }}
      data-testid='agent-selector-modal'
      footer={
        <div className='flex justify-end gap-10px'>
          <Button onClick={handleClose} disabled={confirmLoading} data-testid='agent-selector-cancel'>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='primary'
            disabled={!selected || isLoading || confirmLoading}
            loading={confirmLoading}
            onClick={handleConfirm}
            data-testid='agent-selector-confirm'
          >
            {t('common.confirm', { defaultValue: 'Confirm' })}
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className='flex h-200px items-center justify-center' data-testid='agent-selector-loading'>
          <Spin />
        </div>
      ) : (
        <>
          {selected && (
            <div className='flex items-center justify-between gap-12px mb-16px p-12px rounded-8px bg-fill-2 border border-b-base'>
              <div className='flex items-center gap-8px min-w-0'>
                <AssistantOptionLabel assistant={selected} />
                <span className='text-12px font-500 text-t-secondary' data-testid='agent-selector-joined-hint'>
                  {t('conversation.collaboration.joinedHint', { defaultValue: 'joined' })}
                </span>
              </div>
              <span className='text-13px font-500 text-t-primary truncate' data-testid='agent-selector-selected-name'>
                {selected.name}
              </span>
            </div>
          )}
          <TeamAssistantPicker
            assistants={assistants}
            onSelect={setSelected}
            density='modal'
            testIdPrefix='agent-selector'
          />
        </>
      )}
    </AionModal>
  );
};

AgentSelectorModal.displayName = 'AgentSelectorModal';
