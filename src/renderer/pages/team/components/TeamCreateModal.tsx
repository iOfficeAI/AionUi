import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Message, Tooltip } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { FolderOpen, Info, Close, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TTeam, TeamAgent } from '@/common/types/teamTypes';
import type { AvailableAgent } from '@renderer/utils/model/agentTypes';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@renderer/pages/guid/constants';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import { isElectronDesktop } from '@renderer/utils/platform';
import {
  agentKey,
  agentFromKey,
  resolveConversationType,
  resolveTeamAgentType,
  filterTeamSupportedAgents,
} from './agentSelectUtils';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

const AgentCardIcon: React.FC<{ agent: AvailableAgent }> = ({ agent }) => {
  const logo = getAgentLogo(agent.backend);
  const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
  const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');

  if (avatarImage) return <img src={avatarImage} alt={agent.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />;
  if (isEmoji) return <span style={{ fontSize: 24, lineHeight: '32px' }}>{agent.avatar}</span>;
  if (logo) return <img src={logo} alt={agent.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />;
  return <Robot size='32' />;
};

const TeamCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { cliAgents } = useConversationAgents();
  const [name, setName] = useState('');
  const [dispatchAgentKey, setDispatchAgentKey] = useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState('');
  const [loading, setLoading] = useState(false);
  const nameInputRef = useRef<RefInputType | null>(null);

  const allAgents = filterTeamSupportedAgents([...cliAgents]);
  const isDesktop = isElectronDesktop();

  useEffect(() => {
    if (visible) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [visible]);

  const handleClose = () => {
    setName('');
    setDispatchAgentKey(undefined);
    setWorkspace('');
    onClose();
  };

  const handleBrowseWorkspace = async () => {
    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
    if (files?.[0]) {
      setWorkspace(files[0]);
    }
  };

  const handleCreate = async () => {
    const userId = user?.id ?? 'system_default_user';
    setLoading(true);
    try {
      const agents: TeamAgent[] = [];

      const dispatchAgent = dispatchAgentKey ? agentFromKey(dispatchAgentKey, allAgents) : undefined;
      const dispatchAgentType = resolveTeamAgentType(dispatchAgent, 'acp');
      agents.push({
        slotId: '',
        conversationId: '',
        role: 'lead',
        status: 'pending',
        agentType: dispatchAgentType,
        agentName: dispatchAgent?.name ?? name,
        conversationType: resolveConversationType(dispatchAgentType),
        cliPath: dispatchAgent?.cliPath,
        customAgentId: dispatchAgent?.customAgentId,
      });

      const team = await ipcBridge.team.create.invoke({
        userId,
        name,
        workspace,
        workspaceMode: 'shared',
        agents,
      });

      // The platform bridge swallows provider errors and returns a sentinel object
      const result = team as unknown as { __bridgeError?: boolean; message?: string };
      if (result.__bridgeError) {
        Message.error(result.message ?? t('team.create.error', { defaultValue: 'Failed to create team' }));
        return;
      }

      onCreated(team);
      handleClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      Message.error(msg || t('team.create.error', { defaultValue: 'Failed to create team' }));
    } finally {
      setLoading(false);
    }
  };

  const canCreate = name.trim().length > 0 && dispatchAgentKey !== undefined;

  return (
    <Modal
      title={t('team.create.title', { defaultValue: 'Create Team' })}
      visible={visible}
      onCancel={handleClose}
      footer={null}
      style={{ width: 520 }}
      autoFocus={false}
      focusLock
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <div className='flex flex-col gap-20px'>
        {/* Team name */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
          </label>
          <Input
            ref={nameInputRef}
            placeholder={t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
            value={name}
            onChange={setName}
          />
        </div>

        {/* Team Leader (dispatch agent) */}
        <div className='flex flex-col gap-6px'>
          <div className='flex items-center justify-between'>
            <label className='text-sm text-[var(--color-text-2)] font-medium'>
              {t('team.create.step.dispatch', { defaultValue: 'Team Leader' })}
            </label>
            <Tooltip
              content={t('team.create.supportedAgentsHint', {
                defaultValue: 'Currently supports Claude and Codex. More agents coming soon.',
              })}
              position='top'
            >
              <Info theme='outline' size='14' fill='var(--color-text-4)' className='cursor-default' />
            </Tooltip>
          </div>
          <span className='text-12px text-[var(--color-text-4)]'>
            {t('team.create.leaderDesc', {
              defaultValue: 'Understands your goals and coordinates agents to complete tasks',
            })}
          </span>
          {allAgents.length === 0 ? (
            <div className='flex items-center justify-center py-20px text-12px text-[var(--color-text-4)]'>
              {t('team.create.noSupportedAgents', { defaultValue: 'No supported agents installed' })}
            </div>
          ) : (
            <div
              className='grid gap-8px overflow-y-auto'
              style={{ gridTemplateColumns: 'repeat(5, 1fr)', maxHeight: 290 }}
            >
              {allAgents.map((agent) => {
                const key = agentKey(agent);
                const isSelected = dispatchAgentKey === key;
                return (
                  <div
                    key={key}
                    onClick={() => setDispatchAgentKey(isSelected ? undefined : key)}
                    className={`flex flex-col items-center gap-6px px-8px py-10px rd-8px cursor-pointer transition-all border ${
                      isSelected
                        ? 'border-[var(--color-primary-6)] bg-[var(--color-primary-light-1)]'
                        : 'border-transparent bg-fill-2 hover:bg-fill-3'
                    }`}
                  >
                    <AgentCardIcon agent={agent} />
                    <span className='text-12px text-[var(--color-text-1)] text-center leading-16px w-full truncate'>
                      {agent.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Workspace - optional folder picker (desktop only) or text input (webui) */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.step.workspace', { defaultValue: 'Workspace' })}
            <span className='ml-4px text-[var(--color-text-4)] font-normal text-xs'>
              {t('common.optional', { defaultValue: '(optional)' })}
            </span>
          </label>
          {isDesktop ? (
            <Input
              readOnly
              value={workspace}
              placeholder={t('team.create.workspacePlaceholder', { defaultValue: 'Workspace path (optional)' })}
              suffix={
                workspace ? (
                  <Close
                    theme='outline'
                    size='14'
                    fill='var(--color-text-3)'
                    className='cursor-pointer hover:opacity-70'
                    onClick={() => setWorkspace('')}
                  />
                ) : undefined
              }
              addAfter={
                <Button icon={<FolderOpen size='16' />} onClick={handleBrowseWorkspace}>
                  {t('common.browse', { defaultValue: 'Browse' })}
                </Button>
              }
            />
          ) : (
            <Input
              placeholder={t('team.create.workspacePlaceholder', { defaultValue: 'Workspace path (optional)' })}
              value={workspace}
              onChange={setWorkspace}
            />
          )}
        </div>

        {/* Footer */}
        <div className='flex justify-end pt-4px'>
          <Button type='primary' loading={loading} disabled={!canCreate} onClick={handleCreate}>
            {t('team.create.confirm', { defaultValue: 'Create Team' })}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TeamCreateModal;
