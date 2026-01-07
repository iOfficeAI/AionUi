import type { Message } from '@arco-design/web-react';
import { Avatar, Button, Collapse, Input, Drawer, Modal, Typography } from '@arco-design/web-react';
import { Right, Robot, SettingOne, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { uuid, resolveLocaleKey } from '@/common/utils';
import type { AcpBackendConfig } from '@/types/acpTypes';
import EmojiPicker from '@/renderer/components/EmojiPicker';
import MarkdownView from '@/renderer/components/Markdown';

interface SmartAssistantManagementProps {
  message: ReturnType<typeof Message.useMessage>[0];
}

const SmartAssistantManagement: React.FC<SmartAssistantManagementProps> = ({ message }) => {
  const { t, i18n } = useTranslation();
  const [assistants, setAssistants] = useState<AcpBackendConfig[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [promptViewMode, setPromptViewMode] = useState<'edit' | 'preview'>('edit');
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const localeKey = resolveLocaleKey(i18n.language);

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

  const resolveAssistantContext = useCallback(
    (assistant: AcpBackendConfig | null) => {
      if (!assistant) return '';
      const contextI18n = assistant.contextI18n || {};
      const localized = contextI18n[localeKey];
      if (localized) return localized;
      return contextI18n['zh-CN'] || contextI18n['en-US'] || assistant.context || '';
    },
    [localeKey]
  );

  const loadAssistants = useCallback(async () => {
    try {
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const presetAgents = agents.filter((agent) => agent.isPreset);
      setAssistants(presetAgents);
      setActiveAssistantId((prev) => prev || presetAgents[0]?.id || null);
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
      const hasEmojiAvatar = assistant.avatar && isEmoji(assistant.avatar);
      const iconSize = Math.floor(size * 0.5);
      const emojiSize = Math.floor(size * 0.6);

      return (
        <Avatar.Group size={size}>
          <Avatar shape='square' style={{ backgroundColor: 'var(--color-fill-2)' }}>
            {hasEmojiAvatar ? <span style={{ fontSize: emojiSize }}>{assistant.avatar}</span> : <Robot theme='outline' size={iconSize} />}
          </Avatar>
        </Avatar.Group>
      );
    },
    [isEmoji]
  );

  const handleEdit = (assistant: AcpBackendConfig) => {
    setIsCreating(false);
    setActiveAssistantId(assistant.id);
    setEditName(assistant.name || '');
    setEditDescription(assistant.description || '');
    setEditContext(resolveAssistantContext(assistant));
    setEditAvatar(assistant.avatar || '');
    setEditVisible(true);
  };

  const handleCreate = () => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName('');
    setEditDescription('');
    setEditContext('');
    setEditAvatar('🤖');
    setEditVisible(true);
  };

  const handleSave = async () => {
    // Validate required fields
    if (!editName.trim()) {
      message.warning(t('settings.assistantNameRequired', { defaultValue: 'Name is required' }));
      return;
    }
    if (!editContext.trim()) {
      message.warning(t('settings.assistantPromptRequired', { defaultValue: 'Prompt is required' }));
      return;
    }

    try {
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];

      if (isCreating) {
        // Create new assistant
        const newAssistant: AcpBackendConfig = {
          id: `smart-assistant-${uuid()}`,
          name: editName.trim(),
          description: editDescription.trim(),
          context: editContext.trim(),
          contextI18n: {
            [localeKey]: editContext.trim(),
          },
          avatar: editAvatar || '🤖',
          enabled: true,
          isPreset: true,
          presetAgentType: 'gemini', // Smart assistants always use Gemini rules
        };
        const updatedAgents = [...agents, newAssistant];
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setAssistants(updatedAgents.filter((agent) => agent.isPreset));
        message.success(t('settings.assistantCreated', { defaultValue: 'Assistant created' }));
      } else {
        // Update existing assistant
        if (!activeAssistant) return;
        const nextContextI18n = {
          ...(activeAssistant.contextI18n || {}),
          [localeKey]: editContext.trim(),
        };
        const updatedAgent: AcpBackendConfig = {
          ...activeAssistant,
          name: editName.trim(),
          description: editDescription.trim(),
          context: editContext.trim(),
          contextI18n: nextContextI18n,
          avatar: editAvatar,
          presetAgentType: 'gemini', // Smart assistants always use Gemini rules
        };
        const updatedAgents = agents.map((agent) => (agent.id === activeAssistant.id ? updatedAgent : agent));
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setAssistants(updatedAgents.filter((agent) => agent.isPreset));
        message.success(t('common.success', { defaultValue: 'Success' }));
      }

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

  return (
    <div>
      <Collapse.Item
        header={
          <div className='flex items-center justify-between w-full'>
            <span>{t('settings.smartAssistants', { defaultValue: 'Smart Assistants' })}</span>
          </div>
        }
        name='smart-assistants'
        extra={
          <Button
            type='text'
            size='small'
            icon={<Plus size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              handleCreate();
            }}
          >
            {t('settings.createAssistant', { defaultValue: 'Create' })}
          </Button>
        }
      >
        <div className='py-2'>
          <div className='bg-fill-2 rounded-2xl p-20px'>
            <div className='text-14px text-t-secondary mb-12px'>{t('settings.smartAssistantsList', { defaultValue: 'Available assistants' })}</div>
            {assistants.length > 0 ? (
              <div className='space-y-12px'>
                {assistants.map((assistant) => (
                  <div
                    key={assistant.id}
                    className='bg-fill-0 rounded-lg px-16px py-12px flex items-center justify-between cursor-pointer hover:bg-fill-1 transition-colors'
                    onClick={() => {
                      setActiveAssistantId(assistant.id);
                      handleEdit(assistant);
                    }}
                  >
                    <div className='flex items-center gap-12px min-w-0'>
                      {renderAvatarGroup(assistant, 28)}
                      <div className='min-w-0'>
                        <div className='font-medium text-t-primary truncate'>{assistant.name}</div>
                        <div className='text-12px text-t-secondary truncate'>{assistant.description || ''}</div>
                      </div>
                    </div>
                    <div className='flex items-center gap-8px text-t-secondary'>
                      <Button
                        type='text'
                        size='small'
                        icon={<SettingOne size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(assistant);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center text-t-secondary py-12px'>{t('settings.smartAssistantsEmpty', { defaultValue: 'No assistants configured.' })}</div>
            )}
          </div>
        </div>
      </Collapse.Item>

      <Drawer
        title={isCreating ? t('settings.createAssistant', { defaultValue: 'Create Assistant' }) : t('settings.editAssistant', { defaultValue: 'Assistant Details' })}
        visible={editVisible}
        placement='right'
        width={480}
        onCancel={() => setEditVisible(false)}
        footer={
          <div className='flex items-center justify-between w-full'>
            <div className='flex items-center gap-8px'>
              <Button type='primary' onClick={handleSave}>
                {isCreating ? t('common.create', { defaultValue: 'Create' }) : t('settings.saveAssistant', { defaultValue: 'Save Settings' })}
              </Button>
              <Button onClick={() => setEditVisible(false)}>{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
            </div>
            {!isCreating && (
              <Typography.Text className='cursor-pointer transition-colors' style={{ color: 'rgb(var(--danger-6))' }} onClick={handleDeleteClick} onMouseEnter={(e) => (e.currentTarget.style.color = 'rgb(var(--danger-5))')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgb(var(--danger-6))')}>
                {t('common.delete', { defaultValue: 'Delete' })}
              </Typography.Text>
            )}
          </div>
        }
      >
        <div className='flex flex-col h-full gap-16px'>
          <div className='flex-shrink-0'>
            <Typography.Text bold>
              <span className='text-red-500'>*</span> {t('settings.assistantNameAvatar', { defaultValue: 'Name & Avatar' })}
            </Typography.Text>
            <div className='mt-10px flex items-center gap-12px'>
              <EmojiPicker value={editAvatar} onChange={setEditAvatar}>
                <Avatar shape='square' size={40} style={{ backgroundColor: 'var(--color-fill-2)', cursor: 'pointer' }}>
                  {editAvatar ? <span style={{ fontSize: 24 }}>{editAvatar}</span> : <Robot theme='outline' size={20} />}
                </Avatar>
              </EmojiPicker>
              <Input value={editName} onChange={setEditName} placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })} className='flex-1' />
            </div>
          </div>
          <div className='flex-shrink-0'>
            <Typography.Text bold>{t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}</Typography.Text>
            <Input className='mt-10px' value={editDescription} onChange={setEditDescription} placeholder={t('settings.assistantDescriptionPlaceholder', { defaultValue: 'What can this assistant help with?' })} />
          </div>
          <div className='flex-1 flex flex-col min-h-0'>
            <Typography.Text bold className='flex-shrink-0'>
              <span className='text-red-500'>*</span> {t('settings.assistantRules', { defaultValue: 'Rules' })}
            </Typography.Text>
            <div className='text-12px text-t-secondary mt-4px mb-8px flex-shrink-0'>{t('settings.assistantRulesHint', { defaultValue: 'Enter rules for Gemini. Rules define how the assistant should behave and respond.' })}</div>
            {/* Prompt Edit/Preview Tabs */}
            <div className='mt-10px border border-border-2 rounded-lg overflow-hidden flex-1 flex flex-col min-h-200px'>
              <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setPromptViewMode('edit')}>
                  {t('settings.promptEdit', { defaultValue: 'Edit' })}
                </div>
                <div className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`} onClick={() => setPromptViewMode('preview')}>
                  {t('settings.promptPreview', { defaultValue: 'Preview' })}
                </div>
              </div>
              <div className='flex-1 overflow-auto bg-fill-2'>
                {promptViewMode === 'edit' ? (
                  <div ref={textareaWrapperRef} className='h-full'>
                    <Input.TextArea value={editContext} onChange={setEditContext} placeholder={t('settings.assistantRulesPlaceholder', { defaultValue: 'Enter rules in Markdown format...' })} autoSize={false} style={{ border: 'none', borderRadius: 0, backgroundColor: 'transparent', height: '100%', resize: 'none' }} />
                  </div>
                ) : (
                  <div className='p-16px'>{editContext ? <MarkdownView hiddenCodeCopyButton>{editContext}</MarkdownView> : <div className='text-t-secondary text-center py-32px'>{t('settings.promptPreviewEmpty', { defaultValue: 'No content to preview' })}</div>}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal title={t('settings.deleteAssistantTitle', { defaultValue: 'Delete Assistant' })} visible={deleteConfirmVisible} onCancel={() => setDeleteConfirmVisible(false)} onOk={handleDeleteConfirm} okButtonProps={{ status: 'danger' }} okText={t('common.delete', { defaultValue: 'Delete' })} cancelText={t('common.cancel', { defaultValue: 'Cancel' })} style={{ width: 400 }}>
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

export default SmartAssistantManagement;
