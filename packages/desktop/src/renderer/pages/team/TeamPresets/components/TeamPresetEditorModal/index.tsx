/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Message, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import AionModal from '@renderer/components/base/AionModal';
import { useTeamAssistantOptions } from '@/renderer/pages/team/hooks/useTeamAssistantOptions';
import type { TeamAssistantOption } from '@/renderer/pages/team/components/assistantSelectUtils';
import TeamAssistantPicker from '@/renderer/pages/team/components/memberPicker/TeamAssistantPicker';
import TeamMemberDraftList, {
  type TeamMemberDraft,
} from '@/renderer/pages/team/components/memberPicker/TeamMemberDraftList';
import type { TeamPreset, TeamPresetMember } from '../../types';
import type { CreateTeamPresetInput, UpdateTeamPresetInput } from '../../hooks/useTeamPresets';

type TeamPresetEditorModalProps = {
  visible: boolean;
  preset?: TeamPreset | null;
  onCancel: () => void;
  onSaved: (preset: TeamPreset) => void;
  createPreset: (input: CreateTeamPresetInput) => TeamPreset;
  updatePreset: (id: string, input: UpdateTeamPresetInput) => TeamPreset | null;
};

function draftToPresetMember(draft: TeamMemberDraft, order: number): TeamPresetMember {
  return {
    assistant_backend: draft.assistant.backend ?? '',
    assistant_id: draft.assistant.id,
    model: undefined,
    assistant_name: draft.assistant.name,
    role: 'teammate',
    order,
  };
}

