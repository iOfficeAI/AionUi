import React, { useMemo, useRef, useState } from 'react';
import { Button, Input, Message } from '@arco-design/web-react';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/team/teamTypes';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import AionModal from '@renderer/components/base/AionModal';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { useTeamAssistantOptions } from '../hooks/useTeamAssistantOptions';
import type { TeamAssistantOption } from './assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from './teamCreateModelResolver';
import TeamAssistantPicker from './memberPicker/TeamAssistantPicker';
import TeamAssistantPickerDropdown from './memberPicker/TeamAssistantPickerDropdown';
import TeamMemberDraftList, { type TeamMemberDraft } from './memberPicker/TeamMemberDraftList';

// [E2E SYNC] 修改此组件的 DOM 结构（class、标题、关闭按钮等）时，
// 必须同步更新 tests/e2e/cases/teams/team-create.e2e.ts、team-whitelist.e2e.ts、
// team-name-validation.e2e.ts 中的 selector，并立即向上汇报改动情况。
// 注意：迁移到 AionModal variant='standard' 后，关闭按钮为 button[aria-label="Close"]，
// 不再是 .arco-btn-text / .arco-modal-close-icon。
// 窄屏（layout.isMobile，<768px）改为单栏：布局根为 team-create-layout-mobile，
// 助手选择器是锚在 team-create-add-member-btn 上的下拉（选中即关，助手随即出现在下方列表）；
// 桌面双栏为 team-create-layout。
type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

const TeamCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { assistants: allAssistants } = useTeamAssistantOptions(i18n?.language ?? 'en-US');
  const [name, setName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<TeamMemberDraft[]>([]);
  const [leaderSelectionId, setLeaderSelectionId] = useState<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState('');
  const [loading, setLoading] = useState(false);
  // 窄屏专用：助手选择器以下拉列表形式，锚在“添加成员”按钮上按需唤出。
  const [assistantDropdownOpen, setAssistantDropdownOpen] = useState(false);
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
    setAssistantDropdownOpen(false);
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
            throw new Error(`${member.assistant.name}: ${getConversationCreateErrorMessage(error, t)}`, {
              cause: error,
            });
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
  // 助手选择器：桌面端嵌在左栏，窄屏端复用同一份放进底部面板。空态文案与逻辑完全一致。
  const assistantPicker = (
    <>
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
    </>
  );

  // 团队名 + 工作空间：桌面端与窄屏端共用同一份字段（文案、testId、交互一致）。
  const teamFields = (
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
  );

  // 桌面端：左右双栏，通栏竖分隔线（保持原样，宽屏不受窄屏改动影响）。
  const desktopBody = (
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
        {assistantPicker}
      </section>

      <section className='flex min-h-0 flex-col px-20px pb-14px pt-12px' data-testid='team-create-details-pane'>
        <TeamMemberDraftList
          members={selectedMembers}
          leaderSelectionId={leaderSelectionId}
          onLeaderChange={setLeaderSelectionId}
          onRemove={handleRemoveDraft}
        />
        <div className='mt-14px shrink-0 border-t border-border-2 pt-14px'>{teamFields}</div>
      </section>
    </div>
  );

  // 窄屏端：单栏——只留“已选成员”与团队字段；助手选择器做成锚在“添加成员”按钮上的下拉列表。
  // 选中即关：下拉收起后，用户直接看到助手出现在下方的已选成员列表里（这就是“加成功了”的反馈）。
  const handleSelectFromDropdown = (assistant: TeamAssistantOption) => {
    handleSelectAssistant(assistant);
    setAssistantDropdownOpen(false);
  };
  const addMemberDropdown = (
    <TeamAssistantPickerDropdown
      assistants={allAssistants}
      onSelect={handleSelectFromDropdown}
      visible={assistantDropdownOpen}
      onVisibleChange={setAssistantDropdownOpen}
      testIdPrefix='team-create-agent'
      panelTestId='team-create-assistant-pane'
      emptyText={t('team.create.noSupportedAgents', { defaultValue: 'No supported assistants available' })}
    >
      <Button
        type='outline'
        size='small'
        icon={<Plus theme='outline' size='14' fill='currentColor' />}
        data-testid='team-create-add-member-btn'
        className='!h-30px !rounded-999px !px-12px !text-13px'
      >
        {t('team.addMember.title', { defaultValue: 'Add member' })}
      </Button>
    </TeamAssistantPickerDropdown>
  );
  const mobileBody = (
    <div data-testid='team-create-layout-mobile' className='flex min-h-0 flex-col gap-16px px-20px py-16px'>
      {/* 窄屏无固定高度的父级：给成员列表框一个固定 max-height（同桌面思路），成员变多时框内滚动，
          团队字段区始终留在下方可见。 */}
      <section className='flex min-h-0 flex-col' data-testid='team-create-details-pane'>
        <TeamMemberDraftList
          members={selectedMembers}
          leaderSelectionId={leaderSelectionId}
          onLeaderChange={setLeaderSelectionId}
          onRemove={handleRemoveDraft}
          headerAction={addMemberDropdown}
          listBoxClassName='!max-h-[38vh]'
        />
      </section>

      <section className='shrink-0'>{teamFields}</section>
    </div>
  );

  return (
    <AionModal
      variant='standard'
      visible={visible}
      onCancel={handleClose}
      className='team-create-modal'
      style={{
        width: isMobile ? 'calc(100vw - 32px)' : 900,
        maxWidth: isMobile ? 'calc(100vw - 32px)' : 'calc(100vw - 72px)',
      }}
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
      autoFocus={false}
      unmountOnExit={false}
      // 桌面通栏双栏是团队创建独有的布局：关闭内容区默认内边距，让中间竖分隔线贴边贯穿。
      // 窄屏改为单栏（自带内边距），标题区 / 按钮区 / 居中 / 最大高度均沿用 standard 统一规则。
      contentStyle={{ padding: 0, overflow: 'hidden' }}
      header={{
        title: t('team.create.title', { defaultValue: 'New Team' }),
        subtitle: t('team.create.subtitle', {
          defaultValue:
            'Let multiple AI assistants team up and collaborate. We suggest one team focuses on a single goal — create separate teams for different tasks.',
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
      {isMobile ? mobileBody : desktopBody}
    </AionModal>
  );
};

export default TeamCreateModal;
