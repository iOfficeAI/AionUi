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
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import {
  isEmoji,
  resolveAvatarImageSrc,
} from '@/renderer/pages/settings/AgentSettings/AssistantManagement/assistantUtils';
import {
  buildDiscussionGroupParams,
  type DiscussionGroupParticipantInput,
} from '@/renderer/pages/conversation/utils/createConversationParams';
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

type ParticipantOption = DiscussionGroupParticipantInput & {
  selectionKey: string;
};

type ParticipantSection = {
  key: string;
  title: string;
  items: ParticipantOption[];
};

const buildSelectionKey = (participantType: ParticipantOption['type'], participantKey: string) => {
  return `${participantType}:${participantKey}`;
};

const buildCliParticipantDescription = (agent: AvailableAgent): string => {
  if (agent.cliPath) {
    return `${agent.backend} · ${agent.cliPath}`;
  }
  return agent.backend;
};

const ParticipantAvatar: React.FC<{ participant: ParticipantOption }> = ({ participant }) => {
  if (participant.type === 'cli-agent') {
    const logo = getAgentLogo(participant.agent.backend);
    if (logo) {
      return <img src={logo} alt={participant.name} className='w-24px h-24px object-contain shrink-0' />;
    }
  }

  const avatarImageSrc = resolveAvatarImageSrc(participant.avatar, CUSTOM_AVATAR_IMAGE_MAP);
  if (avatarImageSrc) {
    return <img src={avatarImageSrc} alt={participant.name} className='w-24px h-24px rd-12px object-cover shrink-0' />;
  }

  if (participant.avatar && isEmoji(participant.avatar)) {
    return <span className='text-18px leading-24px w-24px text-center shrink-0'>{participant.avatar}</span>;
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
  cliAgents: AvailableAgent[];
  presetAssistants: AvailableAgent[];
  onCancel: () => void;
  onCreated: (conversation: TChatConversation) => void;
}> = ({ visible, workspace, cliAgents, presetAssistants, onCancel, onCreated }) => {
  const { t, i18n } = useTranslation();
  const { assistants, localeKey } = useAssistantList();
  const [groupName, setGroupName] = useState('');
  const [mode, setMode] = useState<DiscussionGroupMode>(DEFAULT_MODE);
  const [selectedParticipantKeys, setSelectedParticipantKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const presetAssistantMap = useMemo(() => {
    return new Map(assistants.map((assistant) => [assistant.id, assistant]));
  }, [assistants]);

  const presetParticipantOptions = useMemo<ParticipantOption[]>(() => {
    return presetAssistants.map((assistant) => {
      const assistantId = assistant.customAgentId || assistant.name;
      const metadata = presetAssistantMap.get(assistantId);
      const participantKey = assistantId;
      return {
        type: 'preset-assistant',
        selectionKey: buildSelectionKey('preset-assistant', participantKey),
        participantKey,
        name: metadata ? resolveAssistantDisplayName(metadata, localeKey) : assistant.name,
        avatar: metadata?.avatar || assistant.avatar,
        description: metadata ? resolveAssistantDescription(metadata, localeKey) : '',
        presetAgentType: metadata?.presetAgentType || assistant.presetAgentType,
      };
    });
  }, [localeKey, presetAssistantMap, presetAssistants]);

  const cliParticipantOptions = useMemo<ParticipantOption[]>(() => {
    return cliAgents.map((agent) => {
      const participantKey = [agent.backend, agent.cliPath || '', agent.name].join(':');
      return {
        type: 'cli-agent',
        selectionKey: buildSelectionKey('cli-agent', participantKey),
        participantKey,
        name: agent.name,
        description: buildCliParticipantDescription(agent),
        agent,
      };
    });
  }, [cliAgents]);

  const sections = useMemo<ParticipantSection[]>(() => {
    return [
      {
        key: 'preset-assistants',
        title: t('conversation.dropdown.presetAssistants'),
        items: presetParticipantOptions,
      },
      {
        key: 'cli-agents',
        title: t('conversation.dropdown.cliAgents'),
        items: cliParticipantOptions,
      },
    ].filter((section) => section.items.length > 0);
  }, [cliParticipantOptions, presetParticipantOptions, t]);

  const availableParticipants = useMemo(() => {
    return sections.flatMap((section) => section.items);
  }, [sections]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setGroupName(t('conversation.group.defaultName'));
    setMode(DEFAULT_MODE);
    setSelectedParticipantKeys(availableParticipants.slice(0, 3).map((participant) => participant.selectionKey));
  }, [availableParticipants, t, visible]);

  const handleSubmit = async () => {
    if (selectedParticipantKeys.length < 2) {
      Message.warning(t('conversation.group.minimumParticipants'));
      return;
    }

    const selectedParticipants = availableParticipants.filter((participant) =>
      selectedParticipantKeys.includes(participant.selectionKey)
    );
    if (selectedParticipants.length < 2) {
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
        participants: selectedParticipants,
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
            {sections.map((section) => (
              <div key={section.key} className='flex flex-col gap-8px'>
                <Typography.Text type='secondary' className='text-12px uppercase tracking-0.08em'>
                  {section.title}
                </Typography.Text>
                {section.items.map((participant) => {
                  const selected = selectedParticipantKeys.includes(participant.selectionKey);
                  return (
                    <div
                      key={participant.selectionKey}
                      className={`flex items-start gap-10px p-10px rd-10px border border-solid ${selected ? 'border-[var(--color-primary-light-4)] bg-[var(--color-fill-1)]' : 'border-[var(--border-base)] bg-transparent'}`}
                    >
                      <Checkbox
                        checked={selected}
                        onChange={(checked) => {
                          setSelectedParticipantKeys((prev) => {
                            if (checked) {
                              return prev.includes(participant.selectionKey)
                                ? prev
                                : [...prev, participant.selectionKey];
                            }
                            return prev.filter((key) => key !== participant.selectionKey);
                          });
                        }}
                      />
                      <ParticipantAvatar participant={participant} />
                      <div className='min-w-0 flex-1'>
                        <Typography.Text className='block font-medium'>{participant.name}</Typography.Text>
                        <Typography.Paragraph
                          className='!mb-0 text-[var(--color-text-3)]'
                          ellipsis={{ rows: 2, expandable: false }}
                        >
                          {participant.description || t('conversation.group.noDescription')}
                        </Typography.Paragraph>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <Typography.Text type='secondary'>{t('conversation.group.minimumParticipantsHint')}</Typography.Text>
        </div>
      </div>
    </Modal>
  );
};

export default CreateDiscussionGroupModal;
