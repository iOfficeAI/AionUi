import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Input, Message, Tooltip } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { Close, Search, CloseSmall } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { resolveLocaleKey } from '@/common/utils';
import type { TTeam } from '@/common/types/team/teamTypes';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useConversationAssistants } from '@renderer/pages/conversation/hooks/useConversationAssistants';
import AionModal from '@renderer/components/base/AionModal';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import {
  assistantKey,
  assistantFromId,
  filterTeamSupportedAssistants,
  AssistantOptionLabel,
  assistantToOption,
} from './assistantSelectUtils';
import type { TeamAssistantOption } from './assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from './teamCreateModelResolver';

// [E2E SYNC] 修改此组件的 DOM 结构（class、标题、关闭按钮等）时，
// 必须同步更新 tests/e2e/cases/teams/team-create.e2e.ts 和 team-whitelist.e2e.ts 中的 selector，
// 并立即向上汇报改动情况。
const FormItem = Form.Item;

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

const AssistantRadioRow: React.FC<{
  assistant: TeamAssistantOption;
  isSelected: boolean;
  onClick: () => void;
}> = ({ assistant, isSelected, onClick }) => {
  const { t } = useTranslation();
  const disabled = assistant.team_capable === false;
  // `team_block_reason` is a backend-authored English string; surface a
  // localized message instead of rendering it raw in a non-English UI.
  const blockReason = disabled
    ? t('settings.assistantTeamUnsupported', { defaultValue: 'This assistant cannot be used in team mode right now.' })
    : null;
  const row = (
    <div
      className={`flex items-center gap-12px rounded-8px px-12px py-9px transition-colors ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${isSelected ? 'bg-aou-1' : disabled ? '' : 'hover:bg-fill-2'}`}
      style={isSelected ? { boxShadow: 'inset 0 0 0 1px var(--aou-6)' } : undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
      data-testid={`team-create-agent-option-${assistantKey(assistant)}`}
    >
      <div
        className='h-16px w-16px flex-shrink-0 rounded-full transition-all'
        style={{
          boxSizing: 'border-box',
          border: isSelected ? '5px solid var(--aou-6)' : '1.5px solid var(--color-border-3)',
        }}
      />
      <div className='min-w-0 flex-1 overflow-hidden'>
        <AssistantOptionLabel assistant={assistant} />
        {blockReason ? <div className='mt-4px truncate text-11px text-t-tertiary'>{blockReason}</div> : null}
      </div>
    </div>
  );

  if (blockReason) {
    return <Tooltip content={blockReason}>{row}</Tooltip>;
  }

  return row;
};

const TeamCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n?.language ?? 'en-US');
  const { user } = useAuth();
  const { presetAssistants } = useConversationAssistants();
  const [name, setName] = useState('');
  const [leaderAssistantId, setLeaderAssistantId] = useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const nameInputRef = useRef<RefInputType | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleToggleSearch = () => {
    if (searchExpanded) {
      setSearch('');
      setSearchExpanded(false);
    } else {
      setSearchExpanded(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  };

  const allAssistants = useMemo(
    () => filterTeamSupportedAssistants(presetAssistants.map((assistant) => assistantToOption(assistant, localeKey))),
    [presetAssistants, localeKey]
  );

  const filteredAssistants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return allAssistants;
    }
    return allAssistants.filter((assistant) => assistant.name.toLowerCase().includes(q));
  }, [allAssistants, search]);

  const hasSearchResults = filteredAssistants.length > 0;

  useEffect(() => {
    if (visible) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [visible]);

  const handleClose = () => {
    setName('');
    setLeaderAssistantId(undefined);
    setWorkspace('');
    setSearch('');
    setSearchExpanded(false);
    onClose();
  };

  const handleSelectLeader = (assistantId: string) => {
    setLeaderAssistantId(assistantId);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Message.warning(t('team.create.nameRequired', { defaultValue: 'Please enter a team name' }));
      nameInputRef.current?.focus();
      return;
    }
    if (!leaderAssistantId) {
      Message.warning(t('team.create.leaderRequired', { defaultValue: 'Please select a team leader' }));
      return;
    }
    const user_id = user?.id ?? 'system_default_user';
    setLoading(true);
    try {
      const assistants: TeamAssistantInput[] = [];

      const leaderAssistant = leaderAssistantId ? assistantFromId(leaderAssistantId, allAssistants) : undefined;
      const resolvedModel = await resolveDefaultTeamAgentModel({
        assistant_id: leaderAssistant?.id,
        assistant_backend: leaderAssistant?.backend,
      });
      assistants.push({
        role: 'leader',
        assistant_name: leaderAssistant?.name || 'Leader',
        assistant_id: leaderAssistant?.id,
        model: resolvedModel,
      });

      const team = await ipcBridge.team.create.invoke({
        user_id,
        name,
        workspace,
        workspace_mode: 'shared',
        assistants,
      });

      // The platform bridge swallows provider errors and returns a sentinel object
      const result = team as unknown as { __bridgeError?: boolean; message?: string };
      if (result.__bridgeError) {
        Message.error(getConversationCreateErrorMessage(result.message ?? t('team.create.error'), t));
        return;
      }

      onCreated(team);
      handleClose();
    } catch (error) {
      Message.error(getConversationCreateErrorMessage(error, t));
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
        padding: 0,
        overflow: 'hidden',
      }}
      header={{
        render: () => (
          <div className='flex items-center justify-between border-b border-border-2 bg-dialog-fill-0 px-24px py-18px'>
            <h3 className='m-0 text-16px font-600 text-t-primary'>
              {t('team.create.title', { defaultValue: 'Create Team' })}
            </h3>
            <Button
              type='text'
              icon={<Close size='18' fill='currentColor' className='text-t-secondary' />}
              onClick={handleClose}
              className='!h-28px !w-28px !min-w-28px !p-0 !rd-8px hover:!bg-fill-2'
            />
          </div>
        ),
      }}
      footer={
        <div className='flex justify-end gap-10px border-t border-border-2 bg-dialog-fill-0 px-24px py-16px'>
          <Button onClick={handleClose} className='min-w-80px' style={{ borderRadius: 8 }}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='primary'
            onClick={handleCreate}
            loading={loading}
            disabled={!name.trim() || !leaderAssistantId}
            className='min-w-80px'
            style={{ borderRadius: 8 }}
          >
            {t('team.create.confirm', { defaultValue: 'Create Team' })}
          </Button>
        </div>
      }
    >
      <div className='px-24px py-20px' style={{ maxHeight: 'min(72vh, 640px)', overflowY: 'auto' }}>
        <Form layout='vertical'>
          {/* Team name */}
          <FormItem
            label={
              <span className='text-12px font-500 text-t-secondary'>
                {t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
                <span className='ml-4px text-danger-6'>*</span>
              </span>
            }
          >
            <Input
              ref={nameInputRef}
              placeholder={t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
              value={name}
              onChange={setName}
              data-testid='team-create-name-input'
            />
          </FormItem>

          {/* Team Leader */}
          <FormItem
            label={
              <div className='flex flex-col gap-2px'>
                <span className='text-12px font-500 text-t-secondary'>
                  {t('team.create.step.dispatch', { defaultValue: 'Team Leader' })}
                  <span className='ml-4px text-danger-6'>*</span>
                </span>
                <span className='text-11px font-normal leading-16px text-t-tertiary'>
                  {t('team.create.leaderDesc', {
                    defaultValue: 'Receives your instructions and spawns teammates as needed during the conversation',
                  })}
                </span>
              </div>
            }
          >
            {allAssistants.length === 0 ? (
              <div className='flex items-center justify-center rounded-10px border border-dashed border-border-2 bg-fill-1 py-20px text-12px text-t-tertiary'>
                {t('team.create.noSupportedAgents', { defaultValue: 'No supported assistants available' })}
              </div>
            ) : (
              <div className='relative flex flex-col gap-8px'>
                {/* 搜索框（点搜索图标后展开） */}
                {searchExpanded && (
                  <div className='flex items-center gap-8px rounded-8px border border-border-2 bg-bg-2 px-12px py-8px focus-within:border-primary-6'>
                    <Search size='14' fill='currentColor' className='flex-shrink-0 text-t-tertiary' />
                    <input
                      ref={searchInputRef}
                      className='flex-1 border-none bg-transparent text-13px text-t-primary outline-none placeholder:text-t-tertiary'
                      placeholder={t('team.create.searchPlaceholder', { defaultValue: 'Search assistants...' })}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      data-testid='team-create-leader-search'
                    />
                  </div>
                )}

                {/* 列表 —— 根据 agent 数量自适应，最大 320px */}
                <div className='max-h-320px overflow-y-auto rounded-12px border border-border-2 bg-fill-1 p-6px'>
                  {!hasSearchResults ? (
                    <div className='flex items-center justify-center py-20px text-12px text-t-tertiary'>
                      {t('team.create.noSearchResults', { defaultValue: 'No results found' })}
                    </div>
                  ) : (
                    filteredAssistants.map((assistant) => {
                      const assistantId = assistantKey(assistant);
                      return (
                        <AssistantRadioRow
                          key={assistantId}
                          assistant={assistant}
                          isSelected={leaderAssistantId === assistantId}
                          onClick={() => handleSelectLeader(assistantId)}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </FormItem>

          {/* Project / Workspace */}
          <FormItem
            label={
              <span className='text-12px font-500 text-t-secondary'>
                {t('team.create.step.workspace', { defaultValue: 'Project' })}
                <span className='ml-4px text-11px font-normal text-t-tertiary'>
                  {t('common.optional', { defaultValue: '(optional)' })}
                </span>
              </span>
            }
          >
            <WorkspaceFolderSelect
              value={workspace}
              onChange={setWorkspace}
              placeholder={t('team.create.selectFolder', { defaultValue: 'Select folder' })}
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
