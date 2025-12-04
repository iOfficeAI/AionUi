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
  const [customAgent, setCustomAgent] = useState<AcpBackendConfig | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  // Load custom agent config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await ConfigStorage.get('acp.customAgent');
        if (config) {
          setCustomAgent(config);
        }
      } catch (error) {
        console.error('Failed to load custom agent config:', error);
      }
    };
    void loadConfig();
  }, []);

  const handleSaveAgent = useCallback(
    async (agentData: AcpBackendConfig) => {
      try {
        await ConfigStorage.set('acp.customAgent', agentData);
        setCustomAgent(agentData);
        setShowModal(false);
        message.success(t('settings.customAcpAgentSaved') || 'Custom agent saved');

        // Refresh agent detection to include the new custom agent
        try {
          await acpConversation.refreshCustomAgent.invoke();
          // Invalidate SWR cache so UI updates immediately
          await mutate('acp.agents.available');
        } catch {
          // Refresh failed - UI will update on next page load
        }
      } catch (error) {
        console.error('Failed to save custom agent config:', error);
        message.error(t('settings.customAcpAgentSaveFailed') || 'Failed to save custom agent');
      }
    },
    [message, t]
  );

  const handleDeleteAgent = useCallback(async () => {
    try {
      await ConfigStorage.remove('acp.customAgent');
      setCustomAgent(null);
      setDeleteConfirmVisible(false);
      message.success(t('settings.customAcpAgentDeleted') || 'Custom agent deleted');

      // Refresh agent detection to remove the custom agent
      try {
        await acpConversation.refreshCustomAgent.invoke();
        // Invalidate SWR cache so UI updates immediately
        await mutate('acp.agents.available');
      } catch {
        // Refresh failed - UI will update on next page load
      }
    } catch (error) {
      console.error('Failed to delete custom agent config:', error);
      message.error(t('settings.customAcpAgentDeleteFailed') || 'Failed to delete custom agent');
    }
  }, [message, t]);

  return (
    <div>
      <Collapse.Item
        className={' [&_div.arco-collapse-item-header-title]:flex-1'}
        header={
          <div className='flex items-center justify-between'>
            {t('settings.customAcpAgent') || 'Custom ACP Agent'}
            {!customAgent ? (
              <Button
                type='outline'
                icon={<Plus size={'14'} />}
                shape='round'
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModal(true);
                }}
              >
                {t('settings.configureCustomAgent') || 'Configure'}
              </Button>
            ) : null}
          </div>
        }
        name={'custom-acp-agent'}
      >
        <div className='py-2'>
          {!customAgent ? (
            <div className='text-center py-4 text-t-secondary'>{t('settings.noCustomAgentConfigured') || 'No custom agent configured'}</div>
          ) : (
            <div className='p-4 bg-fill-2 rounded-lg'>
              <div className='flex items-center justify-between mb-2'>
                <div className='font-medium'>{customAgent.name || 'Custom Agent'}</div>
                <div className='flex gap-2'>
                  <Button type='text' size='small' icon={<EditTwo size={'14'} />} onClick={() => setShowModal(true)} />
                  <Button type='text' size='small' status='danger' icon={<Delete size={'14'} />} onClick={() => setDeleteConfirmVisible(true)} />
                </div>
              </div>
              <div className='text-sm text-t-secondary'>
                <div>
                  <span className='font-medium'>{t('settings.cliPath') || 'CLI Path'}:</span> {customAgent.defaultCliPath}
                </div>
                {customAgent.env && Object.keys(customAgent.env).length > 0 && (
                  <div>
                    <span className='font-medium'>{t('settings.env') || 'Env'}:</span> {Object.keys(customAgent.env).length} variable(s)
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Collapse.Item>

      <CustomAcpAgentModal visible={showModal} agent={customAgent} onCancel={() => setShowModal(false)} onSubmit={handleSaveAgent} />

      <Modal title={t('settings.deleteCustomAgent') || 'Delete Custom Agent'} visible={deleteConfirmVisible} onCancel={() => setDeleteConfirmVisible(false)} onOk={handleDeleteAgent} okButtonProps={{ status: 'danger' }} okText={t('common.confirm') || 'Confirm'} cancelText={t('common.cancel') || 'Cancel'}>
        <p>{t('settings.deleteCustomAgentConfirm') || 'Are you sure you want to delete this custom agent?'}</p>
      </Modal>
    </div>
  );
};

export default CustomAcpAgent;
