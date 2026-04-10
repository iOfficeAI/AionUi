import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Input, Message, Tooltip } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { FolderOpen, Close, Robot, Folder, FolderPlus, Check, Down } from '@icon-park/react';
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

const RECENT_WS_KEY = 'aionui:recent-workspaces';

const getRecentWorkspaces = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_WS_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const addRecentWorkspace = (path: string) => {
  try {
    const prev = getRecentWorkspaces();
    const next = [path, ...prev.filter((p) => p !== path)].slice(0, 5);
    localStorage.setItem(RECENT_WS_KEY, JSON.stringify(next));
  } catch {}
};

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
  const [wsDropdownVisible, setWsDropdownVisible] = useState(false);
  const nameInputRef = useRef<RefInputType | null>(null);
  const wsTriggerRef = useRef<HTMLDivElement>(null);

  const allAgents = filterTeamSupportedAgents([...cliAgents]);
  const isDesktop = isElectronDesktop();
  const recentWorkspaces = getRecentWorkspaces();

  useEffect(() => {
    if (visible) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [visible]);

  useEffect(() => {
    if (!wsDropdownVisible) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (wsTriggerRef.current && !wsTriggerRef.current.contains(e.target as Node)) {
        setWsDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [wsDropdownVisible]);

  const handleClose = () => {
    setName('');
    setDispatchAgentKey(undefined);
    setWorkspace('');
    setWsDropdownVisible(false);
    onClose();
  };

  const handleBrowseWorkspace = async () => {
    setWsDropdownVisible(false);
    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
    if (files?.[0]) {
      setWorkspace(files[0]);
      addRecentWorkspace(files[0]);
    }
  };

  const handleSelectRecentWorkspace = (path: string) => {
    setWorkspace(path);
    addRecentWorkspace(path);
    setWsDropdownVisible(false);
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
  const folderName = workspace ? workspace.split(/[\\/]/).pop() || workspace : '';

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

        {/* Team Leader */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.step.dispatch', { defaultValue: 'Team Leader' })}
          </label>
          <span className='text-12px text-[var(--color-text-3)]'>
            {t('team.create.leaderDesc', {
              defaultValue: 'Understands your goals and coordinates agents to complete tasks',
            })}
          </span>
          {allAgents.length === 0 ? (
            <div className='flex items-center justify-center py-20px text-12px text-[var(--color-text-4)]'>
              {t('team.create.noSupportedAgents', { defaultValue: 'No supported agents installed' })}
            </div>
          ) : (
            <>
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
              <span className='text-12px text-[var(--color-text-3)]'>
                {t('team.create.supportedAgentsHint', {
                  defaultValue: 'Currently supports Claude and Codex. More agents coming soon.',
                })}
              </span>
            </>
          )}
        </div>

        {/* Workspace */}
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.create.step.workspace', { defaultValue: 'Workspace' })}
            <span className='ml-4px text-[var(--color-text-4)] font-normal text-xs'>
              {t('common.optional', { defaultValue: '(optional)' })}
            </span>
          </label>
          {isDesktop ? (
            <div className='relative' ref={wsTriggerRef}>
              {/* Trigger */}
              <div
                onClick={() => (recentWorkspaces.length > 0 ? setWsDropdownVisible((v) => !v) : handleBrowseWorkspace())}
                className={`flex items-center gap-10px px-12px py-8px rd-6px border cursor-pointer transition-all min-h-36px ${
                  wsDropdownVisible
                    ? 'border-[var(--color-primary-6)]'
                    : 'border-[var(--color-border-2)] hover:border-[var(--color-primary-6)]'
                }`}
              >
                <FolderOpen theme='outline' size='16' fill='var(--color-text-3)' style={{ flexShrink: 0 }} />
                <div className='flex-1 min-w-0'>
                  {workspace ? (
                    <div className='flex flex-col'>
                      <span className='text-sm text-[var(--color-text-1)] leading-20px'>{folderName}</span>
                      <span className='text-11px text-[var(--color-text-4)] truncate leading-16px'>{workspace}</span>
                    </div>
                  ) : (
                    <span className='text-sm text-[var(--color-text-3)]'>
                      {t('team.create.selectFolder', { defaultValue: 'Select folder' })}
                    </span>
                  )}
                </div>
                {workspace ? (
                  <Close
                    theme='outline'
                    size='14'
                    fill='var(--color-text-3)'
                    className='shrink-0 hover:opacity-70'
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setWorkspace('');
                      setWsDropdownVisible(false);
                    }}
                  />
                ) : (
                  <Down size='14' fill='var(--color-text-3)' style={{ flexShrink: 0 }} />
                )}
              </div>

              {/* Dropdown */}
              {wsDropdownVisible && (
                <div className='absolute top-full left-0 right-0 mt-4px z-50 bg-[var(--color-bg-2)] rd-8px overflow-hidden shadow-lg border border-[var(--color-border-1)] py-4px'>
                  {recentWorkspaces.length > 0 && (
                    <>
                      <div className='px-12px py-6px text-12px text-[var(--color-text-3)] font-medium'>
                        {t('team.create.recentLabel', { defaultValue: 'Recent' })}
                      </div>
                      {recentWorkspaces.map((path) => {
                        const name = path.split(/[\\/]/).pop() || path;
                        const isSelected = workspace === path;
                        return (
                          <div
                            key={path}
                            onClick={() => handleSelectRecentWorkspace(path)}
                            className='flex items-center gap-10px px-12px py-8px cursor-pointer hover:bg-fill-2 transition-all'
                          >
                            <Folder theme='outline' size='16' fill='var(--color-text-3)' style={{ flexShrink: 0 }} />
                            <div className='flex-1 min-w-0'>
                              <div className='text-sm text-[var(--color-text-1)] leading-20px'>{name}</div>
                              <div className='text-11px text-[var(--color-text-4)] truncate leading-16px'>{path}</div>
                            </div>
                            {isSelected && (
                              <Check size='14' fill='var(--color-primary-6)' style={{ flexShrink: 0 }} />
                            )}
                          </div>
                        );
                      })}
                      <div className='mx-12px my-4px h-1px bg-[var(--color-border-2)]' />
                    </>
                  )}
                  <div
                    onClick={handleBrowseWorkspace}
                    className='flex items-center gap-10px px-12px py-8px cursor-pointer hover:bg-fill-2 transition-all'
                  >
                    <FolderPlus theme='outline' size='16' fill='var(--color-text-2)' style={{ flexShrink: 0 }} />
                    <span className='text-sm text-[var(--color-text-1)]'>
                      {t('team.create.chooseDifferentFolder', { defaultValue: 'Choose a different folder' })}
                    </span>
                  </div>
                </div>
              )}
            </div>
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
          <Tooltip
            disabled={canCreate}
            content={
              !name.trim()
                ? t('team.create.nameRequired', { defaultValue: 'Please enter a team name' })
                : t('team.create.leaderRequired', { defaultValue: 'Please select a team leader' })
            }
            position='top'
          >
            <span style={{ display: 'inline-block' }}>
              <Button type='primary' loading={loading} disabled={!canCreate} onClick={handleCreate}>
                {t('team.create.confirm', { defaultValue: 'Create Team' })}
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>
    </Modal>
  );
};

export default TeamCreateModal;
