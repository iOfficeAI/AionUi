/**
 * AssistantManagement — Settings page for managing assistants.
 *
 * Editing permissions by assistant type:
 *
 * | Field          | Builtin | Extension | Custom |
 * |----------------|---------|-----------|--------|
 * | Save button    |  yes    |  no       |  yes   |
 * | Name           |  no     |  no       |  yes   |
 * | Description    |  no     |  no       |  yes   |
 * | Avatar         |  no     |  no       |  yes   |
 * | Main Agent     |  yes    |  no       |  yes   |
 * | Prompt editing |  no     |  no       |  yes   |
 * | Delete         |  no     |  no       |  yes   |
 *
 * Builtin assistants allow switching Main Agent and saving,
 * but their identity fields (name, description, avatar) and
 * prompt content are read-only.
 * Extension assistants are fully read-only.
 */
import { ipcBridge } from '@/common';
import coworkSvg from '@/renderer/assets/cowork.svg';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import MarkdownView from '@/renderer/components/Markdown';
import {
  useAssistantBackends,
  useAssistantEditor,
  useAssistantList,
  useAssistantSkills,
} from '@/renderer/hooks/assistant';
import {
  hasBuiltinSkills,
  isEmoji as isEmojiUtil,
  resolveAvatarImageSrc as resolveAvatarImageSrcUtil,
} from './AssistantManagement/assistantUtils';
import type { AssistantListItem, AssistantManagementProps } from './AssistantManagement/types';
import {
  Avatar,
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Input,
  Modal,
  Select,
  Switch,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { Close, Delete, FolderOpen, Plus, Refresh, Robot, Search, SettingOne } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const AssistantManagement: React.FC<AssistantManagementProps> = ({ message }) => {
  const { t } = useTranslation();
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const [drawerWidth, setDrawerWidth] = useState(500);

  const avatarImageMap: Record<string, string> = {
    'cowork.svg': coworkSvg,
    '\u{1F6E0}\u{FE0F}': coworkSvg,
  };

  // Compose hooks
  const {
    assistants,
    activeAssistantId,
    setActiveAssistantId,
    activeAssistant,
    isReadonlyAssistant,
    isExtensionAssistant,
    loadAssistants,
    localeKey,
  } = useAssistantList();

  const { availableBackends, extensionAcpAdapters, refreshAgentDetection } = useAssistantBackends();

  const editor = useAssistantEditor({
    localeKey,
    activeAssistant,
    isReadonlyAssistant,
    isExtensionAssistant,
    setActiveAssistantId,
    loadAssistants,
    refreshAgentDetection,
    message,
  });

  const skills = useAssistantSkills({
    skillsModalVisible: editor.skillsModalVisible,
    customSkills: editor.customSkills,
    selectedSkills: editor.selectedSkills,
    pendingSkills: editor.pendingSkills,
    availableSkills: editor.availableSkills,
    setPendingSkills: editor.setPendingSkills,
    setCustomSkills: editor.setCustomSkills,
    setSelectedSkills: editor.setSelectedSkills,
    message,
  });

  // Auto focus textarea when drawer opens
  useEffect(() => {
    if (editor.editVisible && editor.promptViewMode === 'edit') {
      // Small delay to ensure the drawer animation is complete
      const timer = setTimeout(() => {
        const textarea = textareaWrapperRef.current?.querySelector('textarea');
        textarea?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editor.editVisible, editor.promptViewMode]);

  useEffect(() => {
    const updateDrawerWidth = () => {
      if (typeof window === 'undefined') return;
      const nextWidth = Math.min(500, Math.max(320, Math.floor(window.innerWidth - 32)));
      setDrawerWidth(nextWidth);
    };

    updateDrawerWidth();
    window.addEventListener('resize', updateDrawerWidth);
    return () => window.removeEventListener('resize', updateDrawerWidth);
  }, []);

  const isEmoji = useCallback((str: string) => isEmojiUtil(str), []);

  const resolveAvatarImageSrc = useCallback(
    (avatar: string | undefined): string | undefined => resolveAvatarImageSrcUtil(avatar, avatarImageMap),
    [avatarImageMap]
  );

  const renderAvatarGroup = useCallback(
    (assistant: AssistantListItem, size = 32) => {
      const resolvedAvatar = assistant.avatar?.trim();
      const hasEmojiAvatar = Boolean(resolvedAvatar && isEmoji(resolvedAvatar));
      const avatarImage = resolveAvatarImageSrc(resolvedAvatar);
      const iconSize = Math.floor(size * 0.5);
      const emojiSize = Math.floor(size * 0.6);

      return (
        <Avatar.Group size={size}>
          <Avatar
            className='border-none'
            shape='square'
            style={{ backgroundColor: 'var(--color-fill-2)', border: 'none' }}
          >
            {avatarImage ? (
              <img src={avatarImage} alt='' width={emojiSize} height={emojiSize} style={{ objectFit: 'contain' }} />
            ) : hasEmojiAvatar ? (
              <span style={{ fontSize: emojiSize }}>{resolvedAvatar}</span>
            ) : (
              <Robot theme='outline' size={iconSize} />
            )}
          </Avatar>
        </Avatar.Group>
      );
    },
    [isEmoji, resolveAvatarImageSrc]
  );

  const editAvatarImage = resolveAvatarImageSrc(editor.editAvatar);

  return (
    <div>
      <Collapse.Item
        header={
          <div className='flex items-center justify-between w-full'>
            <span>{t('settings.assistants', { defaultValue: 'Assistants' })}</span>
          </div>
        }
        name='smart-assistants'
        extra={
          <Button
            type='text'
            size='small'
            style={{ color: 'var(--text-primary)' }}
            icon={<Plus size={14} fill='currentColor' />}
            onClick={(e) => {
              e.stopPropagation();
              void editor.handleCreate();
            }}
          >
            {t('settings.createAssistant', { defaultValue: 'Create' })}
          </Button>
        }
      >
        <div className='py-2'>
          <div className='bg-fill-2 rounded-2xl p-20px'>
            <div className='text-14px text-t-secondary mb-12px'>
              {t('settings.assistantsList', { defaultValue: 'Available assistants' })}
            </div>
            {assistants.length > 0 ? (
              <div className='space-y-12px'>
                {assistants.map((assistant) => {
                  const assistantIsExtension = isExtensionAssistant(assistant);
                  return (
                    <div
                      key={assistant.id}
                      className='group bg-fill-0 rounded-lg px-16px py-12px flex items-center justify-between cursor-pointer hover:bg-fill-1 transition-colors'
                      onClick={() => {
                        setActiveAssistantId(assistant.id);
                        void editor.handleEdit(assistant);
                      }}
                    >
                      <div className='flex items-center gap-12px min-w-0'>
                        {renderAvatarGroup(assistant, 28)}
                        <div className='min-w-0'>
                          <div className='font-medium text-t-primary truncate flex items-center gap-6px'>
                            <span className='truncate'>{assistant.nameI18n?.[localeKey] || assistant.name}</span>
                          </div>
                          <div className='text-12px text-t-secondary truncate'>
                            {assistant.descriptionI18n?.[localeKey] || assistant.description || ''}
                          </div>
                        </div>
                      </div>
                      <div className='flex items-center gap-12px text-t-secondary'>
                        <span
                          className='invisible group-hover:visible text-12px text-primary cursor-pointer hover:underline transition-all'
                          onClick={(e) => {
                            e.stopPropagation();
                            void editor.handleDuplicate(assistant);
                          }}
                        >
                          {t('settings.duplicateAssistant', { defaultValue: 'Duplicate' })}
                        </span>
                        <Switch
                          size='small'
                          checked={assistantIsExtension ? true : assistant.enabled !== false}
                          disabled={assistantIsExtension}
                          onChange={(checked) => {
                            void editor.handleToggleEnabled(assistant, checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          type='text'
                          size='small'
                          icon={<SettingOne size={16} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            void editor.handleEdit(assistant);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className='text-center text-t-secondary py-12px'>
                {t('settings.assistantsEmpty', { defaultValue: 'No assistants configured.' })}
              </div>
            )}
          </div>
        </div>
      </Collapse.Item>

      <Drawer
        title={
          <>
            <span>
              {editor.isCreating
                ? t('settings.createAssistant', { defaultValue: 'Create Assistant' })
                : t('settings.editAssistant', { defaultValue: 'Assistant Details' })}
            </span>
            <div
              onClick={(e) => {
                e.stopPropagation();
                editor.setEditVisible(false);
              }}
              className='absolute right-4 top-2 cursor-pointer text-t-secondary hover:text-t-primary transition-colors p-1'
              style={{ zIndex: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Close size={18} />
            </div>
          </>
        }
        closable={false}
        visible={editor.editVisible}
        placement='right'
        width={drawerWidth}
        zIndex={1200}
        autoFocus={false}
        onCancel={() => {
          editor.setEditVisible(false);
        }}
        headerStyle={{ background: 'var(--color-bg-1)' }}
        bodyStyle={{ background: 'var(--color-bg-1)' }}
        footer={
          <div className='flex items-center justify-between w-full'>
            <div className='flex items-center gap-8px'>
              <Button
                type='primary'
                onClick={editor.handleSave}
                disabled={!editor.isCreating && isReadonlyAssistant}
                className='w-[100px] rounded-[100px]'
              >
                {editor.isCreating
                  ? t('common.create', { defaultValue: 'Create' })
                  : t('common.save', { defaultValue: 'Save' })}
              </Button>
              <Button
                onClick={() => {
                  editor.setEditVisible(false);
                }}
                className='w-[100px] rounded-[100px] bg-fill-2'
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
            {!editor.isCreating && !activeAssistant?.isBuiltin && !isExtensionAssistant(activeAssistant) && (
              <Button
                status='danger'
                onClick={editor.handleDeleteClick}
                className='rounded-[100px]'
                style={{ backgroundColor: 'rgb(var(--danger-1))' }}
              >
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            )}
          </div>
        }
      >
        <div className='flex flex-col h-full overflow-hidden'>
          <div className='flex flex-col flex-1 gap-16px bg-fill-2 rounded-16px p-20px overflow-y-auto'>
            <div className='flex-shrink-0'>
              <Typography.Text bold>
                <span className='text-red-500'>*</span>{' '}
                {t('settings.assistantNameAvatar', { defaultValue: 'Name & Avatar' })}
              </Typography.Text>
              <div className='mt-10px flex items-center gap-12px'>
                {activeAssistant?.isBuiltin || isReadonlyAssistant ? (
                  <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px'>
                    {editAvatarImage ? (
                      <img src={editAvatarImage} alt='' width={24} height={24} style={{ objectFit: 'contain' }} />
                    ) : editor.editAvatar ? (
                      <span className='text-24px'>{editor.editAvatar}</span>
                    ) : (
                      <Robot theme='outline' size={20} />
                    )}
                  </Avatar>
                ) : (
                  <EmojiPicker value={editor.editAvatar} onChange={(emoji) => editor.setEditAvatar(emoji)} placement='br'>
                    <div className='cursor-pointer'>
                      <Avatar
                        shape='square'
                        size={40}
                        className='bg-bg-1 rounded-4px hover:bg-fill-2 transition-colors'
                      >
                        {editAvatarImage ? (
                          <img src={editAvatarImage} alt='' width={24} height={24} style={{ objectFit: 'contain' }} />
                        ) : editor.editAvatar ? (
                          <span className='text-24px'>{editor.editAvatar}</span>
                        ) : (
                          <Robot theme='outline' size={20} />
                        )}
                      </Avatar>
                    </div>
                  </EmojiPicker>
                )}
                <Input
                  value={editor.editName}
                  onChange={(value) => editor.setEditName(value)}
                  disabled={activeAssistant?.isBuiltin || isReadonlyAssistant}
                  placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })}
                  className='flex-1 rounded-4px bg-bg-1'
                />
              </div>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>
                {t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}
              </Typography.Text>
              <Input
                className='mt-10px rounded-4px bg-bg-1'
                value={editor.editDescription}
                onChange={(value) => editor.setEditDescription(value)}
                disabled={activeAssistant?.isBuiltin || isReadonlyAssistant}
                placeholder={t('settings.assistantDescriptionPlaceholder', {
                  defaultValue: 'What can this assistant help with?',
                })}
              />
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>{t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}</Typography.Text>
              <Select
                className='mt-10px w-full rounded-4px'
                value={editor.editAgent}
                onChange={(value) => editor.setEditAgent(value as string)}
                disabled={isReadonlyAssistant}
              >
                {[
                  { value: 'gemini', label: 'Gemini CLI' },
                  { value: 'claude', label: 'Claude Code' },
                  { value: 'qwen', label: 'Qwen Code' },
                  { value: 'codex', label: 'Codex' },
                  { value: 'codebuddy', label: 'CodeBuddy' },
                  { value: 'opencode', label: 'OpenCode' },
                ]
                  .filter((opt) => availableBackends.has(opt.value))
                  .map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Select.Option>
                  ))}
                {/* Extension-contributed ACP adapters */}
                {extensionAcpAdapters?.map((adapter) => {
                  const id = adapter.id as string;
                  const name = (adapter.name as string) || id;
                  return (
                    <Select.Option key={id} value={id}>
                      <span className='flex items-center gap-6px'>
                        {name}
                        <Tag size='small' color='arcoblue'>
                          ext
                        </Tag>
                      </span>
                    </Select.Option>
                  );
                })}
              </Select>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold className='flex-shrink-0'>
                {t('settings.assistantRules', { defaultValue: 'Rules' })}
              </Typography.Text>
              {/* Prompt Edit/Preview Tabs */}
              <div className='mt-10px border border-border-2 overflow-hidden rounded-4px' style={{ height: '300px' }}>
                {!activeAssistant?.isBuiltin && !isReadonlyAssistant && (
                  <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                    <div
                      className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${editor.promptViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                      onClick={() => editor.setPromptViewMode('edit')}
                    >
                      {t('settings.promptEdit', { defaultValue: 'Edit' })}
                    </div>
                    <div
                      className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${editor.promptViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                      onClick={() => editor.setPromptViewMode('preview')}
                    >
                      {t('settings.promptPreview', { defaultValue: 'Preview' })}
                    </div>
                  </div>
                )}
                <div
                  className='bg-fill-2'
                  style={{
                    height: activeAssistant?.isBuiltin || isReadonlyAssistant ? '100%' : 'calc(100% - 36px)',
                    overflow: 'auto',
                  }}
                >
                  {editor.promptViewMode === 'edit' && !activeAssistant?.isBuiltin && !isReadonlyAssistant ? (
                    <div ref={textareaWrapperRef} className='h-full'>
                      <Input.TextArea
                        value={editor.editContext}
                        onChange={(value) => editor.setEditContext(value)}
                        placeholder={t('settings.assistantRulesPlaceholder', {
                          defaultValue: 'Enter rules in Markdown format...',
                        })}
                        autoSize={false}
                        className='border-none rounded-none bg-transparent h-full resize-none'
                      />
                    </div>
                  ) : (
                    <div className='p-16px'>
                      {editor.editContext ? (
                        <MarkdownView hiddenCodeCopyButton>{editor.editContext}</MarkdownView>
                      ) : (
                        <div className='text-t-secondary text-center py-32px'>
                          {t('settings.promptPreviewEmpty', { defaultValue: 'No content to preview' })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Show skills selection when creating or editing builtin assistants with skillFiles/custom assistants */}
            {(editor.isCreating ||
              (activeAssistantId && hasBuiltinSkills(activeAssistantId)) ||
              (activeAssistant && !activeAssistant.isBuiltin && !isExtensionAssistant(activeAssistant))) && (
              <div className='flex-shrink-0 mt-16px'>
                <div className='flex items-center justify-between mb-12px'>
                  <Typography.Text bold>{t('settings.assistantSkills', { defaultValue: 'Skills' })}</Typography.Text>
                  <Button
                    size='small'
                    type='outline'
                    icon={<Plus size={14} />}
                    onClick={() => editor.setSkillsModalVisible(true)}
                    className='rounded-[100px]'
                  >
                    {t('settings.addSkills', { defaultValue: 'Add Skills' })}
                  </Button>
                </div>

                {/* Skills Collapse */}
                <Collapse defaultActiveKey={['custom-skills']}>
                  {/* Custom Skills (Pending + Imported) */}
                  <Collapse.Item
                    header={
                      <span className='text-13px font-medium'>
                        {t('settings.customSkills', { defaultValue: 'Imported Skills (Library)' })}
                      </span>
                    }
                    name='custom-skills'
                    className='mb-8px'
                    extra={
                      <span className='text-12px text-t-secondary'>
                        {editor.pendingSkills.length + editor.availableSkills.filter((skill) => skill.isCustom).length}
                      </span>
                    }
                  >
                    <div className='space-y-4px'>
                      {/* Pending skills (not yet imported) */}
                      {editor.pendingSkills.map((skill) => (
                        <div
                          key={`pending-${skill.name}`}
                          className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                        >
                          <Checkbox
                            checked={editor.selectedSkills.includes(skill.name)}
                            className='mt-2px cursor-pointer'
                            onChange={() => {
                              if (editor.selectedSkills.includes(skill.name)) {
                                editor.setSelectedSkills(editor.selectedSkills.filter((s) => s !== skill.name));
                              } else {
                                editor.setSelectedSkills([...editor.selectedSkills, skill.name]);
                              }
                            }}
                          />
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-6px'>
                              <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                              <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 border border-[rgba(var(--primary-6),0.2)] text-10px px-4px py-1px rd-4px font-medium uppercase'>
                                Pending
                              </span>
                            </div>
                            {skill.description && (
                              <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
                            )}
                          </div>
                          <button
                            className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                            onClick={(e) => {
                              e.stopPropagation();
                              editor.setDeletePendingSkillName(skill.name);
                            }}
                            title='Remove'
                          >
                            <Delete size={16} fill='var(--color-text-3)' />
                          </button>
                        </div>
                      ))}
                      {/* All imported custom skills */}
                      {editor.availableSkills
                        .filter((skill) => skill.isCustom)
                        .map((skill) => (
                          <div
                            key={`custom-${skill.name}`}
                            className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                          >
                            <Checkbox
                              checked={editor.selectedSkills.includes(skill.name)}
                              className='mt-2px cursor-pointer'
                              onChange={() => {
                                if (editor.selectedSkills.includes(skill.name)) {
                                  editor.setSelectedSkills(editor.selectedSkills.filter((s) => s !== skill.name));
                                } else {
                                  editor.setSelectedSkills([...editor.selectedSkills, skill.name]);
                                }
                              }}
                            />
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center gap-6px'>
                                <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                                <span className='bg-[rgba(242,156,27,0.08)] text-[rgb(242,156,27)] border border-[rgba(242,156,27,0.2)] text-10px px-4px py-1px rd-4px font-medium uppercase'>
                                  {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
                                </span>
                              </div>
                              {skill.description && (
                                <div className='text-12px text-t-secondary mt-2px line-clamp-2'>
                                  {skill.description}
                                </div>
                              )}
                            </div>
                            <button
                              className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                              onClick={(e) => {
                                e.stopPropagation();
                                editor.setDeleteCustomSkillName(skill.name);
                              }}
                              title={t('settings.removeFromAssistant', { defaultValue: 'Remove from assistant' })}
                            >
                              <Delete size={16} fill='var(--color-text-3)' />
                            </button>
                          </div>
                        ))}
                      {editor.pendingSkills.length === 0 && editor.availableSkills.filter((skill) => skill.isCustom).length === 0 && (
                        <div className='text-center text-t-secondary text-12px py-16px'>
                          {t('settings.noCustomSkills', { defaultValue: 'No custom skills added' })}
                        </div>
                      )}
                    </div>
                  </Collapse.Item>

                  {/* Builtin Skills */}
                  <Collapse.Item
                    header={
                      <span className='text-13px font-medium'>
                        {t('settings.builtinSkills', { defaultValue: 'Builtin Skills' })}
                      </span>
                    }
                    name='builtin-skills'
                    extra={
                      <span className='text-12px text-t-secondary'>
                        {editor.availableSkills.filter((skill) => !skill.isCustom).length}
                      </span>
                    }
                  >
                    {editor.availableSkills.filter((skill) => !skill.isCustom).length > 0 ? (
                      <div className='space-y-4px'>
                        {editor.availableSkills
                          .filter((skill) => !skill.isCustom)
                          .map((skill) => (
                            <div
                              key={skill.name}
                              className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px'
                            >
                              <Checkbox
                                checked={editor.selectedSkills.includes(skill.name)}
                                className='mt-2px cursor-pointer'
                                onChange={() => {
                                  if (editor.selectedSkills.includes(skill.name)) {
                                    editor.setSelectedSkills(editor.selectedSkills.filter((s) => s !== skill.name));
                                  } else {
                                    editor.setSelectedSkills([...editor.selectedSkills, skill.name]);
                                  }
                                }}
                              />
                              <div className='flex-1 min-w-0'>
                                <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                                {skill.description && (
                                  <div className='text-12px text-t-secondary mt-2px line-clamp-2'>
                                    {skill.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className='text-center text-t-secondary text-12px py-16px'>
                        {t('settings.noBuiltinSkills', { defaultValue: 'No builtin skills available' })}
                      </div>
                    )}
                  </Collapse.Item>
                </Collapse>
              </div>
            )}
          </div>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal
        title={t('settings.deleteAssistantTitle', { defaultValue: 'Delete Assistant' })}
        visible={editor.deleteConfirmVisible}
        onCancel={() => editor.setDeleteConfirmVisible(false)}
        onOk={editor.handleDeleteConfirm}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.delete', { defaultValue: 'Delete' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>
          {t('settings.deleteAssistantConfirm', {
            defaultValue: 'Are you sure you want to delete this assistant? This action cannot be undone.',
          })}
        </p>
        {activeAssistant && (
          <div className='mt-12px p-12px bg-fill-2 rounded-lg flex items-center gap-12px'>
            {renderAvatarGroup(activeAssistant, 32)}
            <div>
              <div className='font-medium'>{activeAssistant.name}</div>
              <div className='text-12px text-t-secondary'>{activeAssistant.description}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Skills Modal - Aligned with Skills Hub */}
      <Modal
        visible={editor.skillsModalVisible}
        onCancel={() => {
          editor.setSkillsModalVisible(false);
          skills.setSearchExternalQuery('');
        }}
        footer={null}
        title={t('settings.addSkillsTitle', { defaultValue: 'Add Skills' })}
        className='w-[90vw] md:w-[600px]'
        wrapStyle={{ zIndex: 2500 }}
        maskStyle={{ zIndex: 2490 }}
        autoFocus={false}
      >
        <div className='flex flex-col h-[500px]'>
          <div className='flex items-center justify-between mb-16px shrink-0 gap-16px'>
            <div className='flex-1 overflow-x-auto custom-scrollbar pb-4px'>
              <div className='flex items-center gap-8px min-w-max'>
                {skills.externalSources.map((source) => {
                  const isActive = skills.activeSourceTab === source.source;
                  return (
                    <button
                      key={source.source}
                      type='button'
                      className={`outline-none cursor-pointer px-12px py-6px text-12px rd-[100px] transition-all duration-300 flex items-center gap-6px border ${isActive ? 'bg-primary-6 border-primary-6 text-white shadow-sm font-medium' : 'bg-fill-2 border-transparent text-t-secondary hover:bg-fill-3 hover:text-t-primary'}`}
                      onClick={() => skills.setActiveSourceTab(source.source)}
                    >
                      {source.name}
                      <span
                        className={`px-6px py-1px rd-[100px] text-10px flex items-center justify-center transition-colors ${isActive ? 'bg-white/20 text-white' : 'bg-fill-3 text-t-tertiary border border-border-1'}`}
                      >
                        {source.skills.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className='flex items-center gap-4px shrink-0 ml-4px'>
              <button
                type='button'
                className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2'
                onClick={() => void skills.handleRefreshExternal()}
                title={t('common.refresh', { defaultValue: 'Refresh' })}
              >
                <Refresh theme='outline' size={16} className={skills.refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                type='button'
                className='outline-none border border-dashed border-border-1 hover:border-primary-4 cursor-pointer w-28px h-28px text-t-tertiary hover:text-primary-6 hover:bg-primary-1 rd-full transition-all duration-300 flex items-center justify-center bg-transparent shrink-0'
                onClick={() => skills.setShowAddPathModal(true)}
                title={t('common.add', { defaultValue: 'Add Custom Path' })}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <Input
            prefix={<Search />}
            placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
            value={skills.searchExternalQuery}
            onChange={(val) => skills.setSearchExternalQuery(val)}
            className='mb-12px shrink-0 rounded-[8px] bg-fill-2'
          />

          <div className='flex-1 overflow-y-auto custom-scrollbar bg-fill-1 rounded-8px p-12px'>
            {skills.externalSkillsLoading ? (
              <div className='h-full flex items-center justify-center text-t-tertiary'>
                {t('common.loading', { defaultValue: 'Loading...' })}
              </div>
            ) : skills.activeSource ? (
              skills.filteredExternalSkills.length > 0 ? (
                <div className='flex flex-col gap-8px'>
                  {skills.filteredExternalSkills.map((skill) => {
                    const isAdded = editor.customSkills.includes(skill.name);
                    return (
                      <div
                        key={skill.path}
                        className='flex items-start gap-12px p-12px bg-base border border-transparent hover:border-border-2 rounded-8px transition-colors shadow-sm'
                      >
                        <div className='w-32px h-32px rounded-8px bg-fill-2 border border-border-1 flex items-center justify-center font-bold text-14px text-t-secondary uppercase shrink-0 mt-2px'>
                          {skill.name.charAt(0)}
                        </div>
                        <div className='flex-1 min-w-0'>
                          <div className='text-14px font-medium text-t-primary truncate'>{skill.name}</div>
                          {skill.description && (
                            <div className='text-12px text-t-secondary line-clamp-2 mt-4px' title={skill.description}>
                              {skill.description}
                            </div>
                          )}
                        </div>
                        <div className='shrink-0 flex items-center h-full self-center'>
                          {isAdded ? (
                            <Button
                              size='small'
                              disabled
                              className='rounded-[100px] bg-fill-2 text-t-tertiary border-none'
                            >
                              {t('common.added', { defaultValue: 'Added' })}
                            </Button>
                          ) : (
                            <Button
                              size='small'
                              type='primary'
                              className='rounded-[100px]'
                              onClick={() => {
                                skills.handleAddFoundSkills([skill]);
                              }}
                            >
                              <Plus size={14} className='mr-4px' />
                              {t('common.add', { defaultValue: 'Add' })}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className='h-full flex items-center justify-center text-t-tertiary'>
                  {t('settings.skillsHub.noSearchResults', { defaultValue: 'No skills found' })}
                </div>
              )
            ) : (
              <div className='h-full flex items-center justify-center text-t-tertiary'>
                {t('settings.noExternalSources', { defaultValue: 'No external skill sources discovered' })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Pending Skill Confirmation Modal */}
      <Modal
        visible={editor.deletePendingSkillName !== null}
        onCancel={() => editor.setDeletePendingSkillName(null)}
        title={t('settings.deletePendingSkillTitle', { defaultValue: 'Delete Pending Skill' })}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.delete', { defaultValue: 'Delete' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        onOk={() => {
          if (editor.deletePendingSkillName) {
            // Remove from pendingSkills and customSkills
            editor.setPendingSkills(editor.pendingSkills.filter((s) => s.name !== editor.deletePendingSkillName));
            editor.setCustomSkills(editor.customSkills.filter((s) => s !== editor.deletePendingSkillName));
            // Also remove from selectedSkills if selected
            editor.setSelectedSkills(editor.selectedSkills.filter((s) => s !== editor.deletePendingSkillName));
            editor.setDeletePendingSkillName(null);
            message.success(t('settings.skillDeleted', { defaultValue: 'Skill removed from pending list' }));
          }
        }}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>
          {t('settings.deletePendingSkillConfirm', {
            defaultValue: `Are you sure you want to remove "${editor.deletePendingSkillName}"? This skill has not been imported yet.`,
          })}
        </p>
        <div className='mt-12px text-12px text-t-secondary bg-fill-2 p-12px rounded-lg'>
          {t('settings.deletePendingSkillNote', {
            defaultValue:
              'This will only remove the skill from the pending list. If you want to add it again later, you can use "Add Skills".',
          })}
        </div>
      </Modal>

      {/* Remove Custom Skill from Assistant Modal */}
      <Modal
        visible={editor.deleteCustomSkillName !== null}
        onCancel={() => editor.setDeleteCustomSkillName(null)}
        title={t('settings.removeCustomSkillTitle', { defaultValue: 'Remove Skill from Assistant' })}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.remove', { defaultValue: 'Remove' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        onOk={() => {
          if (editor.deleteCustomSkillName) {
            // Remove from customSkills
            editor.setCustomSkills(editor.customSkills.filter((s) => s !== editor.deleteCustomSkillName));
            // Also remove from selectedSkills if selected
            editor.setSelectedSkills(editor.selectedSkills.filter((s) => s !== editor.deleteCustomSkillName));
            editor.setDeleteCustomSkillName(null);
            message.success(
              t('settings.skillRemovedFromAssistant', { defaultValue: 'Skill removed from this assistant' })
            );
          }
        }}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>
          {t('settings.removeCustomSkillConfirm', {
            defaultValue: `Are you sure you want to remove "${editor.deleteCustomSkillName}" from this assistant?`,
          })}
        </p>
        <div className='mt-12px text-12px text-t-secondary bg-fill-2 p-12px rounded-lg'>
          {t('settings.removeCustomSkillNote', {
            defaultValue:
              'This will only remove the skill from this assistant. The skill will remain in Builtin Skills and can be re-added later.',
          })}
        </div>
      </Modal>

      {/* Add Custom External Path Modal */}
      <Modal
        title={t('settings.skillsHub.addCustomPath', { defaultValue: '添加自定义技能路径' })}
        visible={skills.showAddPathModal}
        onCancel={() => {
          skills.setShowAddPathModal(false);
          skills.setCustomPathName('');
          skills.setCustomPathValue('');
        }}
        onOk={() => void skills.handleAddCustomPath()}
        okText={t('common.confirm', { defaultValue: '确认' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
        okButtonProps={{ disabled: !skills.customPathName.trim() || !skills.customPathValue.trim() }}
        autoFocus={false}
        focusLock
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <div className='flex flex-col gap-16px'>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('common.name', { defaultValue: '名称' })}
            </div>
            <Input
              placeholder={t('settings.skillsHub.customPathNamePlaceholder', { defaultValue: '例：我的自定义技能' })}
              value={skills.customPathName}
              onChange={(v) => skills.setCustomPathName(v)}
              className='rd-6px'
            />
          </div>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('settings.skillsHub.customPathLabel', { defaultValue: '技能目录路径' })}
            </div>
            <div className='flex gap-8px'>
              <Input
                placeholder={t('settings.skillsHub.customPathPlaceholder', {
                  defaultValue: '例：C:\\Users\\me\\.mytools\\skills',
                })}
                value={skills.customPathValue}
                onChange={(v) => skills.setCustomPathValue(v)}
                className='flex-1 rd-6px'
              />
              <Button
                className='rd-6px'
                onClick={async () => {
                  try {
                    const result = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
                    if (result && result.length > 0) {
                      skills.setCustomPathValue(result[0]);
                    }
                  } catch (e) {
                    console.error('Failed to select directory', e);
                  }
                }}
              >
                <FolderOpen size={16} />
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AssistantManagement;
