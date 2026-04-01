/**
 * AssistantEditDrawer — Drawer for creating/editing an assistant.
 * Contains name/avatar fields, agent selector, rules editor, and skills section.
 */
import type { AssistantListItem, SkillInfo } from './types';
import { hasBuiltinSkills } from './assistantUtils';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import MarkdownView from '@/renderer/components/Markdown';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { Avatar, Button, Checkbox, Collapse, Drawer, Input, Select, Tag, Typography } from '@arco-design/web-react';
import { Close, Delete, Plus, Robot } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AssistantEditDrawerProps = {
  // Drawer visibility
  editVisible: boolean;
  setEditVisible: (v: boolean) => void;
  isCreating: boolean;

  // Identity fields
  editName: string;
  setEditName: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editAvatar: string;
  setEditAvatar: (v: string) => void;
  editAvatarImage: string | undefined;
  editAgent: string;
  setEditAgent: (v: string) => void;

  // Rules / prompt
  editContext: string;
  setEditContext: (v: string) => void;
  promptViewMode: 'edit' | 'preview';
  setPromptViewMode: (v: 'edit' | 'preview') => void;

  // Skills state
  availableSkills: SkillInfo[];
  selectedSkills: string[];
  setSelectedSkills: (v: string[]) => void;
  pendingSkills: Array<{ name: string; description: string }>;
  customSkills: string[];
  setDeletePendingSkillName: (v: string | null) => void;
  setDeleteCustomSkillName: (v: string | null) => void;
  setSkillsModalVisible: (v: boolean) => void;

  // Active assistant info
  activeAssistant: AssistantListItem | null;
  activeAssistantId: string | null;
  isReadonlyAssistant: boolean;
  isExtensionAssistant: (assistant: AssistantListItem | null | undefined) => boolean;

  // Agent backend options
  availableBackends: Set<string>;
  extensionAcpAdapters: Record<string, unknown>[] | undefined;

  // Handlers
  handleSave: () => void;
  handleDeleteClick: () => void;
};

