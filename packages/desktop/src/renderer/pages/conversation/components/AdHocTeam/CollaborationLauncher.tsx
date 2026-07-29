/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Peoples } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { AgentSelectorModal } from './AgentSelectorModal';
import type { TeamAssistantOption } from '@renderer/pages/team/components/assistantSelectUtils';
import { useTeamAssistantOptions } from '@/renderer/pages/team/hooks/useTeamAssistantOptions';
import type { TAdHocTeamCreateResult } from '@/common/types/team/adHocTeamTypes';

export type CollaborationLauncherProps = {
  conversationId: string;
  userId: string;
  onCreated: (result: TAdHocTeamCreateResult) => void;
  /** Injected for testability; production should leave this undefined. */
  create?: (targetAssistantId: string) => Promise<TAdHocTeamCreateResult>;
  isCreating?: boolean;
};

/**
 * Header action that opens an agent selector and starts the ad-hoc team flow
 * for the current conversation. Keeps the conversation route unchanged.
 */
export const CollaborationLauncher: React.FC<CollaborationLauncherProps> = ({
  conversationId: _conversationId,
  userId: _userId,
  onCreated,
  create,
  isCreating = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { assistants, loading } = useTeamAssistantOptions();

  const handleConfirm = async (assistant: TeamAssistantOption) => {
    if (!create) return;
    setIsSubmitting(true);
    try {
      const result = await create(assistant.id);
      onCreated({
        ...result,
        target_assistant_id: assistant.id,
        target_assistant_name: assistant.name,
      });
      setIsOpen(false);
    } catch (error) {
      Message.error(t('conversation.collaboration.createFailed'));
      // Keep the modal open so the user can retry or cancel.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setIsOpen(false);
  };

  return (
    <>
      <Tooltip content={t('conversation.collaboration.launchTooltip', { defaultValue: 'Team collaboration' })}>
        <Button
          type='text'
          size='mini'
          disabled={isCreating || isSubmitting}
          onClick={() => setIsOpen(true)}
          data-testid='collaboration-launcher-trigger'
        >
          <Peoples theme='outline' size='18' fill='currentColor' />
        </Button>
      </Tooltip>
      <AgentSelectorModal
        visible={isOpen}
        assistants={assistants}
        isLoading={loading}
        confirmLoading={isSubmitting}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </>
  );
};

CollaborationLauncher.displayName = 'CollaborationLauncher';