export const TeamPresetEditorModal: React.FC<TeamPresetEditorModalProps> = ({
  visible,
  preset,
  onCancel,
  onSaved,
  createPreset,
  updatePreset,
}) => {
  const { t, i18n } = useTranslation();
  const { assistants: allAssistants } = useTeamAssistantOptions(i18n?.language ?? 'en-US');
  const isCreate = !preset;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [exampleInput, setExampleInput] = useState('');
  const [memberDrafts, setMemberDrafts] = useState<TeamMemberDraft[]>([]);
  const [leaderSelectionId, setLeaderSelectionId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    if (preset) {
      setName(preset.name);
      setCategory(preset.category ?? '');
      setDescription(preset.description);
      setTags(preset.expertise_tags);
      setExamples(preset.example_prompts);
      const sorted = [...preset.members].toSorted((a, b) => a.order - b.order);
      const drafts: TeamMemberDraft[] = [];
      let resolvedLeaderId: string | undefined;
      for (const member of sorted) {
        const assistant = member.assistant_id
          ? allAssistants.find((option) => option.id === member.assistant_id)
          : undefined;
        const fallback: TeamAssistantOption = assistant ?? {
          id: member.assistant_id ?? `missing-${Date.now()}`,
          name: `${member.assistant_name} (${t('team.presets.memberMissing', { defaultValue: 'missing' })})`,
          backend: member.assistant_backend,
          team_selectable: false,
        };
        const draft = {
          selectionId: `${fallback.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          assistant: fallback,
        };
        drafts.push(draft);
        if (member.assistant_id === preset.leader.assistant_id && member.order === preset.leader.order) {
          resolvedLeaderId = draft.selectionId;
        }
      }
      setMemberDrafts(drafts);
      setLeaderSelectionId(resolvedLeaderId ?? drafts[0]?.selectionId);
    } else {
      setName('');
      setCategory('');
      setDescription('');
      setTags([]);
      setTagInput('');
      setExamples([]);
      setExampleInput('');
      setMemberDrafts([]);
      setLeaderSelectionId(undefined);
    }
  }, [visible, preset, allAssistants, t]);

  const hasOneLeader = useMemo(
    () => Boolean(leaderSelectionId && memberDrafts.some((member) => member.selectionId === leaderSelectionId)),
    [leaderSelectionId, memberDrafts]
  );

  const handleAddTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    if (tags.includes(value)) {
      setTagInput('');
      return;
    }
    setTags((prev) => [...prev, value]);
    setTagInput('');
  };

  const handleRemoveTag = (value: string) => {
    setTags((prev) => prev.filter((item) => item !== value));
  };

  const handleAddExample = () => {
    const value = exampleInput.trim();
    if (!value) return;
    if (examples.includes(value)) {
      setExampleInput('');
      return;
    }
    setExamples((prev) => [...prev, value]);
    setExampleInput('');
  };

  const handleRemoveExample = (value: string) => {
    setExamples((prev) => prev.filter((item) => item !== value));
  };

  const handleAddMember = (assistant: TeamAssistantOption) => {
    const draft = {
      selectionId: `${assistant.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      assistant,
    };
    setMemberDrafts((members) => [...members, draft]);
    setLeaderSelectionId((current) => current ?? draft.selectionId);
  };

  const handleRemoveMember = (selectionId: string) => {
    const nextMembers = memberDrafts.filter((member) => member.selectionId !== selectionId);
    setMemberDrafts(nextMembers);
    if (leaderSelectionId === selectionId) {
      setLeaderSelectionId(nextMembers[0]?.selectionId);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Message.warning(t('team.presets.nameRequired', { defaultValue: 'Please enter a preset name' }));
      return;
    }
    if (memberDrafts.length === 0) {
      Message.warning(t('team.presets.memberRequired', { defaultValue: 'Please add at least one member' }));
      return;
    }
    if (!hasOneLeader) {
      Message.warning(t('team.presets.leaderRequired', { defaultValue: 'Please select a leader' }));
      return;
    }

    const sortedDrafts = memberDrafts.map((draft, index) => ({ draft, order: index }));
    const leaderEntry = sortedDrafts.find((entry) => entry.draft.selectionId === leaderSelectionId);
    if (!leaderEntry) {
      Message.warning(t('team.presets.leaderRequired', { defaultValue: 'Please select a leader' }));
      return;
    }

    const members: TeamPresetMember[] = sortedDrafts.map((entry) => draftToPresetMember(entry.draft, entry.order));
    const leader = draftToPresetMember(leaderEntry.draft, leaderEntry.order);
    leader.role = 'leader';
    const leaderIndex = members.findIndex(
      (member) => member.assistant_id === leader.assistant_id && member.order === leader.order
    );
    if (leaderIndex >= 0) {
      members[leaderIndex].role = 'leader';
    }

    const input: CreateTeamPresetInput = {
      user_id: '',
      name: name.trim(),
      category: category.trim() || undefined,
      description: description.trim(),
      expertise_tags: tags,
      example_prompts: examples,
      leader,
      members,
    };

    const saved = isCreate ? createPreset(input) : updatePreset(preset.id, input);
    if (!saved) {
      Message.error(t('team.presets.saveFailed', { defaultValue: 'Failed to save preset' }));
      return;
    }
    onSaved(saved);
  };

  const availableAssistants = useMemo(
    () => allAssistants.filter((assistant) => assistant.team_selectable !== false),
    [allAssistants]
  );

  return (
    <AionModal
      variant='standard'
      visible={visible}
      onCancel={onCancel}
      className='team-preset-editor-modal'
      style={{ width: 720, maxWidth: 'calc(100vw - 72px)' }}
      wrapStyle={{ zIndex: 10001 }}
      maskStyle={{ zIndex: 10000 }}
      autoFocus={false}
      unmountOnExit
      header={{
        title: isCreate
          ? t('team.presets.createTitle', { defaultValue: 'New expert team' })
          : t('team.presets.editTitle', { defaultValue: 'Edit expert team' }),
      }}
      footer={{
        render: () => (
          <div className='flex justify-end gap-10px'>
            <Button onClick={onCancel} className='!h-38px min-w-84px !rounded-8px !px-18px !text-13px'>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type='primary'
              onClick={handleSave}
              className='!h-38px min-w-100px !rounded-8px !px-18px !text-13px'
            >
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
          </div>
        ),
      }}
    >
      <div className='flex max-h-[70vh] flex-col gap-16px overflow-y-auto px-4px py-2px'>
        <div className='grid grid-cols-[90px_minmax(0,1fr)] items-center gap-x-14px gap-y-10px'>
          <div className='text-14px font-600 text-t-secondary'>
            {t('team.presets.nameLabel', { defaultValue: 'Name' })}
            <span className='ml-4px text-danger-6'>*</span>
          </div>
          <Input
            value={name}
            onChange={setName}
            placeholder={t('team.presets.namePlaceholder', { defaultValue: 'Preset name' })}
            data-testid='preset-editor-name'
            className='!h-38px !rounded-8px !text-13px'
          />

          <div className='text-14px font-500 text-t-secondary'>
            {t('team.presets.categoryLabel', { defaultValue: 'Category' })}
          </div>
          <Input
            value={category}
            onChange={setCategory}
            placeholder={t('team.presets.categoryPlaceholder', { defaultValue: 'e.g. Engineering' })}
            data-testid='preset-editor-category'
            className='!h-38px !rounded-8px !text-13px'
          />

          <div className='self-start pt-8px text-14px font-500 text-t-secondary'>
            {t('team.presets.descriptionLabel', { defaultValue: 'Description' })}
          </div>
          <Input.TextArea
            value={description}
            onChange={setDescription}
            placeholder={t('team.presets.descriptionPlaceholder', { defaultValue: 'What does this team do?' })}
            data-testid='preset-editor-description'
            autoSize={{ minRows: 3, maxRows: 6 }}
            className='!rounded-8px !text-13px'
          />
        </div>

        <div className='flex flex-col gap-8px'>
          <span className='text-14px font-600 text-t-secondary'>
            {t('team.presets.tagsLabel', { defaultValue: 'Expertise tags' })}
          </span>
          <div className='flex flex-wrap gap-6px'>
            {tags.map((tag) => (
              <Tag key={tag} closable onClose={() => handleRemoveTag(tag)}>
                {tag}
              </Tag>
            ))}
          </div>
          <div className='flex gap-8px'>
            <Input
              value={tagInput}
              onChange={setTagInput}
              onPressEnter={handleAddTag}
              placeholder={t('team.presets.tagPlaceholder', { defaultValue: 'Add a tag' })}
              data-testid='preset-editor-tag-input'
              className='!h-34px !rounded-8px !text-13px'
            />
            <Button type='secondary' size='small' icon={<Plus theme='outline' size='14' />} onClick={handleAddTag}>
              {t('common.add', { defaultValue: 'Add' })}
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-8px'>
          <span className='text-14px font-600 text-t-secondary'>
            {t('team.presets.examplesLabel', { defaultValue: 'Example tasks' })}
          </span>
          <ul className='m-0 flex list-none flex-col gap-4px p-0'>
            {examples.map((example) => (
              <li key={example} className='flex items-center gap-8px'>
                <span className='flex-1 truncate text-13px text-t-secondary'>{example}</span>
                <Button type='text' size='mini' onClick={() => handleRemoveExample(example)}>
                  {t('common.delete', { defaultValue: 'Delete' })}
                </Button>
              </li>
            ))}
          </ul>
          <div className='flex gap-8px'>
            <Input
              value={exampleInput}
              onChange={setExampleInput}
              onPressEnter={handleAddExample}
              placeholder={t('team.presets.examplePlaceholder', { defaultValue: 'Add an example task' })}
              data-testid='preset-editor-example-input'
              className='!h-34px !rounded-8px !text-13px'
            />
            <Button type='secondary' size='small' icon={<Plus theme='outline' size='14' />} onClick={handleAddExample}>
              {t('common.add', { defaultValue: 'Add' })}
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-8px'>
          <span className='text-14px font-600 text-t-secondary'>
            {t('team.presets.membersLabel', { defaultValue: 'Members' })}
            <span className='ml-4px text-danger-6'>*</span>
          </span>
          {availableAssistants.length === 0 ? (
            <div className='flex min-h-112px items-center justify-center rounded-8px border border-dashed border-border-2 bg-fill-1 py-14px text-13px text-t-tertiary'>
              {t('team.create.noSupportedAgents', { defaultValue: 'No supported assistants available' })}
            </div>
          ) : (
            <TeamAssistantPicker
              assistants={availableAssistants}
              onSelect={handleAddMember}
              testIdPrefix='preset-editor-agent'
              density='compact'
            />
          )}
          <div className='max-h-240px overflow-y-auto rounded-8px bg-fill-1 p-8px'>
            <TeamMemberDraftList
              members={memberDrafts}
              leaderSelectionId={leaderSelectionId}
              onLeaderChange={setLeaderSelectionId}
              onRemove={handleRemoveMember}
            />
          </div>
        </div>
      </div>
    </AionModal>
  );
};

export default TeamPresetEditorModal;
