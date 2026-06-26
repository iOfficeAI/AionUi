import { ipcBridge } from '@/common';
import type { AssistantEditorViewModel, AssistantListItem } from './types';
import { useManagedAgentRuntimeCatalog } from '@/renderer/hooks/agent/useManagedAgents';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import { buildAgentRuntimeModeState } from '@/renderer/utils/model/agentRuntimeCatalog';
import type { AgentModeOption } from '@/renderer/utils/model/agentTypes';
import { Button, Select, Tag } from '@arco-design/web-react';
import { Info, Robot } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import IdentitySection from './editor/IdentitySection';
import PromptsSection from './editor/PromptsSection';
import DefaultsSection from './editor/DefaultsSection';
import RulesSection from './editor/RulesSection';

export type AssistantEditorSectionsProps = {
  editor: AssistantEditorViewModel;
  activeAssistant: AssistantListItem | null;
};

const AssistantEditorSections: React.FC<AssistantEditorSectionsProps> = ({ editor, activeAssistant }) => {
  const { t, i18n } = useTranslation();
  const localeKey = i18n.language;
  const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
  const { providers, getAvailableModels } = useModelProviderList();
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [newPromptDraft, setNewPromptDraft] = useState('');
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingPromptDraft, setEditingPromptDraft] = useState('');
  const [skillsPopupVisible, setSkillsPopupVisible] = useState(false);
  const [mcpPopupVisible, setMcpPopupVisible] = useState(false);

  const { isCreating, profile, agent, prompts, defaults, rules, skills, actions } = editor;
  const editName = profile.name;
  const setEditName = profile.setName;
  const editDescription = profile.description;
  const setEditDescription = profile.setDescription;
  const editAvatar = profile.avatar;
  const setEditAvatar = profile.setAvatar;
  const setEditAvatarPreview = profile.setAvatarPreview;
  const editAvatarImage = profile.avatarImage;
  const editAgent = agent.value;
  const setEditAgent = agent.setValue;
  const availableBackends = agent.availableBackends;
  const editRecommendedPromptsText = prompts.text;
  const setEditRecommendedPromptsText = prompts.setText;
  const defaultModelMode = defaults.model.mode;
  const setDefaultModelMode = defaults.model.setMode;
  const defaultModelValue = defaults.model.value;
  const setDefaultModelValue = defaults.model.setValue;
  const defaultPermissionMode = defaults.permission.mode;
  const setDefaultPermissionMode = defaults.permission.setMode;
  const defaultPermissionValue = defaults.permission.value;
  const setDefaultPermissionValue = defaults.permission.setValue;
  const defaultSkillsMode = defaults.skills.mode;
  const setDefaultSkillsMode = defaults.skills.setMode;
  const defaultMcpMode = defaults.mcps.mode;
  const setDefaultMcpMode = defaults.mcps.setMode;
  const availableMcpServers = defaults.mcps.availableServers;
  const selectedMcpIds = defaults.mcps.selectedIds;
  const setSelectedMcpIds = defaults.mcps.setSelectedIds;
  const editContext = rules.content;
  const setEditContext = rules.setContent;
  const promptViewMode = rules.viewMode;
  const setPromptViewMode = rules.setViewMode;
  const availableSkills = skills.availableSkills;
  const selectedSkills = skills.selectedSkills;
  const setSelectedSkills = skills.setSelectedSkills;
  const pendingSkills = skills.pendingSkills;
  const builtinAutoSkills = skills.builtinAutoSkills;
  const disabledBuiltinSkills = skills.disabledBuiltinSkills;
  const setDisabledBuiltinSkills = skills.setDisabledBuiltinSkills;
  const handleDuplicate = actions.duplicate;
  const getEditorSelectPopupContainer = (node: HTMLElement) =>
    node.closest('[data-editor-popup-root]') ?? node.parentElement ?? document.body;

  const isBuiltin = activeAssistant?.source === 'builtin';
  const isGenerated = activeAssistant?.source === 'generated';
  const isReadOnlyAssistant = isBuiltin;
  const isIdentityLocked = isBuiltin || isGenerated;
  const isDescriptionReadOnly = isBuiltin;
  const showSkills = isCreating || activeAssistant !== null;
  const currentBackend = availableBackends.find((option) => option.id === editAgent);
  const editAgentRuntimeKey = currentBackend?.runtimeKey || '';
  const providerModelOptions = providers.flatMap((provider) =>
    getAvailableModels(provider).map((modelName) => ({
      key: `${provider.id}-${modelName}`,
      value: modelName,
      label: `${provider.name || provider.id} · ${modelName}`,
    }))
  );
  const modelOptions = useMemo(() => {
    if (editAgentRuntimeKey === 'aionrs') {
      return providerModelOptions;
    }

    if (currentBackend && currentBackend.modelOptions.length > 0) {
      return currentBackend.modelOptions.map((model: { value: string; label: string }) => ({
        key: `${editAgent}-${model.value}`,
        value: model.value,
        label: model.label,
      }));
    }

    return [];
  }, [currentBackend, editAgent, editAgentRuntimeKey, providerModelOptions]);
  const currentAgentRuntimeCatalog = useMemo(
    () =>
      currentBackend
        ? managedAgentRuntimeCatalog.find((agentMetadata) => agentMetadata.id === currentBackend.id)
        : null,
    [currentBackend, managedAgentRuntimeCatalog]
  );
  const permissionOptions = useMemo<AgentModeOption[]>(
    () =>
      buildAgentRuntimeModeState(currentAgentRuntimeCatalog).options.map((option) => ({
        ...option,
        label: t(`agentMode.${option.value}`, { defaultValue: option.label }),
      })),
    [currentAgentRuntimeCatalog, localeKey, t]
  );
  const recommendedPromptItems = useMemo(
    () =>
      editRecommendedPromptsText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    [editRecommendedPromptsText]
  );
  const readOnlyLabel = t('common.readOnly', { defaultValue: 'Read only' });
  const rulesContainerHeight = rulesExpanded ? '440px' : promptViewMode === 'edit' ? '280px' : '240px';
  const autoSkillNames = builtinAutoSkills.map((skill) => skill.name);
  const autoDefaultOptionLabel = t('settings.assistantSelectAutoRememberLastUsed', {
    defaultValue: 'Remember last used automatically',
  });
  const selectedItemsLabel = (count: number) =>
    t('settings.assistantSelectedCount', {
      defaultValue: 'Selected {{count}} items',
      count,
    });
  const handlePickAvatarImage = async () => {
    try {
      const selectedFiles = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile'],
        filters: [
          {
            name: t('settings.assistantAvatarImageFiles', { defaultValue: 'Image files' }),
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
          },
        ],
      });
      const nextAvatar = selectedFiles?.[0];
      if (nextAvatar) {
        const previewBase64 = await ipcBridge.fs.getImageBase64.invoke({ path: nextAvatar });
        setEditAvatar(nextAvatar);
        setEditAvatarPreview(previewBase64 || undefined);
      }
    } catch (error) {
      console.error('Failed to pick assistant avatar image:', error);
    }
  };
  const editableSkillOptions = useMemo(() => {
    const optionMap = new Map<string, { value: string; label: string; isAuto?: boolean; disabled?: boolean }>();

    pendingSkills.forEach((skill) => {
      optionMap.set(skill.name, { value: skill.name, label: skill.name });
    });

    availableSkills.forEach((skill) => {
      optionMap.set(skill.name, {
        value: skill.name,
        label: skill.name,
      });
    });

    builtinAutoSkills.forEach((skill) => {
      optionMap.set(skill.name, {
        value: skill.name,
        label: skill.name,
        isAuto: true,
      });
    });

    return Array.from(optionMap.values());
  }, [availableSkills, builtinAutoSkills, pendingSkills, t]);
  const selectedSkillValues = useMemo(
    () =>
      Array.from(
        new Set([
          ...selectedSkills,
          ...builtinAutoSkills
            .filter((skill) => !disabledBuiltinSkills.includes(skill.name))
            .map((skill) => skill.name),
        ])
      ),
    [builtinAutoSkills, disabledBuiltinSkills, selectedSkills]
  );

  const applyPromptItems = (items: string[]) => {
    setEditRecommendedPromptsText(items.join('\n'));
  };

  const readonlySelectionSummary = (items: string[], emptyLabel: string) =>
    items.length > 0 ? items.join('、') : emptyLabel;

  const handleBeginPromptEdit = (index: number) => {
    setEditingPromptIndex(index);
    setEditingPromptDraft(recommendedPromptItems[index] ?? '');
  };

  const handleSavePromptEdit = () => {
    if (editingPromptIndex === null) return;
    const trimmed = editingPromptDraft.trim();
    if (!trimmed) return;
    const nextItems = [...recommendedPromptItems];
    nextItems[editingPromptIndex] = trimmed;
    applyPromptItems(nextItems);
    setEditingPromptIndex(null);
    setEditingPromptDraft('');
  };

  const handleDeletePrompt = (index: number) => {
    applyPromptItems(recommendedPromptItems.filter((_, promptIndex) => promptIndex !== index));
    if (editingPromptIndex === index) {
      setEditingPromptIndex(null);
      setEditingPromptDraft('');
    }
  };

  const handleAddPrompt = () => {
    const trimmed = newPromptDraft.trim();
    if (!trimmed) return;
    applyPromptItems([...recommendedPromptItems, trimmed]);
    setAddingPrompt(false);
    setNewPromptDraft('');
  };

  const handleSkillSelectionChange = (values: string[]) => {
    const nextSelected = values.filter((value) => !autoSkillNames.includes(value));
    const nextDisabledAuto = autoSkillNames.filter((skillName) => !values.includes(skillName));
    setSelectedSkills(nextSelected);
    setDisabledBuiltinSkills(nextDisabledAuto);
  };

  const renderAvatarPreview = () => {
    if (editAvatarImage) {
      return (
        <img
          src={editAvatarImage}
          alt=''
          className='h-full w-full rounded-inherit object-cover'
          style={{ display: 'block' }}
        />
      );
    }

    if (editAvatar) {
      return <span className='text-20px'>{editAvatar}</span>;
    }

    return <Robot theme='outline' size={20} />;
  };

  return (
    <div className='flex flex-col gap-16px pb-24px'>
      {isBuiltin && activeAssistant ? (
        <div
          className='rounded-12px border border-border-2 bg-fill-1 px-14px py-12px text-13px leading-20px text-t-secondary md:rounded-16px'
          data-testid='assistant-builtin-readonly-banner'
        >
          <div className='flex items-start gap-8px'>
            <Info theme='outline' size={16} className='mt-2px flex-shrink-0 text-primary-6' />
            <div>
              <span>
                {t('settings.assistantBuiltinReadonlyTip', {
                  defaultValue:
                    'This is a builtin assistant. You can change Main Agent, Default Model, and Default Permission. To customize other fields, ',
                })}
              </span>
              <Button
                type='text'
                size='mini'
                className='!px-0 !text-primary-6 hover:!text-primary-5'
                onClick={(event) => {
                  event.preventDefault();
                  handleDuplicate(activeAssistant);
                }}
                data-testid='link-duplicate-from-banner'
              >
                {t('settings.assistantBuiltinReadonlyDuplicateLink', { defaultValue: 'duplicate it' })}
              </Button>
              <span>{t('settings.assistantBuiltinReadonlyTipSuffix', { defaultValue: '.' })}</span>
            </div>
          </div>
        </div>
      ) : null}
      {isGenerated ? (
        <div
          className='rounded-12px border border-border-2 bg-fill-1 px-14px py-12px text-13px leading-20px text-t-secondary md:rounded-16px'
          data-testid='assistant-cli-readonly-banner'
        >
          <div className='flex items-start gap-8px'>
            <Info theme='outline' size={16} className='mt-2px flex-shrink-0 text-primary-6' />
            <div>
              {t('settings.assistantCliReadonlyTip', {
                defaultValue:
                  'This assistant is generated by Agents and is linked one-to-one with its CLI. Name, avatar, and main agent are locked; other settings are editable locally and will not be overwritten by updates.',
              })}
            </div>
          </div>
        </div>
      ) : null}

      <IdentitySection
        isIdentityLocked={isIdentityLocked}
        isDescriptionReadOnly={isDescriptionReadOnly}
        editAvatar={editAvatar}
        editName={editName}
        setEditName={setEditName}
        editDescription={editDescription}
        setEditDescription={setEditDescription}
        setEditAvatar={setEditAvatar}
        setEditAvatarPreview={setEditAvatarPreview}
        builtinAvatarOptions={profile.builtinAvatarOptions}
        onPickAvatarImage={() => void handlePickAvatarImage()}
        renderAvatarPreview={renderAvatarPreview}
        readOnlyLabel={readOnlyLabel}
      />

      <PromptsSection
        isReadOnly={isReadOnlyAssistant}
        recommendedPromptItems={recommendedPromptItems}
        addingPrompt={addingPrompt}
        setAddingPrompt={setAddingPrompt}
        newPromptDraft={newPromptDraft}
        setNewPromptDraft={setNewPromptDraft}
        editingPromptIndex={editingPromptIndex}
        setEditingPromptIndex={setEditingPromptIndex}
        editingPromptDraft={editingPromptDraft}
        setEditingPromptDraft={setEditingPromptDraft}
        onAddPrompt={handleAddPrompt}
        onBeginPromptEdit={handleBeginPromptEdit}
        onSavePromptEdit={handleSavePromptEdit}
        onDeletePrompt={handleDeletePrompt}
        readOnlyLabel={readOnlyLabel}
      />

      <div
        className='rounded-12px border border-border-2 bg-2 px-[12px] py-[16px] md:rounded-16px md:px-[24px] md:py-[20px]'
        data-testid='assistant-card-engine'
      >
        <div className='mb-12px flex items-center gap-8px'>
          <div className='text-14px font-500 text-t-primary'>
            {t('settings.assistantEngineSection', { defaultValue: 'Engine' })}
          </div>
          <span className='rounded-6px border border-success-8 bg-success-8 px-8px py-2px text-10px font-600 text-white'>
            {t('settings.assistantOnlyNewConversation', { defaultValue: 'New conversations only' })}
          </span>
        </div>
        <div className='flex items-center gap-12px'>
          <div className='w-86px flex-shrink-0 text-13px text-t-secondary'>
            {t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}
          </div>
          <div className='min-w-0 flex-1'>
            <Select
              className='w-full'
              getPopupContainer={getEditorSelectPopupContainer}
              value={editAgent}
              onChange={(value) => setEditAgent(value as string)}
              disabled={isGenerated}
              data-testid='select-assistant-agent'
            >
              {availableBackends.map((option) => (
                <Select.Option key={option.id} value={option.id}>
                  <span className='flex items-center gap-6px'>
                    {option.name}
                    {option.isExtension ? (
                      <Tag size='small' color='arcoblue'>
                        ext
                      </Tag>
                    ) : null}
                  </span>
                </Select.Option>
              ))}
            </Select>
            <div className='mt-6px text-11px text-t-tertiary'>
              {t('settings.assistantEngineAffectsDefaults', {
                defaultValue: 'Changing the main agent updates which model and permission values are available below.',
              })}
            </div>
          </div>
        </div>
      </div>

      <DefaultsSection
        key={`assistant-defaults-${localeKey}-${editAgent}`}
        localeKey={localeKey}
        isBuiltin={isBuiltin}
        isReadOnlyAssistant={isReadOnlyAssistant}
        isCreating={isCreating}
        showSkills={showSkills}
        defaultModelMode={defaultModelMode}
        setDefaultModelMode={setDefaultModelMode}
        defaultModelValue={defaultModelValue}
        setDefaultModelValue={setDefaultModelValue}
        defaultPermissionMode={defaultPermissionMode}
        setDefaultPermissionMode={setDefaultPermissionMode}
        defaultPermissionValue={defaultPermissionValue}
        setDefaultPermissionValue={setDefaultPermissionValue}
        defaultSkillsMode={defaultSkillsMode}
        setDefaultSkillsMode={setDefaultSkillsMode}
        defaultMcpMode={defaultMcpMode}
        setDefaultMcpMode={setDefaultMcpMode}
        modelOptions={modelOptions}
        permissionOptions={permissionOptions}
        editableSkillOptions={editableSkillOptions}
        selectedSkillValues={selectedSkillValues}
        enabledMcpServers={availableMcpServers}
        selectedMcpIds={selectedMcpIds}
        setSelectedMcpIds={setSelectedMcpIds}
        handleSkillSelectionChange={handleSkillSelectionChange}
        selectedItemsLabel={selectedItemsLabel}
        autoDefaultOptionLabel={autoDefaultOptionLabel}
        readonlySelectionSummary={readonlySelectionSummary}
      />

      <RulesSection
        isReadOnly={isReadOnlyAssistant}
        promptViewMode={promptViewMode}
        setPromptViewMode={setPromptViewMode}
        rulesExpanded={rulesExpanded}
        setRulesExpanded={setRulesExpanded}
        rulesContainerHeight={rulesContainerHeight}
        editContext={editContext}
        setEditContext={setEditContext}
        readOnlyLabel={readOnlyLabel}
      />
    </div>
  );
};

export default AssistantEditorSections;
