import React, { useMemo, useRef, useState } from 'react';
import { Button, Input, Message } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
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
// 必须同步更新 tests/e2e/cases/teams/team-create.e2e.ts、team-whitelist.e2e.ts、
// team-name-validation.e2e.ts 中的 selector，并立即向上汇报改动情况。
// 注意：迁移到 AionModal variant='standard' 后，关闭按钮为 button[aria-label="Close"]，
// 不再是 .arco-btn-text / .arco-modal-close-icon。
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
      variant='standard'
      visible={visible}
      onCancel={handleClose}
      className='team-create-modal'
      style={{ width: 900, maxWidth: 'calc(100vw - 72px)' }}
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
      autoFocus={false}
      unmountOnExit={false}
      // 通栏双栏是团队创建独有的布局：关闭内容区默认内边距，让中间竖分隔线贴边贯穿。
      // 标题区 / 按钮区 / 居中 / 最大高度均沿用 standard 统一规则。
      contentStyle={{ padding: 0, overflow: 'hidden' }}
      header={{
        title: t('team.create.title', { defaultValue: 'New Team' }),
        subtitle: t('team.create.subtitle', {
          defaultValue: 'Let multiple AI assistants team up and collaborate. We suggest one team focuses on a single goal — create separate teams for different tasks.',
        }),
        showClose: true,
      }}
      footer={{
        render: () => (
          <div className='flex justify-end gap-10px'>
            <Button onClick={handleClose} className='!h-38px min-w-84px !rounded-8px !px-18px !text-13px'>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='primary'
              onClick={handleCreate}
              loading={loading}
              disabled={!name.trim() || selectedMembers.length === 0 || !hasOneLeader}
              className='!h-38px min-w-100px !rounded-8px !px-18px !text-13px'
            >
              {t('team.create.confirm', { defaultValue: 'Confirm Create' })}
            </Button>
          </div>
        ),
      }}
    >
      <div
        data-testid='team-create-layout'
        className='grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
        style={{ height: 'min(54vh, 470px)', minHeight: 390 }}
      >
        <section
          className='flex min-h-0 flex-col border-r border-border-3 px-20px pb-18px pt-12px'
          data-testid='team-create-assistant-pane'
        >
          <div className='mb-12px text-15px font-600 leading-22px text-t-secondary'>
            {t('team.create.allAssistantsWithCount', {
              count: allAssistants.length,
              defaultValue: `All assistants (${allAssistants.length})`,
            })}
          </div>
          {allAssistants.length === 0 ? (
            <div className='flex min-h-112px items-center justify-center rounded-8px border border-dashed border-border-2 bg-fill-1 py-14px text-13px text-t-tertiary'>
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

        <section className='flex min-h-0 flex-col px-20px pb-14px pt-12px' data-testid='team-create-details-pane'>
          <TeamMemberDraftList
            members={selectedMembers}
            leaderSelectionId={leaderSelectionId}
            onLeaderChange={setLeaderSelectionId}
            onRemove={handleRemoveDraft}
          />

          <div className='mt-14px shrink-0 border-t border-border-2 pt-14px'>
            <div className='grid grid-cols-[76px_minmax(0,1fr)] items-center gap-x-14px gap-y-10px'>
              <div className='text-14px font-600 leading-21px text-t-secondary'>
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
                  className='!h-38px !rounded-8px !text-13px'
                />
              </div>

              <div className='text-14px font-500 leading-21px text-t-secondary'>
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
