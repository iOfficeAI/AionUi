import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Message } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { Close } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/team/teamTypes';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import AionModal from '@renderer/components/base/AionModal';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { useTeamAssistantOptions } from '../hooks/useTeamAssistantOptions';
import type { TeamAssistantOption } from './assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from './teamCreateModelResolver';
import TeamAssistantPicker from './memberPicker/TeamAssistantPicker';
import TeamMemberDraftList, { type TeamMemberDraft } from './memberPicker/TeamMemberDraftList';

// [E2E SYNC] 修改此组件的 DOM 结构（class、标题、关闭按钮等）时，
// 必须同步更新 tests/e2e/cases/teams/team-create.e2e.ts 和 team-whitelist.e2e.ts 中的 selector，
// 并立即向上汇报改动情况。
type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

const TeamCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { assistants: allAssistants } = useTeamAssistantOptions(i18n?.language ?? 'en-US');
  const [name, setName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<TeamMemberDraft[]>([]);
  const [leaderSelectionId, setLeaderSelectionId] = useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState('');
  const [loading, setLoading] = useState(false);
  const nameInputRef = useRef<RefInputType | null>(null);

  const hasOneLeader = useMemo(
    () => Boolean(leaderSelectionId && selectedMembers.some((member) => member.selectionId === leaderSelectionId)),
    [leaderSelectionId, selectedMembers]
  );

  useEffect(() => {
    if (visible) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [visible]);

  const handleClose = () => {
    setName('');
    setSelectedMembers([]);
    setLeaderSelectionId(undefined);
    setWorkspace('');
    onClose();
  };

  const handleSelectAssistant = (assistant: TeamAssistantOption) => {
    const draft = {
      selectionId: `${assistant.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      assistant,
    };
    setSelectedMembers((members) => [...members, draft]);
    setLeaderSelectionId((current) => current ?? draft.selectionId);
  };

  const handleRemoveDraft = (selectionId: string) => {
    const nextMembers = selectedMembers.filter((member) => member.selectionId !== selectionId);
    setSelectedMembers(nextMembers);
    if (leaderSelectionId === selectionId) {
      setLeaderSelectionId(nextMembers[0]?.selectionId);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Message.warning(t('team.create.nameRequired', { defaultValue: 'Please enter a team name' }));
      nameInputRef.current?.focus();
      return;
    }
    if (selectedMembers.length === 0) {
      Message.warning(t('team.create.selectAtLeastOneMember', { defaultValue: 'Select at least one team member' }));
      return;
    }
    if (!hasOneLeader) {
      Message.warning(t('team.create.selectOneLeader', { defaultValue: 'Select one Team Leader' }));
      return;
    }
    const user_id = user?.id ?? 'system_default_user';
    setLoading(true);
    try {
      const resolvedModels = await Promise.all(
        selectedMembers.map(async (member) => {
          try {
            const model = await resolveDefaultTeamAgentModel({
              assistant_id: member.assistant.id,
              assistant_backend: member.assistant.backend,
            });
            return [member.selectionId, model] as const;
          } catch (error) {
            throw new Error(`${member.assistant.name}: ${getConversationCreateErrorMessage(error, t)}`);
          }
        })
      );
      const modelBySelectionId = new Map(resolvedModels);
      const agents: TeamAssistantInput[] = selectedMembers.map((member) => ({
        role: member.selectionId === leaderSelectionId ? 'leader' : 'teammate',
        assistant_name: member.assistant.name,
        assistant_id: member.assistant.id,
        model: modelBySelectionId.get(member.selectionId),
      }));

      const team = await ipcBridge.team.create.invoke({
        user_id,
        name,
        workspace,
        workspace_mode: 'shared',
        agents,
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
      style={{ width: 980, maxWidth: 'calc(100vw - 80px)' }}
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
          <div className='relative bg-dialog-fill-0 px-32px pb-22px pt-26px'>
            <h3 className='m-0 text-20px font-700 leading-28px text-t-primary'>
              {t('team.create.title', { defaultValue: 'New Team' })}
            </h3>
            <p className='m-0 mt-6px text-14px leading-22px text-t-secondary'>
              {t('team.create.subtitle', {
                defaultValue: 'Choose members, and assign one Leader. The same assistant can be added multiple times.',
              })}
            </p>
            <Button
              type='text'
              icon={<Close size='24' fill='currentColor' className='text-t-secondary' />}
              onClick={handleClose}
              className='absolute right-28px top-28px !h-32px !w-32px !min-w-32px !p-0 !rd-8px hover:!bg-fill-2'
            />
          </div>
        ),
      }}
      footer={
        <div className='flex justify-end gap-12px border-t border-border-2 bg-dialog-fill-0 px-32px py-16px'>
          <Button onClick={handleClose} className='!h-40px min-w-88px !rounded-8px !px-20px !text-14px'>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            type='primary'
            onClick={handleCreate}
            loading={loading}
            disabled={!name.trim() || selectedMembers.length === 0 || !hasOneLeader}
            className='!h-40px min-w-104px !rounded-8px !px-20px !text-14px'
          >
            {t('team.create.confirm', { defaultValue: 'Confirm Create' })}
          </Button>
        </div>
      }
    >
      <div
        className='grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-t border-border-2'
        style={{ height: 'min(58vh, 520px)', minHeight: 430 }}
      >
        <section
          className='flex min-h-0 flex-col border-r border-border-2 px-24px py-22px'
          data-testid='team-create-assistant-pane'
        >
          <div className='mb-14px text-16px font-600 leading-24px text-t-secondary'>
            {t('team.create.allAssistantsWithCount', {
              count: allAssistants.length,
              defaultValue: `All assistants (${allAssistants.length})`,
            })}
          </div>
          {allAssistants.length === 0 ? (
            <div className='flex min-h-126px items-center justify-center rounded-8px border border-dashed border-border-2 bg-fill-1 py-16px text-14px text-t-tertiary'>
              {t('team.create.noSupportedAgents', { defaultValue: 'No supported assistants available' })}
            </div>
          ) : (
            <TeamAssistantPicker
              assistants={allAssistants}
              onSelect={handleSelectAssistant}
              testIdPrefix='team-create-agent'
              density='modal'
            />
          )}
        </section>

        <section className='flex min-h-0 flex-col px-24px py-22px' data-testid='team-create-details-pane'>
          <TeamMemberDraftList
            members={selectedMembers}
            leaderSelectionId={leaderSelectionId}
            onLeaderChange={setLeaderSelectionId}
            onRemove={handleRemoveDraft}
          />

          <div className='mt-18px border-t border-border-2 pt-18px'>
            <div className='grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-16px gap-y-12px'>
              <div className='text-15px font-600 leading-22px text-t-secondary'>
                {t('team.create.nameLabel', { defaultValue: 'Team name' })}
                <span className='ml-4px text-danger-6'>*</span>
              </div>
              <div>
                <Input
                  ref={nameInputRef}
                  placeholder={t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
                  value={name}
                  onChange={setName}
                  data-testid='team-create-name-input'
                  className='!h-40px !rounded-8px !text-14px'
                />
              </div>

              <div className='text-15px font-500 leading-22px text-t-secondary'>
                {t('team.create.workspaceLabel', { defaultValue: 'Workspace' })}
              </div>
              <div>
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
              </div>
            </div>
          </div>
        </section>
      </div>
    </AionModal>
  );
};

export default TeamCreateModal;