const AssistantEditDrawer: React.FC<AssistantEditDrawerProps> = ({
  editVisible,
  setEditVisible,
  isCreating,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  editAvatar,
  setEditAvatar,
  editAvatarImage,
  editAgent,
  setEditAgent,
  editContext,
  setEditContext,
  promptViewMode,
  setPromptViewMode,
  availableSkills,
  selectedSkills,
  setSelectedSkills,
  pendingSkills,
  customSkills: _customSkills,
  setDeletePendingSkillName,
  setDeleteCustomSkillName,
  setSkillsModalVisible,
  activeAssistant,
  activeAssistantId,
  isReadonlyAssistant,
  isExtensionAssistant,
  availableBackends,
  extensionAcpAdapters,
  handleSave,
  handleDeleteClick,
}) => {
  const { t } = useTranslation();
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const [drawerWidth, setDrawerWidth] = useState(500);
  const [rulesExpanded, setRulesExpanded] = useState(false);

  // Auto focus textarea when drawer opens in edit mode
  useEffect(() => {
    if (editVisible && promptViewMode === 'edit') {
      const timer = setTimeout(() => {
        const textarea = textareaWrapperRef.current?.querySelector('textarea');
        textarea?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editVisible, promptViewMode]);

  // Responsive drawer width
  useEffect(() => {
    const updateDrawerWidth = () => {
      if (typeof window === 'undefined') return;
      const nextWidth = Math.min(1024, Math.max(480, Math.floor(window.innerWidth * 0.5)));
      setDrawerWidth(nextWidth);
    };

    updateDrawerWidth();
    window.addEventListener('resize', updateDrawerWidth);
    return () => window.removeEventListener('resize', updateDrawerWidth);
  }, []);

  // Whether skills section should be visible
  const showSkills =
    isCreating ||
    (activeAssistantId !== null && hasBuiltinSkills(activeAssistantId)) ||
    (activeAssistant !== null && !activeAssistant.isBuiltin && !isExtensionAssistant(activeAssistant));

  const customSkillItems = availableSkills.filter((skill) => skill.isCustom);
  const builtinSkillItems = availableSkills.filter((skill) => !skill.isCustom);
  const customActiveCount = selectedSkills.filter(
    (name) =>
      pendingSkills.some((skill) => skill.name === name) || customSkillItems.some((skill) => skill.name === name)
  ).length;
  const builtinActiveCount = selectedSkills.filter((name) =>
    builtinSkillItems.some((skill) => skill.name === name)
  ).length;
  const customStatusDotColor = customActiveCount > 0 ? 'rgb(var(--success-6))' : 'var(--color-text-4)';
  const builtinStatusDotColor = builtinActiveCount > 0 ? 'rgb(var(--success-6))' : 'var(--color-text-4)';
  const totalSkillsCount = pendingSkills.length + customSkillItems.length + builtinSkillItems.length;
  const totalActiveSkillsCount = selectedSkills.filter(
    (name) => pendingSkills.some((skill) => skill.name === name) || availableSkills.some((skill) => skill.name === name)
  ).length;
  const isRuleEditable = !activeAssistant?.isBuiltin && !isReadonlyAssistant;
  const rulesContainerHeight = rulesExpanded
    ? '420px'
    : isRuleEditable && promptViewMode === 'edit'
      ? '260px'
      : '220px';

  return (
    <Drawer
      title={
        <>
          <span>
            {isCreating
              ? t('settings.createAssistant', { defaultValue: 'Create Assistant' })
              : t('settings.editAssistant', { defaultValue: 'Assistant Details' })}
          </span>
          <div
            onClick={(e) => {
              e.stopPropagation();
              setEditVisible(false);
            }}
            className='absolute right-4 top-2 cursor-pointer text-t-secondary hover:text-t-primary transition-colors p-1'
            style={{ zIndex: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Close size={18} />
          </div>
        </>
      }
      closable={false}
      visible={editVisible}
      placement='right'
      width={drawerWidth}
      zIndex={1200}
      getPopupContainer={() => document.body}
      autoFocus={false}
      onCancel={() => {
        setEditVisible(false);
      }}
      headerStyle={{ background: 'var(--color-bg-1)' }}
      bodyStyle={{ background: 'var(--color-bg-1)' }}
      footer={
        <div className='flex items-center justify-between w-full'>
          <div className='flex items-center gap-8px'>
            <Button
              type='primary'
              onClick={handleSave}
              disabled={!isCreating && isReadonlyAssistant}
              className='w-[100px] rounded-[100px]'
            >
              {isCreating ? t('common.create', { defaultValue: 'Create' }) : t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button
              onClick={() => {
                setEditVisible(false);
              }}
              className='w-[100px] rounded-[100px] bg-fill-2'
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
          {!isCreating && !activeAssistant?.isBuiltin && !isExtensionAssistant(activeAssistant) && (
            <Button
              status='danger'
              onClick={handleDeleteClick}
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
          {/* Name & Avatar */}
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
                  ) : editAvatar ? (
                    <span className='text-24px'>{editAvatar}</span>
                  ) : (
                    <Robot theme='outline' size={20} />
                  )}
                </Avatar>
              ) : (
                <EmojiPicker value={editAvatar} onChange={(emoji) => setEditAvatar(emoji)} placement='br'>
                  <div className='cursor-pointer'>
                    <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px hover:bg-fill-2 transition-colors'>
                      {editAvatarImage ? (
                        <img src={editAvatarImage} alt='' width={24} height={24} style={{ objectFit: 'contain' }} />
                      ) : editAvatar ? (
                        <span className='text-24px'>{editAvatar}</span>
                      ) : (
                        <Robot theme='outline' size={20} />
                      )}
                    </Avatar>
                  </div>
                </EmojiPicker>
              )}
              <Input
                value={editName}
                onChange={(value) => setEditName(value)}
                disabled={activeAssistant?.isBuiltin || isReadonlyAssistant}
                placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })}
                className='flex-1 rounded-4px bg-bg-1'
              />
            </div>
          </div>

          {/* Description */}
          <div className='flex-shrink-0'>
            <Typography.Text bold>
              {t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}
            </Typography.Text>
            <Input
              className='mt-10px rounded-4px bg-bg-1'
              value={editDescription}
              onChange={(value) => setEditDescription(value)}
              disabled={activeAssistant?.isBuiltin || isReadonlyAssistant}
              placeholder={t('settings.assistantDescriptionPlaceholder', {
                defaultValue: 'What can this assistant help with?',
              })}
            />
          </div>

          {/* Main Agent selector */}
          <div className='flex-shrink-0'>
            <Typography.Text bold>{t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}</Typography.Text>
            <Select
              className='mt-10px w-full rounded-4px'
              value={editAgent}
              onChange={(value) => setEditAgent(value as string)}
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
                .map((opt) => {
                  const logo = getAgentLogo(opt.value);
                  return (
                    <Select.Option key={opt.value} value={opt.value}>
                      <span className='flex items-center gap-6px'>
                        {logo ? (
                          <img
                            src={logo}
                            alt=''
                            width={16}
                            height={16}
                            style={{ objectFit: 'contain', flexShrink: 0 }}
                          />
                        ) : (
                          <Robot theme='outline' size={16} fill='currentColor' style={{ flexShrink: 0 }} />
                        )}
                        {opt.label}
                      </span>
                    </Select.Option>
                  );
                })}
              {/* Extension-contributed ACP adapters */}
              {extensionAcpAdapters?.map((adapter) => {
                const id = adapter.id as string;
                const name = (adapter.name as string) || id;
                const logo = getAgentLogo(id);
                return (
                  <Select.Option key={id} value={id}>
                    <span className='flex items-center gap-6px'>
                      {logo ? (
                        <img src={logo} alt='' width={16} height={16} style={{ objectFit: 'contain', flexShrink: 0 }} />
                      ) : (
                        <Robot theme='outline' size={16} fill='currentColor' style={{ flexShrink: 0 }} />
                      )}
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

          {/* Summary */}
          <div className='flex flex-wrap items-center gap-8px p-10px rd-10px bg-fill-1'>
            <span className='text-12px text-t-secondary'>
              {t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}:
            </span>
            <Tag size='small' color='arcoblue'>
              {editAgent}
            </Tag>
            <span className='text-12px text-t-secondary ml-6px'>
              {t('settings.assistantSkills', { defaultValue: 'Skills' })}:
            </span>
            <Tag size='small' color={totalActiveSkillsCount > 0 ? 'green' : 'gray'}>
              {totalActiveSkillsCount > 0 ? `${totalActiveSkillsCount}/${totalSkillsCount}` : totalSkillsCount}
            </Tag>
          </div>

          {/* Rules / Prompt */}
          <div className='flex-shrink-0'>
            <div className='flex items-center justify-between'>
              <Typography.Text bold className='flex-shrink-0'>
                {t('settings.assistantRules', { defaultValue: 'Rules' })}
              </Typography.Text>
              <Button type='text' size='mini' onClick={() => setRulesExpanded((prev) => !prev)}>
                {rulesExpanded
                  ? t('common.collapse', { defaultValue: 'Collapse' })
                  : t('common.expand', { defaultValue: 'Expand' })}
              </Button>
            </div>
            <div
              className='mt-10px border border-border-2 overflow-hidden rounded-4px'
              style={{ height: rulesContainerHeight }}
            >
              {isRuleEditable && (
                <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                  <div
                    className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                    onClick={() => setPromptViewMode('edit')}
                  >
                    {t('settings.promptEdit', { defaultValue: 'Edit' })}
                  </div>
                  <div
                    className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                    onClick={() => setPromptViewMode('preview')}
                  >
                    {t('settings.promptPreview', { defaultValue: 'Preview' })}
                  </div>
                </div>
              )}
              <div
                className='bg-fill-2'
                style={{
                  height: isRuleEditable ? 'calc(100% - 36px)' : '100%',
                  overflow: 'auto',
                }}
              >
                {promptViewMode === 'edit' && isRuleEditable ? (
                  <div ref={textareaWrapperRef} className='h-full'>
                    <Input.TextArea
                      value={editContext}
                      onChange={(value) => setEditContext(value)}
                      placeholder={t('settings.assistantRulesPlaceholder', {
                        defaultValue: 'Enter rules in Markdown format...',
                      })}
                      autoSize={false}
                      className='border-none rounded-none bg-transparent h-full resize-none'
                    />
                  </div>
                ) : (
                  <div className='p-16px text-14px leading-7'>
                    {editContext ? (
                      <MarkdownView hiddenCodeCopyButton>{editContext}</MarkdownView>
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

          {/* Skills section */}
          {showSkills && (
            <div className='flex-shrink-0 mt-16px'>
              <div className='flex items-center justify-between mb-12px'>
                <Typography.Text bold>{t('settings.assistantSkills', { defaultValue: 'Skills' })}</Typography.Text>
                <Button
                  size='small'
                  type='outline'
                  icon={<Plus size={14} />}
                  onClick={() => setSkillsModalVisible(true)}
                  className='rounded-[100px]'
                >
                  {t('settings.addSkills', { defaultValue: 'Add Skills' })}
                </Button>
              </div>

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
                    <div className='flex items-center gap-8px'>
                      <span
                        className='inline-block w-8px h-8px rd-50%'
                        style={{ background: customStatusDotColor }}
                        aria-hidden='true'
                      />
                      <span className='text-12px text-t-secondary'>
                        {customActiveCount > 0
                          ? `${customActiveCount}/${pendingSkills.length + customSkillItems.length}`
                          : pendingSkills.length + customSkillItems.length}
                      </span>
                    </div>
                  }
                >
                  <div className='space-y-4px'>
                    {/* Pending skills (not yet imported) */}
                    {pendingSkills.map((skill) => (
                      <div
                        key={`pending-${skill.name}`}
                        className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                      >
                        <Checkbox
                          checked={selectedSkills.includes(skill.name)}
                          className='mt-2px cursor-pointer'
                          onChange={() => {
                            if (selectedSkills.includes(skill.name)) {
                              setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                            } else {
                              setSelectedSkills([...selectedSkills, skill.name]);
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
                            setDeletePendingSkillName(skill.name);
                          }}
                          title='Remove'
                        >
                          <Delete size={16} fill='var(--color-text-3)' />
                        </button>
                      </div>
                    ))}
                    {/* All imported custom skills */}
                    {customSkillItems.map((skill) => (
                      <div
                        key={`custom-${skill.name}`}
                        className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                      >
                        <Checkbox
                          checked={selectedSkills.includes(skill.name)}
                          className='mt-2px cursor-pointer'
                          onChange={() => {
                            if (selectedSkills.includes(skill.name)) {
                              setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                            } else {
                              setSelectedSkills([...selectedSkills, skill.name]);
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
                            <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
                          )}
                        </div>
                        <button
                          className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteCustomSkillName(skill.name);
                          }}
                          title={t('settings.removeFromAssistant', { defaultValue: 'Remove from assistant' })}
                        >
                          <Delete size={16} fill='var(--color-text-3)' />
                        </button>
                      </div>
                    ))}
                    {pendingSkills.length === 0 && customSkillItems.length === 0 && (
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
                    <div className='flex items-center gap-8px'>
                      <span
                        className='inline-block w-8px h-8px rd-50%'
                        style={{ background: builtinStatusDotColor }}
                        aria-hidden='true'
                      />
                      <span className='text-12px text-t-secondary'>
                        {builtinActiveCount > 0
                          ? `${builtinActiveCount}/${builtinSkillItems.length}`
                          : builtinSkillItems.length}
                      </span>
                    </div>
                  }
                >
                  {builtinSkillItems.length > 0 ? (
                    <div className='space-y-4px'>
                      {builtinSkillItems.map((skill) => (
                        <div key={skill.name} className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px'>
                          <Checkbox
                            checked={selectedSkills.includes(skill.name)}
                            className='mt-2px cursor-pointer'
                            onChange={() => {
                              if (selectedSkills.includes(skill.name)) {
                                setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.name]);
                              }
                            }}
                          />
                          <div className='flex-1 min-w-0'>
                            <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                            {skill.description && (
                              <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
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
  );
};

export default AssistantEditDrawer;
