import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, Message } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { Close, Robot, Check } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpInitializeResult } from '@/common/types/acpTypes';
import type { TTeam, TeamAgent } from '@/common/types/teamTypes';
import type { AvailableAgent } from '@renderer/utils/model/agentTypes';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@renderer/pages/guid/constants';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import AionModal from '@renderer/components/base/AionModal';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import {
  agentKey,
  agentFromKey,
  resolveConversationType,
  resolveTeamAgentType,
  filterTeamSupportedAgents,
} from './agentSelectUtils';

const FormItem = Form.Item;

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

const AgentCardIcon: React.FC<{ agent: AvailableAgent }> = ({ agent }) => {
  const logo = getAgentLogo(agent.backend);
  const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
  const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');

  if (avatarImage)
    return <img src={avatarImage} alt={agent.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />;
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
  const [cachedInitResults, setCachedInitResults] = useState<Record<string, AcpInitializeResult> | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    ConfigStorage.get('acp.cachedInitializeResult')
      .then((data) => {
        if (active) setCachedInitResults(data ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible]);

  const allAgents = filterTeamSupportedAgents([...cliAgents], cachedInitResults);

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

  const handleCreate = async () => {
    if (!name.trim()) {
      Message.warning(t('team.create.nameRequired', { defaultValue: 'Please enter a team name' }));
      nameInputRef.current?.focus();
      return;
    }
    if (!dispatchAgentKey) {
      Message.warning(t('team.create.leaderRequired', { defaultValue: 'Please select a team leader' }));
      return;
    }
    const userId = user?.id ?? 'system_default_user';
    setLoading(true);
    try {
      const agents: TeamAgent[] = [];

      const dispatchAgent = dispatchAgentKey ? agentFromKey(dispatchAgentKey, allAgents) : undefined;
      const dispatchAgentType = resolveTeamAgentType(dispatchAgent, 'acp');
      agents.push({
        slotId: '',
        conversationId: '',
        role: 'leader',
        status: 'pending',
        agentType: dispatchAgentType,
        agentName: 'Leader',
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
  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      className='team-create-modal'
      style={{ width: 560 }}
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
      autoFocus={false}
      unmountOnExit={false}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        maxHeight: 'min(72vh, 680px)',
        overflow: 'auto',
      }}
      header={{
        render: () => (
          <div className='flex items-center justify-between border-b border-border-1 bg-dialog-fill-0 px-24px py-20px'>
            <h3 className='m-0 text-18px font-500 text-t-primary'>
              {t('team.create.title', { defaultValue: 'Create Team' })}
            </h3>
            <Button
              type='text'
              icon={<Close size='20' fill='currentColor' className='text-t-secondary' />}
              onClick={handleClose}
              className='!h-32px !w-32px !min-w-32px !p-0 !rd-8px hover:!bg-fill-1'
            />
          </div>
        ),
      }}
      footer={
        <div className='flex justify-end gap-10px border-t border-border-1 bg-dialog-fill-0 px-24px py-20px'>
          <Button onClick={handleClose} className='min-w-88px' style={{ borderRadius: 8 }}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='primary'
            onClick={handleCreate}
            loading={loading}
            className='min-w-88px'
            style={{ borderRadius: 8 }}
          >
            {t('team.create.confirm', { defaultValue: 'Create Team' })}
          </Button>
        </div>
      }
    >
      <div className='px-24px py-20px'>
        <Form layout='vertical'>
          {/* Team name */}
          <FormItem label={t('team.create.namePlaceholder', { defaultValue: 'Team name' })} required>
            <Input
              ref={nameInputRef}
              placeholder={t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
              value={name}
              onChange={setName}
            />
          </FormItem>

          {/* Team Leader */}
          <FormItem label={t('team.create.step.dispatch', { defaultValue: 'Team Leader' })} required>
            <div className='flex flex-col gap-8px'>
              <span className='text-12px leading-18px text-t-secondary'>
                {t('team.create.leaderDesc', {
                  defaultValue: 'Receives your instructions, breaks down the task, and assigns work to team agents',
                })}
              </span>
              {allAgents.length === 0 ? (
                <div className='flex items-center justify-center rounded-12px border border-dashed border-border-2 bg-fill-1 py-20px text-12px text-t-secondary'>
                  {t('team.create.noSupportedAgents', { defaultValue: 'No supported agents installed' })}
                </div>
              ) : (
                <div className='grid gap-8px' style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                  {allAgents.map((agent) => {
                    const key = agentKey(agent);
                    const isSelected = dispatchAgentKey === key;
                    return (
                      <div
                        key={key}
                        data-testid={`team-create-agent-card-${key}`}
                        onClick={() => setDispatchAgentKey(isSelected ? undefined : key)}
                        className={`flex flex-col items-center gap-6px px-8px py-10px rd-10px cursor-pointer transition-all border shadow-sm ${
                          isSelected
                            ? 'relative border-2 border-primary-5 bg-fill-2'
                            : 'border-border-2 bg-fill-1 hover:border-border-1 hover:bg-fill-2'
                        }`}
                      >
                        {isSelected && (
                          <span
                            data-testid={`team-create-agent-selected-badge-${key}`}
                            className='absolute right-6px top-6px flex h-16px w-16px items-center justify-center rounded-full bg-primary-6 text-white shadow-sm'
                          >
                            <Check size='10' fill='currentColor' className='shrink-0' />
                          </span>
                        )}
                        <AgentCardIcon agent={agent} />
                        <span className='w-full truncate text-center text-12px leading-16px text-t-primary'>
                          {agent.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </FormItem>

          {/* Workspace */}
          <FormItem
            label={
              <>
                {t('team.create.step.workspace', { defaultValue: 'Workspace' })}
                <span className='ml-4px text-xs font-normal text-t-tertiary'>
                  {t('common.optional', { defaultValue: '(optional)' })}
                </span>
              </>
            }
          >
            <WorkspaceFolderSelect
              value={workspace}
              onChange={setWorkspace}
              placeholder={t('team.create.selectFolder', { defaultValue: 'Select folder' })}
              inputPlaceholder={t('team.create.workspacePlaceholder', { defaultValue: 'Workspace path (optional)' })}
              recentLabel={t('team.create.recentLabel', { defaultValue: 'Recent' })}
              chooseDifferentLabel={t('team.create.chooseDifferentFolder', {
                defaultValue: 'Choose a different folder',
              })}
              triggerTestId='team-create-workspace-trigger'
              menuTestId='team-create-workspace-menu'
            />
          </FormItem>
        </Form>
      </div>
    </AionModal>
  );
};

export default TeamCreateModal;
