import { Avatar, Button, Collapse, Input, Modal, Typography } from '@arco-design/web-react';
import type { Message } from '@arco-design/web-react';
import { Right, Robot, SettingOne } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import type { AcpBackendConfig } from '@/types/acpTypes';
import PdfToPptLogo from '@/renderer/assets/logos/pdf-to-ppt.svg';

interface SmartAssistantManagementProps {
  message: ReturnType<typeof Message.useMessage>[0];
}

const DEFAULT_ASSISTANT_ID = 'pdf-to-ppt-preset';
const DEFAULT_CONTEXT_PATHS = ['skill/gemini-rules.md', 'out/gemini-rules.md'];

const SmartAssistantManagement: React.FC<SmartAssistantManagementProps> = ({ message }) => {
  const { t } = useTranslation();
  const [assistants, setAssistants] = useState<AcpBackendConfig[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContext, setEditContext] = useState('');

  const loadDefaultContext = useCallback(async () => {
    for (const path of DEFAULT_CONTEXT_PATHS) {
      try {
        const content = await ipcBridge.fs.readFile.invoke({ path });
        if (content?.trim()) return content;
      } catch {
        // ignore missing files
      }
    }
    return '';
  }, []);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // ignore
    }
  }, []);

  const ensureDefaultAssistant = useCallback(async () => {
    try {
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const existing = agents.find((agent) => agent.id === DEFAULT_ASSISTANT_ID);
      let updatedAgents = agents;
      if (!existing) {
        const context = await loadDefaultContext();
        const defaultAgent: AcpBackendConfig = {
          id: DEFAULT_ASSISTANT_ID,
          name: t('settings.pdfToPptAssistantName', { defaultValue: 'PDF to PPT' }),
          description: t('settings.pdfToPptAssistantDesc', {
            defaultValue: 'Convert PDF to PPT with watermark removal rules.',
          }),
          enabled: true,
          isPreset: true,
          context,
        };
        updatedAgents = [...agents, defaultAgent];
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        await refreshAgentDetection();
      }

      const presetAgents = updatedAgents.filter((agent) => agent.isPreset);
      setAssistants(presetAgents);
      setActiveAssistantId((prev) => prev || presetAgents[0]?.id || null);
    } catch (error) {
      console.error('Failed to ensure default assistant:', error);
    }
  }, [loadDefaultContext, refreshAgentDetection, t]);

  useEffect(() => {
    void ensureDefaultAssistant();
  }, [ensureDefaultAssistant]);

  const activeAssistant = assistants.find((assistant) => assistant.id === activeAssistantId) || null;
  const isDefaultAssistant = activeAssistant?.id === DEFAULT_ASSISTANT_ID;

  const renderAvatarGroup = useCallback((assistant: AcpBackendConfig, size = 32) => {
    const isPdfAssistant = assistant.id === DEFAULT_ASSISTANT_ID;
    return (
      <Avatar.Group size={size}>
        <Avatar shape='square' style={{ backgroundColor: 'var(--color-fill-2)' }}>
          {isPdfAssistant ? <img src={PdfToPptLogo} width={16} height={16} alt={assistant.name} /> : <Robot theme='outline' size={16} />}
        </Avatar>
      </Avatar.Group>
    );
  }, []);

  const handleEdit = (assistant: AcpBackendConfig) => {
    setActiveAssistantId(assistant.id);
    setEditName(assistant.name || t('settings.pdfToPptAssistantName', { defaultValue: 'PDF to PPT' }));
    setEditDescription(assistant.description || '');
    setEditContext(assistant.context || '');
    setEditVisible(true);
  };

  const handleSave = async () => {
    if (!activeAssistant) return;
    try {
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.map((agent) => (agent.id === activeAssistant.id ? { ...agent, name: editName, description: editDescription, context: editContext } : agent));
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((agent) => agent.isPreset));
      setEditVisible(false);
      message.success(t('common.success', { defaultValue: 'Success' }));
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to save assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  const handleDelete = async () => {
    if (!activeAssistant || isDefaultAssistant) return;
    try {
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.filter((agent) => agent.id !== activeAssistant.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((agent) => agent.isPreset));
      setActiveAssistantId(updatedAgents.find((agent) => agent.isPreset)?.id || null);
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
      <Collapse.Item header={<div className='flex items-center justify-between'>{t('settings.smartAssistants', { defaultValue: 'Smart Assistants' })}</div>} name='smart-assistants'>
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
                        <div className='text-12px text-t-secondary truncate'>{assistant.description || t('settings.pdfToPptAssistantDesc', { defaultValue: 'Convert PDF to PPT with watermark removal rules.' })}</div>
                      </div>
                    </div>
                    <div className='flex items-center gap-8px text-t-secondary'>
                      <Button type='text' size='small' icon={<SettingOne size={16} />} onClick={() => handleEdit(assistant)} />
                      <Right size={16} />
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

      <Modal
        title={t('settings.editAssistant', { defaultValue: 'Assistant Details' })}
        visible={editVisible}
        onCancel={() => setEditVisible(false)}
        footer={
          <div className='flex items-center justify-between w-full'>
            <div className='flex items-center gap-8px'>
              <Button type='primary' onClick={handleSave}>
                {t('settings.saveAssistant', { defaultValue: 'Save Settings' })}
              </Button>
              <Button onClick={() => setEditVisible(false)}>{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
            </div>
            <Button status='danger' disabled={isDefaultAssistant} onClick={handleDelete}>
              {t('common.delete', { defaultValue: 'Delete' })}
            </Button>
          </div>
        }
        style={{ width: 640 }}
      >
        <div className='space-y-16px'>
          <div>
            <Typography.Text bold>
              <span className='text-red-500'>*</span> {t('settings.assistantNameAvatar', { defaultValue: 'Name & Avatar' })}
            </Typography.Text>
            <div className='mt-10px flex items-center gap-12px'>
              {activeAssistant ? renderAvatarGroup(activeAssistant, 36) : null}
              <Input value={editName} onChange={setEditName} placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })} />
            </div>
          </div>
          <div>
            <Typography.Text bold>{t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}</Typography.Text>
            <Input className='mt-10px' value={editDescription} onChange={setEditDescription} placeholder={t('settings.assistantDescriptionPlaceholder', { defaultValue: 'What can this assistant help with?' })} />
          </div>
          <div>
            <Typography.Text bold>
              <span className='text-red-500'>*</span> {t('settings.assistantPrompt', { defaultValue: 'Prompt' })}
            </Typography.Text>
            <Input.TextArea className='mt-10px' value={editContext} onChange={setEditContext} placeholder={t('settings.assistantPromptPlaceholder', { defaultValue: 'Enter prompt or rules...' })} autoSize={{ minRows: 6, maxRows: 12 }} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SmartAssistantManagement;
