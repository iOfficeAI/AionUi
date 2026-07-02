import { Button, Collapse, Dropdown, Menu, Modal } from '@arco-design/web-react';
import { Down, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { BUILTIN_IMAGE_GEN_ID, BUILTIN_IMAGE_GEN_NAME, type IMcpServer } from '@/common/config/storage';
import { useMcpConnection, useMcpModal, useMcpOAuth, useMcpServerCRUD, useMcpServers } from '@/renderer/hooks/mcp';
import AddMcpServerModal from '../components/AddMcpServerModal';
import McpServerItem from './McpServerItem';

interface McpManagementProps {
  message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0];
}

const isVisibleMcpServer = (server: IMcpServer) =>
  !(server.builtin === true && (server.id === BUILTIN_IMAGE_GEN_ID || server.name === BUILTIN_IMAGE_GEN_NAME));

const isOAuthCapableServer = (server: IMcpServer) =>
  server.transport.type === 'http' || server.transport.type === 'sse' || server.transport.type === 'streamable_http';

const McpManagement: React.FC<McpManagementProps> = ({ message }) => {
  const { t } = useTranslation();
  const { mcpServers, extensionMcpServers, saveMcpServers, setMcpServers } = useMcpServers();
  const visibleMcpServers = React.useMemo(() => mcpServers.filter(isVisibleMcpServer), [mcpServers]);
  const { oauthStatus, loggingIn, checkOAuthStatus, markLoginRequired, clearLoginRequired, login } = useMcpOAuth();
  const handleAuthRequired = React.useCallback(
    (server: IMcpServer) => {
      markLoginRequired(server.id);
    },
    [markLoginRequired]
  );
  const handleAuthResolved = React.useCallback(
    (server: IMcpServer) => {
      clearLoginRequired(server.id);
    },
    [clearLoginRequired]
  );
  const { testingServers, handleTestMcpConnection, handleTestMcpConnections } = useMcpConnection(
    setMcpServers,
    message,
    handleAuthRequired,
    handleAuthResolved
  );
  const {
    showMcpModal,
    editingMcpServer,
    deleteConfirmVisible,
    serverToDelete,
    mcpCollapseKey,
    showAddMcpModal,
    showEditMcpModal,
    hideMcpModal,
    showDeleteConfirm,
    hideDeleteConfirm,
    toggleServerCollapse,
  } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer } =
    useMcpServerCRUD(saveMcpServers);

  const handleOAuthLogin = React.useCallback(
    async (server: IMcpServer) => {
      const result = await login(server);
      if (result.success) {
        message.success(`${server.name}: ${t('settings.mcpOAuthLoginSuccess') || 'Login successful'}`);
        void handleTestMcpConnection(server);
        return;
      }

      message.error(`${server.name}: ${result.error || t('settings.mcpOAuthLoginFailed') || 'Login failed'}`);
    },
    [handleTestMcpConnection, login, message, t]
  );

  const wrappedHandleAddMcpServer = React.useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (!addedServer) {
        return;
      }

      void handleTestMcpConnection(addedServer, { notify: false });
    },
    [handleAddMcpServer, handleTestMcpConnection]
  );

  const wrappedHandleEditMcpServer = React.useCallback(
    async (serverToEdit: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => {
      const updatedServer = await handleEditMcpServer(serverToEdit, serverData);
      if (!updatedServer) {
        return;
      }

      void handleTestMcpConnection(updatedServer, { notify: false });
    },
    [handleEditMcpServer, handleTestMcpConnection]
  );

  const wrappedHandleBatchImportMcpServers = React.useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]) => {
      const importedServers = await handleBatchImportMcpServers(serversData);
      if (importedServers.length === 0) {
        return importedServers;
      }

      await handleTestMcpConnections(importedServers, { concurrency: 4, notify: false });
      return importedServers;
    },
    [handleBatchImportMcpServers, handleTestMcpConnections]
  );

  const [importMode, setImportMode] = React.useState<'json' | 'oneclick'>('json');

  React.useEffect(() => {
    mcpServers.filter(isOAuthCapableServer).forEach((server) => {
      void checkOAuthStatus(server);
    });
  }, [checkOAuthStatus, mcpServers]);

  const handleConfirmDelete = React.useCallback(async () => {
    if (!serverToDelete) {
      return;
    }

    hideDeleteConfirm();
    await handleDeleteMcpServer(serverToDelete);
  }, [handleDeleteMcpServer, hideDeleteConfirm, serverToDelete]);

  return (
    <div>
      <Collapse.Item
        className={' [&_div.arco-collapse-item-header-title]:flex-1'}
        header={
          <div className='flex items-center justify-between'>
            {t('settings.mcpSettings')}
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
              <Button type='outline' icon={<Plus size='14' />} shape='round' onClick={(e) => e.stopPropagation()}>
                {t('settings.mcpAddServer')} <Down size='12' />
              </Button>
            </Dropdown>
          </div>
        }
        name='mcp-servers'
      >
        <div>
          {visibleMcpServers.length === 0 && extensionMcpServers.length === 0 ? (
            <div className='py-8 text-center text-t-secondary'>{t('settings.mcpNoServersFound')}</div>
          ) : (
            visibleMcpServers.map((server) => (
              <McpServerItem
                key={server.id}
                server={server}
                isCollapsed={mcpCollapseKey[server.id] || false}
                isTestingConnection={testingServers[server.id] || false}
                oauthStatus={oauthStatus[server.id]}
                isLoggingIn={loggingIn[server.id]}
                onToggleCollapse={() => toggleServerCollapse(server.id)}
                onTestConnection={handleTestMcpConnection}
                onEditServer={showEditMcpModal}
                onDeleteServer={showDeleteConfirm}
                onOAuthLogin={handleOAuthLogin}
              />
            ))
          )}
          {extensionMcpServers.map((server) => (
            <McpServerItem
              key={server.id}
              server={server}
              isCollapsed={mcpCollapseKey[server.id] || false}
              isTestingConnection={false}
              onToggleCollapse={() => toggleServerCollapse(server.id)}
              onTestConnection={handleTestMcpConnection}
              onEditServer={() => {}}
              onDeleteServer={() => {}}
              isReadOnly
            />
          ))}
        </div>
      </Collapse.Item>

      <AddMcpServerModal
        visible={showMcpModal}
        server={editingMcpServer}
        existingServerNames={mcpServers.map((server) => server.name)}
        onCancel={hideMcpModal}
        onSubmit={
          editingMcpServer
            ? (serverData) => wrappedHandleEditMcpServer(editingMcpServer, serverData)
            : wrappedHandleAddMcpServer
        }
        onBatchImport={wrappedHandleBatchImportMcpServers}
        importMode={importMode}
      />

      <Modal
        title={t('settings.mcpDeleteServer')}
        visible={deleteConfirmVisible}
        onCancel={hideDeleteConfirm}
        onOk={handleConfirmDelete}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <p>{t('settings.mcpDeleteConfirm')}</p>
      </Modal>
    </div>
  );
};

export default McpManagement;
