/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { type IMcpServer, BUILTIN_IMAGE_GEN_ID, BUILTIN_IMAGE_GEN_NAME } from '@/common/config/storage';
import { Button, Dropdown, Menu, Message, Modal } from '@arco-design/web-react';
import { Down, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import McpServerItem from '@/renderer/pages/settings/ToolsSettings/McpServerItem';
import {
  useMcpServers,
  useMcpConnection,
  useMcpModal,
  useMcpServerCRUD,
  useMcpOAuth,
  useMountedMessage,
} from '@/renderer/hooks/mcp';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';

type MessageInstance = ReturnType<typeof Message.useMessage>[0];

const isBuiltinImageGenServer = (server: IMcpServer) =>
  server.builtin === true && (server.id === BUILTIN_IMAGE_GEN_ID || server.name === BUILTIN_IMAGE_GEN_NAME);
const ModalMcpManagementSection: React.FC<{
  message: MessageInstance;
  mcpServers: IMcpServer[];
  extensionMcpServers: IMcpServer[];
  setMcpServers: React.Dispatch<React.SetStateAction<IMcpServer[]>>;
  saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>;
  isPageMode?: boolean;
}> = ({ message, mcpServers, extensionMcpServers, setMcpServers, saveMcpServers, isPageMode }) => {
  const { t } = useTranslation();
  const { oauthStatus, loggingIn, checkOAuthStatus, markLoginRequired, clearLoginRequired, login } = useMcpOAuth();
  const visibleMcpServers = useMemo(
    () => mcpServers.filter((server) => !isBuiltinImageGenServer(server)),
    [mcpServers]
  );

  const handleAuthRequired = useCallback(
    (server: IMcpServer) => {
      markLoginRequired(server.id);
    },
    [markLoginRequired]
  );
  const handleAuthResolved = useCallback(
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

  const handleOAuthLogin = useCallback(
    async (server: IMcpServer) => {
      const result = await login(server);

      if (result.success) {
        message.success(`${server.name}: ${t('settings.mcpOAuthLoginSuccess') || 'Login successful'}`);
        void handleTestMcpConnection(server);
      } else {
        message.error(`${server.name}: ${result.error || t('settings.mcpOAuthLoginFailed') || 'Login failed'}`);
      }
    },
    [login, message, t, handleTestMcpConnection]
  );

  const wrappedHandleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (addedServer) {
        void handleTestMcpConnection(addedServer, { notify: false });
      }
    },
    [handleAddMcpServer, handleTestMcpConnection]
  );

  const wrappedHandleEditMcpServer = useCallback(
    async (serverToEdit: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => {
      const updatedServer = await handleEditMcpServer(serverToEdit, serverData);
      if (updatedServer) {
        void handleTestMcpConnection(updatedServer, { notify: false });
      }
    },
    [handleEditMcpServer, handleTestMcpConnection]
  );

  const wrappedHandleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]) => {
      const addedServers = await handleBatchImportMcpServers(serversData);
      if (addedServers && addedServers.length > 0) {
        await handleTestMcpConnections(addedServers, { concurrency: 4, notify: false });
      }
      return addedServers;
    },
    [handleBatchImportMcpServers, handleTestMcpConnections]
  );

  const [importMode, setImportMode] = useState<'json' | 'oneclick'>('json');

  useEffect(() => {
    const httpServers = mcpServers.filter(
      (s) => s.transport.type === 'http' || s.transport.type === 'sse' || s.transport.type === 'streamable_http'
    );
    if (httpServers.length > 0) {
      httpServers.forEach((server) => {
        void checkOAuthStatus(server);
      });
    }
  }, [mcpServers, checkOAuthStatus]);

  const handleConfirmDelete = useCallback(async () => {
    if (!serverToDelete) return;
    hideDeleteConfirm();
    await handleDeleteMcpServer(serverToDelete);
  }, [serverToDelete, hideDeleteConfirm, handleDeleteMcpServer]);

  const renderAddButton = () => {
    return (
      <Dropdown
        trigger='click'
        droplist={
          <Menu>
            <Menu.Item
              key='json'
              onClick={(event) => {
                event.stopPropagation();
                setImportMode('json');
                showAddMcpModal();
              }}
            >
              {t('settings.mcpImportFromJSON')}
            </Menu.Item>
            <Menu.Item
              key='oneclick'
              onClick={(event) => {
                event.stopPropagation();
                setImportMode('oneclick');
                showAddMcpModal();
              }}
            >
              {t('settings.mcpOneKeyImport')}
            </Menu.Item>
          </Menu>
        }
      >
        <Button type='primary' size='small' icon={<Plus size='14' />} className='!h-32px !rounded-8px !px-14px'>
          {t('settings.mcpAddServer')} <Down size='12' />
        </Button>
      </Dropdown>
    );
  };

  return (
    <div className='flex flex-col gap-16px min-h-0'>
      <div className='flex gap-8px items-center justify-between'>
        <div className='text-14px text-t-primary'>{t('settings.mcpSettings')}</div>
        <div>{renderAddButton()}</div>
      </div>

      <div className='flex-1 min-h-0'>
        {visibleMcpServers.length === 0 && extensionMcpServers.length === 0 ? (
          <div className='py-24px text-center text-t-secondary text-14px border border-dashed border-border-2 rd-12px'>
            {t('settings.mcpNoServersFound')}
          </div>
        ) : (
          <AionScrollArea
            className={classNames('max-h-360px', isPageMode && 'max-h-none')}
            disableOverflow={isPageMode}
          >
            <div className='space-y-12px'>
              {visibleMcpServers.map((server) => (
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
              ))}
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
          </AionScrollArea>
        )}
      </div>

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

const ToolsModalContent: React.FC = () => {
  const [rawMcpMessage, mcpMessageContext] = Message.useMessage({ maxCount: 10 });
  // ELECTRON-1A1: guard message calls so async MCP callbacks that resolve after this
  // component unmounts don't hit a null Arco context holder (null.addInstance crash).
  const mcpMessage = useMountedMessage(rawMcpMessage);
  const { mcpServers, extensionMcpServers, saveMcpServers, setMcpServers } = useMcpServers();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      {mcpMessageContext}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* MCP 工具配置 */}
          <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px flex flex-col min-h-0 border border-border-2'>
            <div className='flex-1 min-h-0'>
              <AionScrollArea
                className={classNames('h-full', isPageMode && 'overflow-visible')}
                disableOverflow={isPageMode}
              >
                <ModalMcpManagementSection
                  message={mcpMessage}
                  mcpServers={mcpServers}
                  extensionMcpServers={extensionMcpServers}
                  setMcpServers={setMcpServers}
                  saveMcpServers={saveMcpServers}
                  isPageMode={isPageMode}
                />
              </AionScrollArea>
            </div>
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default ToolsModalContent;
