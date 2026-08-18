import { Button, Input, Message, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AionModal from '@renderer/components/base/AionModal';
import { useTeamAssistantOptions } from '../hooks/useTeamAssistantOptions';
import TeamAssistantPicker from './memberPicker/TeamAssistantPicker';
import TeamMemberDraftList, { type TeamMemberDraft } from './memberPicker/TeamMemberDraftList';
import type { TeamAssistantOption } from './assistantSelectUtils';
import type { CreateTeamPresetInput } from '@/common/adapter/teamPresetBridge';
import type { TeamPreset, TeamPresetMember } from '@/common/types/team/teamTypes';

type Props = {
  visible: boolean;
  preset?: TeamPreset | null;
  onCancel: () => void;
  onSaved: (input: CreateTeamPresetInput, presetId?: string) => Promise<void> | void;
};

const makeSelectionId = (id: string) => `${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// 模块级常量引用：内联对象字面量会让 Arco TextArea 的 autoSize effect 每次渲染都重新触发。
const DESCRIPTION_AUTO_SIZE = { minRows: 3, maxRows: 6 };

const TeamPresetEditorModal: React.FC<Props> = ({ visible, preset, onCancel, onSaved }) => {
  const { t, i18n } = useTranslation();
  const { assistants } = useTeamAssistantOptions(i18n?.language ?? 'en-US');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [exampleInput, setExampleInput] = useState('');
  const [members, setMembers] = useState<TeamMemberDraft[]>([]);
  const [leaderSelectionId, setLeaderSelectionId] = useState<string>();

  useEffect(() => {
    if (!visible) return;
    setName(preset?.name ?? '');
    setCategory(preset?.category ?? '');
    setDescription(preset?.description ?? '');
    setTags(preset?.expertise_tags ?? []);
    setExamples(preset?.example_prompts ?? []);
    if (!preset) {
      setMembers([]);
      setLeaderSelectionId(undefined);
      return;
    }
    const drafts = preset.members
      .toSorted((a, b) => a.order - b.order)
      .map((member) => {
        const assistant =
          assistants.find((option) => option.id === member.assistant_id) ??
          ({
            id: member.assistant_id ?? `missing-${member.order}`,
            name: `${member.assistant_name} (${t('team.presets.memberMissing', { defaultValue: 'Missing' })})`,
            backend: member.assistant_backend,
            team_selectable: false,
          } satisfies TeamAssistantOption);
        return { selectionId: makeSelectionId(assistant.id), assistant };
      });
    setMembers(drafts);
    const leaderIndex = preset.members.findIndex(
      (member) => member.assistant_id === preset.leader.assistant_id && member.order === preset.leader.order
    );
    setLeaderSelectionId(drafts[leaderIndex]?.selectionId ?? drafts[0]?.selectionId);
  }, [visible, preset, assistants]);

  const availableAssistants = useMemo(
    () => assistants.filter((assistant) => assistant.team_selectable !== false),
    [assistants]
  );
  const addTag = () => {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags((current) => [...current, value]);
    setTagInput('');
  };
  const addExample = () => {
    const value = exampleInput.trim();
    if (value && !examples.includes(value)) setExamples((current) => [...current, value]);
    setExampleInput('');
  };
  const addMember = (assistant: TeamAssistantOption) => {
    const draft = { selectionId: makeSelectionId(assistant.id), assistant };
    setMembers((current) => [...current, draft]);
    setLeaderSelectionId((current) => current ?? draft.selectionId);
  };
  const removeMember = (selectionId: string) => {
    const next = members.filter((member) => member.selectionId !== selectionId);
    setMembers(next);
    if (leaderSelectionId === selectionId) setLeaderSelectionId(next[0]?.selectionId);
  };
  const save = async () => {
    if (!name.trim())
      return Message.warning(t('team.presets.nameRequired', { defaultValue: 'Please enter a preset name' }));
    if (members.length === 0)
      return Message.warning(t('team.presets.memberRequired', { defaultValue: 'Please add at least one member' }));
    const leaderDraft = members.find((member) => member.selectionId === leaderSelectionId) ?? members[0];
    if (!leaderDraft)
      return Message.warning(t('team.presets.leaderRequired', { defaultValue: 'Please select a leader' }));
    const mapped: TeamPresetMember[] = members.map((member, order) => ({
      assistant_backend: member.assistant.backend ?? '',
      assistant_id: member.assistant.id,
      assistant_name: member.assistant.name,
      role: member.selectionId === leaderDraft.selectionId ? 'leader' : 'teammate',
      order,
    }));
    const leader = mapped[members.indexOf(leaderDraft)];
    await onSaved(
      {
        user_id: '',
        name: name.trim(),
        category: category.trim() || undefined,
        description: description.trim(),
        expertise_tags: tags,
        example_prompts: examples,
        leader,
        members: mapped,
      },
      preset?.id
    );
  };
  return (
    <AionModal
      variant='standard'
      visible={visible}
      onCancel={onCancel}
      className='team-preset-editor-modal'
      style={{ width: 720, maxWidth: 'calc(100vw - 72px)' }}
      // 必须压在创建弹窗（wrap 10000 / mask 9999）之上（旧版 e3f154559 同款数值）
      wrapStyle={{ zIndex: 10001 }}
      maskStyle={{ zIndex: 10000 }}
      autoFocus={false}
      unmountOnExit
      header={{
        title: preset
          ? t('team.presets.editTitle', { defaultValue: 'Edit expert team' })
          : t('team.presets.createTitle', { defaultValue: 'New expert team' }),
      }}
      footer={{
        render: () => (
          <div className='flex justify-end gap-10px'>
            <Button onClick={onCancel} className='!h-38px min-w-84px !rounded-8px !px-18px !text-13px'>
              {t('common.cancel')}
            </Button>
            <Button
              type='primary'
              onClick={() => void save()}
              data-testid='preset-editor-save'
              className='!h-38px min-w-100px !rounded-8px !px-18px !text-13px'
            >
              {t('common.save')}
            </Button>
          </div>
        ),
      }}
    >
      <div className='flex max-h-[70vh] flex-col gap-16px overflow-y-auto px-4px py-2px'>
        <div className='grid grid-cols-[90px_minmax(0,1fr)] items-center gap-x-14px gap-y-10px'>
          <span className='text-14px font-600 text-t-secondary'>
            {t('team.presets.nameLabel', { defaultValue: 'Name' })}
            <span className='ml-4px text-danger-6'>*</span>
          </span>
          <Input
            value={name}
            onChange={setName}
            placeholder={t('team.presets.namePlaceholder', { defaultValue: 'Preset name' })}
            data-testid='preset-editor-name'
            className='!h-38px !rounded-8px !text-13px'
          />
          <span className='text-14px font-500 text-t-secondary'>
            {t('team.presets.categoryLabel', { defaultValue: 'Category' })}
          </span>
          <Input
            value={category}
            onChange={setCategory}
            placeholder={t('team.presets.categoryPlaceholder', { defaultValue: 'e.g. Engineering' })}
            data-testid='preset-editor-category'
            className='!h-38px !rounded-8px !text-13px'
          />
          <span className='self-start pt-8px text-14px font-500 text-t-secondary'>
            {t('team.presets.descriptionLabel', { defaultValue: 'Description' })}
          </span>
          <Input.TextArea
            value={description}
            onChange={setDescription}
            placeholder={t('team.presets.descriptionPlaceholder', { defaultValue: 'What does this team do?' })}
            data-testid='preset-editor-description'
            // 常量引用：内联对象每次渲染都会触发 Arco TextArea 的 autoSize effect 循环 setState。
            autoSize={DESCRIPTION_AUTO_SIZE}
            className='!rounded-8px !text-13px'
          />
        </div>
        <div className='flex flex-col gap-8px'>
          <span className='text-14px font-600 text-t-secondary'>
            {t('team.presets.tagsLabel', { defaultValue: 'Expertise tags' })}
          </span>
          <div className='flex flex-wrap gap-6px'>
            {tags.map((value) => (
              <Tag key={value} closable onClose={() => setTags(tags.filter((item) => item !== value))}>
                {value}
              </Tag>
            ))}
          </div>
          <div className='flex gap-8px'>
            <Input
              value={tagInput}
              onChange={setTagInput}
              onPressEnter={addTag}
              placeholder={t('team.presets.tagPlaceholder', { defaultValue: 'Add a tag' })}
              data-testid='preset-editor-tag-input'
              className='!h-34px !rounded-8px !text-13px'
            />
            <Button type='secondary' size='small' icon={<Plus theme='outline' size='14' />} onClick={addTag}>
              {t('common.add', { defaultValue: 'Add' })}
            </Button>
          </div>
        </div>
        <div className='flex flex-col gap-8px'>
          <span className='text-14px font-600 text-t-secondary'>
            {t('team.presets.examplesLabel', { defaultValue: 'Example tasks' })}
          </span>
          <ul className='m-0 flex list-none flex-col gap-4px p-0'>
            {examples.map((value) => (
              <li className='flex items-center gap-8px' key={value}>
                <span className='flex-1 truncate text-13px text-t-secondary'>{value}</span>
                <Button type='text' size='mini' onClick={() => setExamples(examples.filter((item) => item !== value))}>
                  {t('common.delete', { defaultValue: 'Delete' })}
                </Button>
              </li>
            ))}
          </ul>
          <div className='flex gap-8px'>
            <Input
              value={exampleInput}
              onChange={setExampleInput}
              onPressEnter={addExample}
              placeholder={t('team.presets.examplePlaceholder', { defaultValue: 'Add an example task' })}
              data-testid='preset-editor-example-input'
              className='!h-34px !rounded-8px !text-13px'
            />
            <Button type='secondary' size='small' icon={<Plus theme='outline' size='14' />} onClick={addExample}>
              {t('common.add', { defaultValue: 'Add' })}
            </Button>
          </div>
        </div>
        <div className='flex flex-col gap-8px'>
          <span className='text-14px font-600 text-t-secondary'>
            {t('team.presets.membersLabel', { defaultValue: 'Members' })}
            <span className='ml-4px text-danger-6'>*</span>
          </span>
          {availableAssistants.length ? (
            <TeamAssistantPicker
              assistants={availableAssistants}
              onSelect={addMember}
              testIdPrefix='preset-editor-agent'
              density='compact'
            />
          ) : (
            <div className='flex min-h-112px items-center justify-center rounded-8px border border-dashed border-border-2 bg-fill-1 py-14px text-13px text-t-tertiary'>
              {t('team.create.noSupportedAgents', { defaultValue: 'No supported assistants available' })}
            </div>
          )}
          <div className='max-h-240px overflow-y-auto rounded-8px bg-fill-1 p-8px'>
            <TeamMemberDraftList
              members={members}
              leaderSelectionId={leaderSelectionId}
              onLeaderChange={setLeaderSelectionId}
              onRemove={removeMember}
            />
          </div>
        </div>
      </div>
    </AionModal>
  );
};

export default TeamPresetEditorModal;
