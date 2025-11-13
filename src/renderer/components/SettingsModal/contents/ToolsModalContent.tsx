/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage, type IConfigStorageRefer, type IMcpServer } from '@/common/storage';
import { acpConversation } from '@/common/ipcBridge';
import { Divider, Form, Switch, Tooltip, Message, Button, Dropdown, Menu, Modal } from '@arco-design/web-react';
import { Help, Down, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useConfigModelListWithImage from '@/renderer/hooks/useConfigModelListWithImage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionSelect from '@/renderer/components/base/AionSelect';
import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import McpServerItem from '@/renderer/pages/settings/McpManagement/McpServerItem';
import { useMcpServers, useMcpAgentStatus, useMcpOperations, useMcpConnection, useMcpModal, useMcpServerCRUD, useMcpOAuth } from '@/renderer/hooks/mcp';

type MessageInstance = ReturnType<typeof Message.useMessage>[0];

const ModalMcpManagementSection: React.FC<{ message: MessageInstance }> = ({ message }) => {
  const { t } = useTranslation();
  const { mcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();

  const handleAuthRequired = useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(mcpServers, saveMcpServers, message, handleAuthRequired);
  const { showMcpModal, editingMcpServer, deleteConfirmVisible, serverToDelete, mcpCollapseKey, showAddMcpModal, showEditMcpModal, hideMcpModal, showDeleteConfirm, hideDeleteConfirm, toggleServerCollapse } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer, handleToggleMcpServer } = useMcpServerCRUD(mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus, message);

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
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (addedServer) {
        void handleTestMcpConnection(addedServer);
        if (addedServer.transport.type === 'http' || addedServer.transport.type === 'sse') {
          void checkOAuthStatus(addedServer);
        }
        if (serverData.enabled) {
          void syncMcpToAgents(addedServer, true);
        }
      }
    },
    [handleAddMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const wrappedHandleEditMcpServer = useCallback(
    async (editingMcpServer: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const updatedServer = await handleEditMcpServer(editingMcpServer, serverData);
      if (updatedServer) {
        void handleTestMcpConnection(updatedServer);
        if (updatedServer.transport.type === 'http' || updatedServer.transport.type === 'sse') {
          void checkOAuthStatus(updatedServer);
        }
        if (serverData.enabled) {
          void syncMcpToAgents(updatedServer, true);
        }
      }
    },
    [handleEditMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const wrappedHandleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const addedServers = await handleBatchImportMcpServers(serversData);
      if (addedServers && addedServers.length > 0) {
        addedServers.forEach((server) => {
          void handleTestMcpConnection(server);
          if (server.transport.type === 'http' || server.transport.type === 'sse') {
            void checkOAuthStatus(server);
          }
          if (server.enabled) {
            void syncMcpToAgents(server, true);
          }
        });
      }
    },
    [handleBatchImportMcpServers, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const [detectedAgents, setDetectedAgents] = useState<Array<{ backend: string; name: string }>>([]);
  const [importMode, setImportMode] = useState<'json' | 'oneclick'>('json');

  useEffect(() => {
    const loadAgents = async () => {
      try {
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

  useEffect(() => {
    const httpServers = mcpServers.filter((s) => s.transport.type === 'http' || s.transport.type === 'sse');
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
    if (detectedAgents.length > 0) {
      return (
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
            {t('settings.mcpAddServer')} <Down size='12' />
          </Button>
        </Dropdown>
      );
    }

    return (
      <Button
        size='mini'
        type='outline'
        icon={<Plus size={'14'} />}
        shape='round'
        onClick={() => {
          setImportMode('json');
          showAddMcpModal();
        }}
      >
        {t('settings.mcpAddServer')}
      </Button>
    );
  };

  return (
    <div className='space-y-16px'>
      <div className='flex flex-col gap-8px sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <span className='text-14px text-t-primary'>{t('settings.mcpSettings')}</span>
        </div>
        <div className='flex-shrink-0'>{renderAddButton()}</div>
      </div>

      <div>
        {mcpServers.length === 0 ? (
          <div className='py-24px text-center text-t-secondary text-14px border border-dashed border-border-2 rd-12px'>{t('settings.mcpNoServersFound')}</div>
        ) : (
          mcpServers.map((server) => <McpServerItem key={server.id} server={server} isCollapsed={mcpCollapseKey[server.id] || false} agentInstallStatus={agentInstallStatus} isServerLoading={isServerLoading} isTestingConnection={testingServers[server.id] || false} oauthStatus={oauthStatus[server.id]} isLoggingIn={loggingIn[server.id]} onToggleCollapse={() => toggleServerCollapse(server.id)} onTestConnection={handleTestMcpConnection} onEditServer={showEditMcpModal} onDeleteServer={showDeleteConfirm} onToggleServer={handleToggleMcpServer} onOAuthLogin={handleOAuthLogin} />)
        )}
      </div>

      <AddMcpServerModal visible={showMcpModal} server={editingMcpServer} onCancel={hideMcpModal} onSubmit={editingMcpServer ? (serverData) => wrappedHandleEditMcpServer(editingMcpServer, serverData) : wrappedHandleAddMcpServer} onBatchImport={wrappedHandleBatchImportMcpServers} importMode={importMode} />

      <Modal title={t('settings.mcpDeleteServer')} visible={deleteConfirmVisible} onCancel={hideDeleteConfirm} onOk={handleConfirmDelete} okButtonProps={{ status: 'danger' }} okText={t('common.confirm')} cancelText={t('common.cancel')}>
        <p>{t('settings.mcpDeleteConfirm')}</p>
      </Modal>
    </div>
  );
};

const ToolsModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [mcpMessage, mcpMessageContext] = Message.useMessage({ maxCount: 10 });
  const [imageGenerationModel, setImageGenerationModel] = useState<IConfigStorageRefer['tools.imageGenerationModel'] | undefined>();
  const { modelListWithImage: data } = useConfigModelListWithImage();

  const imageGenerationModelList = useMemo(() => {
    if (!data) return [];
    return (data || [])
      .filter((v) => {
        const filteredModels = v.model.filter((model) => {
          return model.toLowerCase().includes('image');
        });
        return filteredModels.length > 0;
      })
      .map((v) => ({
        ...v,
        model: v.model.filter((model) => {
          return model.toLowerCase().includes('image');
        }),
      }));
  }, [data]);

  useEffect(() => {
    ConfigStorage.get('tools.imageGenerationModel')
      .then((data) => {
        if (!data) return;
        setImageGenerationModel(data);
      })
      .catch((error) => {
        console.error('Failed to load image generation model config:', error);
      });
  }, []);

  // Sync imageGenerationModel apiKey when provider apiKey changes
  useEffect(() => {
    if (!imageGenerationModel || !data) return;

    const currentProvider = data.find((p) => p.id === imageGenerationModel.id);

    if (currentProvider && currentProvider.apiKey !== imageGenerationModel.apiKey) {
      const updatedModel = {
        ...imageGenerationModel,
        apiKey: currentProvider.apiKey,
      };

      setImageGenerationModel(updatedModel);
      ConfigStorage.set('tools.imageGenerationModel', updatedModel).catch((error) => {
        console.error('Failed to save image generation model config:', error);
      });
    } else if (!currentProvider) {
      setImageGenerationModel(undefined);
      ConfigStorage.remove('tools.imageGenerationModel').catch((error) => {
        console.error('Failed to remove image generation model config:', error);
      });
    }
  }, [data, imageGenerationModel?.id, imageGenerationModel?.apiKey]);

  const handleImageGenerationModelChange = (value: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
    setImageGenerationModel((prev) => {
      const newImageGenerationModel = { ...prev, ...value };
      ConfigStorage.set('tools.imageGenerationModel', newImageGenerationModel).catch((error) => {
        console.error('Failed to update image generation model config:', error);
      });
      return newImageGenerationModel;
    });
  };

  return (
    <div className='flex flex-col h-full w-full'>
      {mcpMessageContext}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px'>
        <div className='space-y-16px'>
          {/* MCP 工具配置 */}
          <div className='px-32px py-24px bg-2 rd-16px'>
            <ModalMcpManagementSection message={mcpMessage} />
          </div>
          {/* 图像生成 */}
          <div className='px-32px py-24px bg-2 rd-16px'>
            <div className='flex items-center justify-between mb-16px'>
              <span className='text-16px font-500 text-t-primary'>{t('settings.imageGeneration', { defaultValue: 'Image Generation' })}</span>
              <Switch disabled={!imageGenerationModelList.length || !imageGenerationModel?.useModel} checked={imageGenerationModel?.switch} onChange={(checked) => handleImageGenerationModelChange({ switch: checked })} />
            </div>

            <Divider className='mt-0px mb-20px' />

            <Form layout='horizontal' labelAlign='left' className='space-y-12px'>
              <Form.Item label={t('settings.imageGenerationModel')}>
                {imageGenerationModelList.length > 0 ? (
                  <AionSelect
                    value={imageGenerationModel?.useModel}
                    onChange={(value) => {
                      const [platformId, modelName] = value.split('|');
                      const platform = imageGenerationModelList.find((p) => p.id === platformId);
                      if (platform) {
                        handleImageGenerationModelChange({ ...platform, useModel: modelName });
                      }
                    }}
                  >
                    {imageGenerationModelList.map(({ model, ...platform }) => (
                      <AionSelect.OptGroup label={platform.name} key={platform.id}>
                        {model.map((modelName) => (
                          <AionSelect.Option key={platform.id + modelName} value={platform.id + '|' + modelName}>
                            {modelName}
                          </AionSelect.Option>
                        ))}
                      </AionSelect.OptGroup>
                    ))}
                  </AionSelect>
                ) : (
                  <div className='text-t-secondary flex items-center'>
                    {t('settings.noAvailable')}
                    <Tooltip
                      content={
                        <div>
                          {t('settings.needHelpTooltip')}
                          <a href='https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide' target='_blank' rel='noopener noreferrer' className='text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] underline ml-4px' onClick={(e) => e.stopPropagation()}>
                            {t('settings.configGuide')}
                          </a>
                        </div>
                      }
                    >
                      <a href='https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide' target='_blank' rel='noopener noreferrer' className='ml-8px text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] cursor-pointer' onClick={(e) => e.stopPropagation()}>
                        <Help theme='outline' size='14' />
                      </a>
                    </Tooltip>
                  </div>
                )}
              </Form.Item>
            </Form>
          </div>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default ToolsModalContent;
