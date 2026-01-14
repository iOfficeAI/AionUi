import type { Message } from '@arco-design/web-react';
import { Avatar, Button, Collapse, Input, Drawer, Modal, Typography, Select, Switch } from '@arco-design/web-react';
import { Close, Robot, SettingOne } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { resolveLocaleKey } from '@/common/utils';
import type { AcpBackendConfig, PresetAgentType } from '@/types/acpTypes';
// EmojiPicker removed - avatar editing is disabled
import MarkdownView from '@/renderer/components/Markdown';
import coworkSvg from '@/renderer/assets/cowork.svg';

interface AssistantManagementProps {
  message: ReturnType<typeof Message.useMessage>[0];
}

const AssistantManagement: React.FC<AssistantManagementProps> = ({ message }) => {
  const { t, i18n } = useTranslation();
  const [assistants, setAssistants] = useState<AcpBackendConfig[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editAgent, setEditAgent] = useState<PresetAgentType>('gemini');
  const [editSkills, setEditSkills] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [promptViewMode, setPromptViewMode] = useState<'edit' | 'preview'>('preview');
  const [skillsViewMode, setSkillsViewMode] = useState<'edit' | 'preview'>('preview');
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const skillsTextareaWrapperRef = useRef<HTMLDivElement>(null);
  const localeKey = resolveLocaleKey(i18n.language);
  const avatarImageMap: Record<string, string> = {
    'cowork.svg': coworkSvg,
    '🛠️': coworkSvg,
  };

  // Auto focus textarea when drawer opens
  useEffect(() => {
    if (editVisible && promptViewMode === 'edit') {
      // Small delay to ensure the drawer animation is complete
      const timer = setTimeout(() => {
        const textarea = textareaWrapperRef.current?.querySelector('textarea');
        textarea?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editVisible, promptViewMode]);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // ignore
    }
  }, []);

  // 从文件加载助手规则内容 / Load assistant rule content from file
  const loadAssistantContext = useCallback(
    async (assistantId: string): Promise<string> => {
      try {
        const content = await ipcBridge.fs.readAssistantRule.invoke({ assistantId, locale: localeKey });
        return content || '';
      } catch (error) {
        console.error(`Failed to load rule for ${assistantId}:`, error);
        return '';
      }
    },
    [localeKey]
  );

  // 从文件加载助手技能内容 / Load assistant skill content from file
  const loadAssistantSkills = useCallback(
    async (assistantId: string): Promise<string> => {
      try {
        const content = await ipcBridge.fs.readAssistantSkill.invoke({ assistantId, locale: localeKey });
        return content || '';
      } catch (error) {
        console.error(`Failed to load skills for ${assistantId}:`, error);
        return '';
      }
    },
    [localeKey]
  );

  const loadAssistants = useCallback(async () => {
    try {
      // 从配置中读取已存储的助手（包含内置助手和用户自定义助手）
      // Read stored assistants from config (includes builtin and user-defined)
      const allAgents: AcpBackendConfig[] = (await ConfigStorage.get('acp.customAgents')) || [];

      // 过滤出助手（isPreset 为 true 的助手）
      // Filter assistants (agents with isPreset = true)
      const presetAssistants = allAgents.filter((agent) => agent.isPreset);

      setAssistants(presetAssistants);
      setActiveAssistantId((prev) => prev || presetAssistants[0]?.id || null);
    } catch (error) {
      console.error('Failed to load assistant presets:', error);
    }
  }, []);

  useEffect(() => {
    void loadAssistants();
  }, [loadAssistants]);

  const activeAssistant = assistants.find((assistant) => assistant.id === activeAssistantId) || null;

  // Check if string is an emoji (simple check for common emoji patterns)
  const isEmoji = useCallback((str: string) => {
    if (!str) return false;
    // Check if it's a single emoji or emoji sequence
    const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
    return emojiRegex.test(str);
  }, []);

  const renderAvatarGroup = useCallback(
    (assistant: AcpBackendConfig, size = 32) => {
      const resolvedAvatar = assistant.avatar?.trim();
      const hasEmojiAvatar = resolvedAvatar && isEmoji(resolvedAvatar);
      const avatarImage = resolvedAvatar ? avatarImageMap[resolvedAvatar] : undefined;
      const iconSize = Math.floor(size * 0.5);
      const emojiSize = Math.floor(size * 0.6);

      return (
        <Avatar.Group size={size}>
          <Avatar className='border-none' shape='square' style={{ backgroundColor: 'var(--color-fill-2)' }}>
            {avatarImage ? <img src={avatarImage} alt='' width={emojiSize} height={emojiSize} style={{ objectFit: 'contain' }} /> : hasEmojiAvatar ? <span style={{ fontSize: emojiSize }}>{resolvedAvatar}</span> : <Robot theme='outline' size={iconSize} />}
          </Avatar>
        </Avatar.Group>
      );
    },
    [avatarImageMap, isEmoji]
  );

  const handleEdit = async (assistant: AcpBackendConfig) => {
    setIsCreating(false);
    setActiveAssistantId(assistant.id);
    setEditName(assistant.name || '');
    setEditDescription(assistant.description || '');
    setEditAvatar(assistant.avatar || '');
    setEditAgent(assistant.presetAgentType || 'gemini');
    setEditVisible(true);

    // 先加载规则和技能内容，再打开 drawer / Load rule and skill content first, then open drawer
    try {
      const [context, skills] = await Promise.all([loadAssistantContext(assistant.id), loadAssistantSkills(assistant.id)]);
      setEditContext(context);
      setEditSkills(skills);
    } catch (error) {
      console.error('Failed to load assistant content:', error);
      setEditContext('');
      setEditSkills('');
    }
  };

  // 暂时禁用创建功能 / Temporarily disabled create function
  const _handleCreate = () => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName('');
    setEditDescription('');
    setEditContext('');
    setEditAvatar('🤖');
    setEditVisible(true);
  };

  const handleSave = async () => {
    try {
      // 只更新 Main Agent 类型 / Only update Main Agent type
      if (!activeAssistant) return;

      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgent: AcpBackendConfig = {
        ...activeAssistant,
        presetAgentType: editAgent,
      };
      const updatedAgents = agents.map((agent) => (agent.id === activeAssistant.id ? updatedAgent : agent));
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((agent) => agent.isPreset));
      message.success(t('common.success', { defaultValue: 'Success' }));

      setEditVisible(false);
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to save assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  const handleDeleteClick = () => {
    if (!activeAssistant) return;
    setDeleteConfirmVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeAssistant) return;
    try {
      // 1. 删除规则和技能文件 / Delete rule and skill files
      await Promise.all([ipcBridge.fs.deleteAssistantRule.invoke({ assistantId: activeAssistant.id }), ipcBridge.fs.deleteAssistantSkill.invoke({ assistantId: activeAssistant.id })]);

      // 2. 从配置中移除助手 / Remove assistant from config
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.filter((agent) => agent.id !== activeAssistant.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((agent) => agent.isPreset));
      setActiveAssistantId(updatedAgents.find((agent) => agent.isPreset)?.id || null);
      setDeleteConfirmVisible(false);
      setEditVisible(false);
      message.success(t('common.success', { defaultValue: 'Success' }));
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to delete assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  // Toggle assistant enabled state / 切换助手启用状态
  const handleToggleEnabled = async (assistant: AcpBackendConfig, enabled: boolean) => {
    try {
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.map((agent) => (agent.id === assistant.id ? { ...agent, enabled } : agent));
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((agent) => agent.isPreset));
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to toggle assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  return (
    <div>
      <Collapse.Item
        header={
          <div className='flex items-center justify-between w-full'>
            <span>{t('settings.assistants', { defaultValue: 'Assistants' })}</span>
          </div>
        }
        name='smart-assistants'
        // extra={
        //   <Button
        //     type='text'
        //     size='small'
        //     icon={<Plus size={14} />}
        //     onClick={(e) => {
        //       e.stopPropagation();
        //       handleCreate();
        //     }}
        //   >
        //     {t('settings.createAssistant', { defaultValue: 'Create' })}
        //   </Button>
        // }
      >
        <div className='py-2'>
          <div className='bg-fill-2 rounded-2xl p-20px'>
            <div className='text-14px text-t-secondary mb-12px'>{t('settings.assistantsList', { defaultValue: 'Available assistants' })}</div>
            {assistants.length > 0 ? (
              <div className='space-y-12px'>
                {assistants.map((assistant) => (
                  <div
                    key={assistant.id}
                    className='bg-fill-0 rounded-lg px-16px py-12px flex items-center justify-between cursor-pointer hover:bg-fill-1 transition-colors'
                    onClick={() => {
                      setActiveAssistantId(assistant.id);
                      void handleEdit(assistant);
                    }}
                  >
                    <div className='flex items-center gap-12px min-w-0'>
                      {renderAvatarGroup(assistant, 28)}
                      <div className='min-w-0'>
                        <div className='font-medium text-t-primary truncate'>{assistant.nameI18n?.[localeKey] || assistant.name}</div>
                        <div className='text-12px text-t-secondary truncate'>{assistant.descriptionI18n?.[localeKey] || assistant.description || ''}</div>
                      </div>
                    </div>
                    <div className='flex items-center gap-12px text-t-secondary'>
                      <Switch
                        size='small'
                        checked={assistant.enabled !== false}
                        onChange={(checked) => {
                          void handleToggleEnabled(assistant, checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {/* 编辑按钮暂时隐藏 / Edit button temporarily hidden */}
                      {false && (
                        <Button
                          type='text'
                          size='small'
                          icon={<SettingOne size={16} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleEdit(assistant);
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center text-t-secondary py-12px'>{t('settings.assistantsEmpty', { defaultValue: 'No assistants configured.' })}</div>
            )}
          </div>
        </div>
      </Collapse.Item>

      <Drawer
        title={
          <>
            <span>{isCreating ? t('settings.createAssistant', { defaultValue: 'Create Assistant' }) : t('settings.editAssistant', { defaultValue: 'Assistant Details' })}</span>
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
        width={480}
        zIndex={2000}
        onCancel={() => setEditVisible(false)}
        headerStyle={{ background: 'var(--color-bg-1)' }}
        bodyStyle={{ background: 'var(--color-bg-1)' }}
        footer={
          <div className='flex items-center justify-between w-full'>
            <div className='flex items-center gap-8px'>
              <Button type='primary' onClick={handleSave} className='w-[100px] rounded-[100px]'>
                {isCreating ? t('common.create', { defaultValue: 'Create' }) : t('common.save', { defaultValue: 'Save' })}
              </Button>
              <Button onClick={() => setEditVisible(false)} className='w-[100px] rounded-[100px] bg-fill-2'>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
            {false && !isCreating && (
              <Button status='danger' onClick={handleDeleteClick} className='rounded-[100px]' style={{ backgroundColor: 'rgb(var(--danger-1))' }}>
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
                <span className='text-red-500'>*</span> {t('settings.assistantNameAvatar', { defaultValue: 'Name & Avatar' })}
              </Typography.Text>
              <div className='mt-10px flex items-center gap-12px'>
                <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px'>
                  {editAvatar && avatarImageMap[editAvatar.trim()] ? <img src={avatarImageMap[editAvatar.trim()]} alt='' width={24} height={24} style={{ objectFit: 'contain' }} /> : editAvatar ? <span className='text-24px'>{editAvatar}</span> : <Robot theme='outline' size={20} />}
                </Avatar>
                <Input value={editName} disabled placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })} className='w-[398px] rounded-4px bg-bg-1' />
              </div>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>{t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}</Typography.Text>
              <Input className='mt-10px rounded-4px bg-bg-1' value={editDescription} disabled placeholder={t('settings.assistantDescriptionPlaceholder', { defaultValue: 'What can this assistant help with?' })} />
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>{t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}</Typography.Text>
              <Select className='mt-10px w-full rounded-4px' value={editAgent} onChange={(value) => setEditAgent(value as PresetAgentType)}>
                <Select.Option value='gemini'>Gemini</Select.Option>
                <Select.Option value='claude'>Claude</Select.Option>
                <Select.Option value='codex'>Codex</Select.Option>
              </Select>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold className='flex-shrink-0'>
                {t('settings.assistantRules', { defaultValue: 'Rules' })}
              </Typography.Text>
              {/* Prompt Edit/Preview Tabs */}
              <div className='mt-10px border border-border-2 overflow-hidden rounded-4px' style={{ height: '300px' }}>
                <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                  <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setPromptViewMode('edit')}>
                    {t('settings.promptEdit', { defaultValue: 'Edit' })}
                  </div>
                  <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setPromptViewMode('preview')}>
                    {t('settings.promptPreview', { defaultValue: 'Preview' })}
                  </div>
                </div>
                <div className='bg-fill-2' style={{ height: 'calc(100% - 36px)', overflow: 'auto' }}>
                  {promptViewMode === 'edit' ? (
                    <div ref={textareaWrapperRef} className='h-full'>
                      <Input.TextArea value={editContext} disabled placeholder={t('settings.assistantRulesPlaceholder', { defaultValue: 'Enter rules in Markdown format...' })} autoSize={false} className='border-none rounded-none bg-transparent h-full resize-none' />
                    </div>
                  ) : (
                    <div className='p-16px'>{editContext ? <MarkdownView hiddenCodeCopyButton>{editContext}</MarkdownView> : <div className='text-t-secondary text-center py-32px'>{t('settings.promptPreviewEmpty', { defaultValue: 'No content to preview' })}</div>}</div>
                  )}
                </div>
              </div>
            </div>
            <div className='flex-shrink-0 mt-16px'>
              <Typography.Text bold className='flex-shrink-0'>
                {t('settings.assistantSkills', { defaultValue: 'Skills' })}
              </Typography.Text>
              {/* Skills Edit/Preview Tabs */}
              <div className='mt-10px border border-border-2 overflow-hidden rounded-4px' style={{ height: '300px' }}>
                <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                  <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${skillsViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setSkillsViewMode('edit')}>
                    {t('settings.promptEdit', { defaultValue: 'Edit' })}
                  </div>
                  <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${skillsViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setSkillsViewMode('preview')}>
                    {t('settings.promptPreview', { defaultValue: 'Preview' })}
                  </div>
                </div>
                <div className='bg-fill-2' style={{ height: 'calc(100% - 36px)', overflow: 'auto' }}>
                  {skillsViewMode === 'edit' ? (
                    <div ref={skillsTextareaWrapperRef} className='h-full'>
                      <Input.TextArea value={editSkills} disabled placeholder={t('settings.assistantSkillsPlaceholder', { defaultValue: 'Enter skills in Markdown format...' })} autoSize={false} className='border-none rounded-none bg-transparent h-full resize-none' />
                    </div>
                  ) : (
                    <div className='p-16px'>{editSkills ? <MarkdownView hiddenCodeCopyButton>{editSkills}</MarkdownView> : <div className='text-t-secondary text-center py-32px'>{t('settings.promptPreviewEmpty', { defaultValue: 'No content to preview' })}</div>}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal title={t('settings.deleteAssistantTitle', { defaultValue: 'Delete Assistant' })} visible={deleteConfirmVisible} onCancel={() => setDeleteConfirmVisible(false)} onOk={handleDeleteConfirm} okButtonProps={{ status: 'danger' }} okText={t('common.delete', { defaultValue: 'Delete' })} cancelText={t('common.cancel', { defaultValue: 'Cancel' })} style={{ width: 400, zIndex: 2001 }}>
        <p>{t('settings.deleteAssistantConfirm', { defaultValue: 'Are you sure you want to delete this assistant? This action cannot be undone.' })}</p>
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
    </div>
  );
};

export default AssistantManagement;
