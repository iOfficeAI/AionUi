/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { DiscussionGroupMode, TChatConversation } from '@/common/config/storage';
import { useAssistantList } from '@/renderer/hooks/assistant';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@/renderer/pages/guid/constants';
import type { AssistantListItem } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import {
  isEmoji,
  resolveAvatarImageSrc,
} from '@/renderer/pages/settings/AgentSettings/AssistantManagement/assistantUtils';
import { buildDiscussionGroupParams } from '@/renderer/pages/conversation/utils/createConversationParams';
import { Button, Checkbox, Input, Message, Modal, Radio, Typography } from '@arco-design/web-react';
import { Robot } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const resolveAssistantDisplayName = (assistant: AssistantListItem, localeKey: string): string => {
  return assistant.nameI18n?.[localeKey] || assistant.name;
};

const resolveAssistantDescription = (assistant: AssistantListItem, localeKey: string): string => {
  return assistant.descriptionI18n?.[localeKey] || assistant.description || '';
};

const AssistantAvatar: React.FC<{ assistant: AssistantListItem }> = ({ assistant }) => {
  const avatarImageSrc = resolveAvatarImageSrc(assistant.avatar, CUSTOM_AVATAR_IMAGE_MAP);
  if (avatarImageSrc) {
    return <img src={avatarImageSrc} alt={assistant.name} className='w-24px h-24px rd-12px object-cover shrink-0' />;
  }

  if (assistant.avatar && isEmoji(assistant.avatar)) {
    return <span className='text-18px leading-24px w-24px text-center shrink-0'>{assistant.avatar}</span>;
  }

  return (
    <span className='w-24px h-24px rd-12px bg-[var(--fill-2)] flex items-center justify-center shrink-0'>
      <Robot size='14' />
    </span>
  );
};

const DEFAULT_MODE: DiscussionGroupMode = 'debate';

const CreateDiscussionGroupModal: React.FC<{
  visible: boolean;
  workspace: string;
  onCancel: () => void;
  onCreated: (conversation: TChatConversation) => void;
}> = ({ visible, workspace, onCancel, onCreated }) => {
  const { t, i18n } = useTranslation();
  const { assistants, localeKey } = useAssistantList();
  const [groupName, setGroupName] = useState('');
  const [mode, setMode] = useState<DiscussionGroupMode>(DEFAULT_MODE);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const availableAssistants = useMemo(() => {
    return assistants.filter((assistant) => assistant.isPreset && assistant.enabled !== false);
  }, [assistants]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setGroupName(t('conversation.group.defaultName'));
    setMode(DEFAULT_MODE);
    setSelectedAssistantIds(availableAssistants.slice(0, 3).map((assistant) => assistant.id));
  }, [availableAssistants, t, visible]);

  const handleSubmit = async () => {
    if (selectedAssistantIds.length < 2) {
      Message.warning(t('conversation.group.minimumParticipants'));
      return;
    }

    const selectedAssistants = availableAssistants.filter((assistant) => selectedAssistantIds.includes(assistant.id));
    if (selectedAssistants.length < 2) {
      Message.warning(t('conversation.group.minimumParticipants'));
      return;
    }

    setSubmitting(true);
    try {
      const params = await buildDiscussionGroupParams({
        name: groupName.trim() || t('conversation.group.defaultName'),
        workspace,
        language: i18n.language,
        mode,
        assistants: selectedAssistants.map((assistant) => ({
          assistantId: assistant.id,
          name: resolveAssistantDisplayName(assistant, localeKey),
          avatar: assistant.avatar,
          description: resolveAssistantDescription(assistant, localeKey),
          presetAgentType: assistant.presetAgentType,
        })),
      });

      const conversation = await ipcBridge.conversation.create.invoke(params);
      onCreated(conversation);
    } catch (error) {
      console.error('Failed to create discussion group:', error);
      Message.error(t('conversation.group.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('conversation.group.createTitle')}
      visible={visible}
      onCancel={onCancel}
      footer={
        <div className='flex justify-end gap-8px'>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type='primary' loading={submitting} onClick={() => void handleSubmit()}>
            {t('conversation.group.createAction')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-16px'>
        <div className='flex flex-col gap-6px'>
          <Typography.Text>{t('conversation.group.nameLabel')}</Typography.Text>
          <Input value={groupName} onChange={setGroupName} placeholder={t('conversation.group.namePlaceholder')} />
        </div>

        <div className='flex flex-col gap-6px'>
          <Typography.Text>{t('conversation.group.modeLabel')}</Typography.Text>
          <Radio.Group value={mode} onChange={(value) => setMode(value as DiscussionGroupMode)} type='button'>
            <Radio value='debate'>{t('conversation.group.modeDebate')}</Radio>
            <Radio value='broadcast'>{t('conversation.group.modeBroadcast')}</Radio>
          </Radio.Group>
          <Typography.Text type='secondary'>{t(`conversation.group.modeHint.${mode}`)}</Typography.Text>
        </div>

        <div className='flex flex-col gap-8px'>
          <Typography.Text>{t('conversation.group.participantsLabel')}</Typography.Text>
          <div className='max-h-320px overflow-y-auto flex flex-col gap-8px pr-4px'>
            {availableAssistants.map((assistant) => {
              const selected = selectedAssistantIds.includes(assistant.id);
              return (
                <div
                  key={assistant.id}
                  className={`flex items-start gap-10px p-10px rd-10px border border-solid ${selected ? 'border-[var(--color-primary-light-4)] bg-[var(--color-fill-1)]' : 'border-[var(--border-base)] bg-transparent'}`}
                >
                  <Checkbox
                    checked={selected}
                    onChange={(checked) => {
                      setSelectedAssistantIds((prev) => {
                        if (checked) {
                          return prev.includes(assistant.id) ? prev : [...prev, assistant.id];
                        }
                        return prev.filter((id) => id !== assistant.id);
                      });
                    }}
                  />
                  <AssistantAvatar assistant={assistant} />
                  <div className='min-w-0 flex-1'>
                    <Typography.Text className='block font-medium'>
                      {resolveAssistantDisplayName(assistant, localeKey)}
                    </Typography.Text>
                    <Typography.Paragraph
                      className='!mb-0 text-[var(--color-text-3)]'
                      ellipsis={{ rows: 2, expandable: false }}
                    >
                      {resolveAssistantDescription(assistant, localeKey) || t('conversation.group.noDescription')}
                    </Typography.Paragraph>
                  </div>
                </div>
              );
            })}
          </div>
          <Typography.Text type='secondary'>{t('conversation.group.minimumParticipantsHint')}</Typography.Text>
        </div>
      </div>
    </Modal>
  );
};

export default CreateDiscussionGroupModal;
