import { Button, Collapse, Modal } from '@arco-design/web-react';
import { Plus, EditTwo, Delete } from '@icon-park/react';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';
import { ConfigStorage } from '@/common/storage';
import type { AcpBackendConfig } from '@/types/acpTypes';
import { acpConversation } from '@/common/ipcBridge';
import CustomAcpAgentModal from './CustomAcpAgentModal';

interface CustomAcpAgentProps {
  message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0];
}

const CustomAcpAgent: React.FC<CustomAcpAgentProps> = ({ message }) => {
  const { t } = useTranslation();
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AcpBackendConfig | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AcpBackendConfig | null>(null);

  /**
   * 刷新代理检测结果
   * 在配置变更后调用以更新可用代理列表
   * Refresh agent detection results
   * Called after config changes to update available agents list
   */
  const refreshAgentDetection = useCallback(async () => {
    try {
      await acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // 刷新失败 - 下次页面加载时更新 / Refresh failed - UI will update on next page load
    }
  }, []);

  /**
   * 组件挂载时加载自定义代理配置，并支持从旧的单代理格式迁移
   * Load custom agents config on mount, with migration from old single-agent format
   */
  useEffect(() => {
    const loadConfig = async () => {
      try {
        // 首先检查新的数组格式 / First check for new array format
        const agents = await ConfigStorage.get('acp.customAgents');
        if (agents && Array.isArray(agents) && agents.length > 0) {
          setCustomAgents(agents.filter((a) => !a.isPreset));
          return;
        }

        // 检查旧的单代理格式并迁移（如果存在）
        // Check for old single-agent format and migrate if exists
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacyAgent = await (ConfigStorage as any).get('acp.customAgent');
        if (legacyAgent && typeof legacyAgent === 'object' && legacyAgent.defaultCliPath) {
          // 迁移：确保有 UUID / Migrate: ensure it has a UUID
          const migratedAgent: AcpBackendConfig = {
            ...legacyAgent,
            id: legacyAgent.id && legacyAgent.id !== 'custom' ? legacyAgent.id : `migrated-${Date.now()}`,
          };
          const migratedAgents = [migratedAgent];

          // 保存为新格式 / Save to new format
          await ConfigStorage.set('acp.customAgents', migratedAgents);
          // 删除旧格式 / Remove old format
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ConfigStorage as any).remove('acp.customAgent');

          setCustomAgents(migratedAgents);
          console.log('[CustomAcpAgent] Migrated legacy single agent to new array format');

          // 用新数据刷新检测 / Refresh detection with new data
          await refreshAgentDetection();
        }
      } catch (error) {
        console.error('Failed to load custom agents config:', error);
      }
    };
    void loadConfig();
  }, [refreshAgentDetection]);

  /**
   * 保存代理配置（新增或更新）
   * Save agent config (create or update)
   */
  const handleSaveAgent = useCallback(
    async (agentData: AcpBackendConfig) => {
      try {
        let updatedAgents: AcpBackendConfig[];

        if (editingAgent) {
          // 更新现有代理 / Update existing agent
          updatedAgents = customAgents.map((agent) => (agent.id === editingAgent.id ? agentData : agent));
        } else {
          // 添加新代理 / Add new agent
          updatedAgents = [...customAgents, agentData];
        }

        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents);
        setShowModal(false);
        setEditingAgent(null);
        message.success(t('settings.customAcpAgentSaved') || 'Custom agent saved');

        await refreshAgentDetection();
      } catch (error) {
        console.error('Failed to save custom agent config:', error);
        message.error(t('settings.customAcpAgentSaveFailed') || 'Failed to save custom agent');
      }
    },
    [customAgents, editingAgent, message, t, refreshAgentDetection]
  );

  /**
   * 删除代理配置
   * Delete agent config
   */
  const handleDeleteAgent = useCallback(async () => {
    if (!agentToDelete) return;

    try {
      // 过滤掉要删除的代理 / Filter out the agent to delete
      const updatedAgents = customAgents.filter((agent) => agent.id !== agentToDelete.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setCustomAgents(updatedAgents);
      setDeleteConfirmVisible(false);
      setAgentToDelete(null);
      message.success(t('settings.customAcpAgentDeleted') || 'Custom agent deleted');

      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to delete custom agent config:', error);
      message.error(t('settings.customAcpAgentDeleteFailed') || 'Failed to delete custom agent');
    }
  }, [agentToDelete, customAgents, message, t, refreshAgentDetection]);

  const handleAddNew = useCallback(() => {
    setEditingAgent(null);
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((agent: AcpBackendConfig) => {
    setEditingAgent(agent);
    setShowModal(true);
  }, []);

  const handleConfirmDelete = useCallback((agent: AcpBackendConfig) => {
    setAgentToDelete(agent);
    setDeleteConfirmVisible(true);
  }, []);

  return (
    <div>
      <Collapse.Item
        className={' [&_div.arco-collapse-item-header-title]:flex-1'}
        header={
          <div className='flex items-center justify-between'>
            {t('settings.customAcpAgent') || 'Custom ACP Agents'}
            <Button
              type='outline'
              icon={<Plus size={'14'} />}
              shape='round'
              onClick={(e) => {
                e.stopPropagation();
                handleAddNew();
              }}
            >
              {t('settings.addCustomAgent') || 'Add'}
            </Button>
          </div>
        }
        name={'custom-acp-agent'}
      >
        <div className='py-2'>
          {customAgents.length === 0 ? (
            <div className='text-center py-4 text-t-secondary'>{t('settings.noCustomAgentConfigured') || 'No custom agents configured'}</div>
          ) : (
            <div className='space-y-2'>
              {customAgents.map((agent) => (
                <div key={agent.id} className='p-4 bg-fill-2 rounded-lg'>
                  <div className='flex items-center justify-between mb-2'>
                    <div className='font-medium'>{agent.name || 'Custom Agent'}</div>
                    <div className='flex gap-2'>
                      <Button type='text' size='small' icon={<EditTwo size={'14'} />} onClick={() => handleEdit(agent)} />
                      <Button type='text' size='small' status='danger' icon={<Delete size={'14'} />} onClick={() => handleConfirmDelete(agent)} />
                    </div>
                  </div>
                  <div className='text-sm text-t-secondary'>
                    <div>
                      <span className='font-medium'>{t('settings.cliPath') || 'CLI Path'}:</span> {agent.defaultCliPath}
                    </div>
                    {agent.env && Object.keys(agent.env).length > 0 && (
                      <div>
                        <span className='font-medium'>{t('settings.env') || 'Env'}:</span> {Object.keys(agent.env).length} variable(s)
                      </div>
                    )}
                    {!agent.enabled && <div className='text-warning'>{t('settings.agentDisabled') || 'Disabled'}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Collapse.Item>

      <CustomAcpAgentModal visible={showModal} agent={editingAgent} onCancel={() => setShowModal(false)} onSubmit={handleSaveAgent} />

      <Modal title={t('settings.deleteCustomAgent') || 'Delete Custom Agent'} visible={deleteConfirmVisible} onCancel={() => setDeleteConfirmVisible(false)} onOk={handleDeleteAgent} okButtonProps={{ status: 'danger' }} okText={t('common.confirm') || 'Confirm'} cancelText={t('common.cancel') || 'Cancel'}>
        <p>
          {t('settings.deleteCustomAgentConfirm') || 'Are you sure you want to delete this custom agent?'}
          {agentToDelete && <strong className='block mt-2'>{agentToDelete.name}</strong>}
        </p>
      </Modal>
    </div>
  );
};

export default CustomAcpAgent;
