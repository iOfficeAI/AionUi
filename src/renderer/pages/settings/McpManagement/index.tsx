import { Button, Collapse, Message, Modal, Dropdown, Menu } from '@arco-design/web-react';
import { Plus, Down } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { IMcpServer } from '@/common/storage';
import AddMcpServerModal from '../components/AddMcpServerModal';
import McpServerItem from './McpServerItem';
import { useMcpServers, useMcpAgentStatus, useMcpOperations, useMcpConnection, useMcpModal, useMcpServerCRUD } from '@/renderer/hooks/mcp';

const McpManagement: React.FC = () => {
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage();

  // 使用自定义hooks管理各种状态和操作
  const { mcpServers, setMcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isLoadingAgentStatus, checkSingleServerInstallStatus } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);
  const { testingServers, handleTestMcpConnection } = useMcpConnection(mcpServers, setMcpServers, message);
  const { showMcpModal, editingMcpServer, deleteConfirmVisible, serverToDelete, mcpCollapseKey, showAddMcpModal, showEditMcpModal, hideMcpModal, showDeleteConfirm, hideDeleteConfirm, toggleServerCollapse } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer, handleToggleMcpServer } = useMcpServerCRUD(mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message);

  // 包装添加服务器，添加后自动测试连接
  const wrappedHandleAddMcpServer = React.useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (addedServer) {
        // 直接使用返回的服务器对象进行测试，避免闭包问题
        void handleTestMcpConnection(addedServer);
        if (serverData.enabled) {
          void syncMcpToAgents(addedServer, true);
        }
      }
    },
    [handleAddMcpServer, handleTestMcpConnection, syncMcpToAgents]
  );

  // 包装编辑服务器，编辑后自动测试连接
  const wrappedHandleEditMcpServer = React.useCallback(
    async (editingMcpServer: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const updatedServer = await handleEditMcpServer(editingMcpServer, serverData);
      if (updatedServer) {
        // 直接使用返回的服务器对象进行测试
        void handleTestMcpConnection(updatedServer);
        if (serverData.enabled) {
          void syncMcpToAgents(updatedServer, true);
        }
      }
    },
    [handleEditMcpServer, handleTestMcpConnection, syncMcpToAgents]
  );

  // 包装批量导入，导入后自动测试连接
  const wrappedHandleBatchImportMcpServers = React.useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const addedServers = await handleBatchImportMcpServers(serversData);
      if (addedServers && addedServers.length > 0) {
        addedServers.forEach((server) => {
          void handleTestMcpConnection(server);
          if (server.enabled) {
            void syncMcpToAgents(server, true);
          }
        });
      }
    },
    [handleBatchImportMcpServers, handleTestMcpConnection, syncMcpToAgents]
  );

  // 检测可用agents的状态
  const [detectedAgents, setDetectedAgents] = React.useState<Array<{ backend: string; name: string }>>([]);
  const [importMode, setImportMode] = React.useState<'json' | 'oneclick'>('json');

  React.useEffect(() => {
    const loadAgents = async () => {
      try {
        const { acpConversation } = await import('@/common/ipcBridge');
        const response = await acpConversation.getAvailableAgents.invoke();
        if (response.success && response.data) {
          setDetectedAgents(response.data.map((agent) => ({ backend: agent.backend, name: agent.name })));
        }
      } catch (error) {
        console.error('Failed to load agents:', error);
      }
    };
    void loadAgents();
  }, []);

  // 删除确认处理
  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;
    hideDeleteConfirm();
    await handleDeleteMcpServer(serverToDelete);
  };

  return (
    <div>
      {messageContext}
      <Collapse.Item
        className={' [&_div.arco-collapse-item-header-title]:flex-1'}
        header={
          <div className='flex items-center justify-between'>
            {t('settings.mcpSettings')}
            {detectedAgents.length > 0 ? (
              <Dropdown
                trigger='click'
                droplist={
                  <Menu>
                    <Menu.Item
                      key='json'
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportMode('json');
                        showAddMcpModal();
                      }}
                    >
                      {t('settings.mcpImportFromJSON')}
                    </Menu.Item>
                    <Menu.Item
                      key='oneclick'
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportMode('oneclick');
                        showAddMcpModal();
                      }}
                    >
                      {t('settings.mcpOneKeyImport')}
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button size='mini' type='outline' icon={<Plus size={'14'} />} shape='round' onClick={(e) => e.stopPropagation()}>
                  {t('settings.mcpAddServer')} <Down size={'12'} />
                </Button>
              </Dropdown>
            ) : (
              <Button
                size='mini'
                type='outline'
                icon={<Plus size={'14'} />}
                shape='round'
                onClick={(e) => {
                  e.stopPropagation();
                  setImportMode('json');
                  showAddMcpModal();
                }}
              >
                {t('settings.mcpAddServer')}
              </Button>
            )}
          </div>
        }
        name={'mcp-servers'}
      >
        <div>{mcpServers.length === 0 ? <div className='text-center py-8 text-gray-500'>{t('settings.mcpNoServersFound')}</div> : mcpServers.map((server) => <McpServerItem key={server.id} server={server} isCollapsed={mcpCollapseKey[server.id] || false} agentInstallStatus={agentInstallStatus} isLoadingAgentStatus={isLoadingAgentStatus} isTestingConnection={testingServers[server.id] || false} onToggleCollapse={() => toggleServerCollapse(server.id)} onTestConnection={handleTestMcpConnection} onEditServer={showEditMcpModal} onDeleteServer={showDeleteConfirm} onToggleServer={handleToggleMcpServer} />)}</div>
      </Collapse.Item>

      <AddMcpServerModal visible={showMcpModal} server={editingMcpServer} onCancel={hideMcpModal} onSubmit={editingMcpServer ? (serverData) => wrappedHandleEditMcpServer(editingMcpServer, serverData) : wrappedHandleAddMcpServer} onBatchImport={wrappedHandleBatchImportMcpServers} importMode={importMode} />

      <Modal title={t('settings.mcpDeleteServer')} visible={deleteConfirmVisible} onCancel={hideDeleteConfirm} onOk={handleConfirmDelete} okButtonProps={{ status: 'danger' }} okText={t('common.confirm')} cancelText={t('common.cancel')}>
        <p>{t('settings.mcpDeleteConfirm')}</p>
      </Modal>
    </div>
  );
};

export default McpManagement;
