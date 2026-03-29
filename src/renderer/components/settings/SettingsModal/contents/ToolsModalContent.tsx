/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ConfigStorage,
  type IConfigStorageRefer,
  type IMcpServer,
  BUILTIN_IMAGE_GEN_ID,
} from '@/common/config/storage';
import type { SpeechToTextConfig, SpeechToTextProvider } from '@/common/types/speech';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { Divider, Form, Tooltip, Message, Button, Dropdown, Menu, Modal, Switch, Input } from '@arco-design/web-react';
import { Help, Down, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useConfigModelListWithImage from '@/renderer/hooks/agent/useConfigModelListWithImage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionSelect from '@/renderer/components/base/AionSelect';
import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import McpAgentStatusDisplay from '@/renderer/pages/settings/ToolsSettings/McpAgentStatusDisplay';
import McpServerItem from '@/renderer/pages/settings/ToolsSettings/McpServerItem';
import {
  useMcpServers,
  useMcpAgentStatus,
  useMcpOperations,
  useMcpConnection,
  useMcpModal,
  useMcpServerCRUD,
  useMcpOAuth,
} from '@/renderer/hooks/mcp';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';

type MessageInstance = ReturnType<typeof Message.useMessage>[0];

const isBuiltinImageGenServer = (server: IMcpServer) => server.builtin === true && server.id === BUILTIN_IMAGE_GEN_ID;
const SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT = 'aionui:speech-to-text-config-changed';
const DEFAULT_SPEECH_TO_TEXT_CONFIG: SpeechToTextConfig = {
  enabled: false,
  provider: 'openai',
  openai: {
    apiKey: '',
    baseUrl: '',
    language: '',
    model: 'whisper-1',
  },
  deepgram: {
    apiKey: '',
    baseUrl: '',
    detectLanguage: true,
    language: '',
    model: 'nova-2',
    punctuate: true,
    smartFormat: true,
  },
};

const normalizeSpeechToTextConfig = (config?: SpeechToTextConfig): SpeechToTextConfig => ({
  ...DEFAULT_SPEECH_TO_TEXT_CONFIG,
  ...config,
  openai: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai,
    ...config?.openai,
  },
  deepgram: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.deepgram,
    ...config?.deepgram,
  },
});

const SpeechToTextSettingsSection: React.FC<{
  config: SpeechToTextConfig;
  onChange: (updater: (current: SpeechToTextConfig) => SpeechToTextConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const renderSpeechToTextFieldLabel = useCallback(
    (labelKey: string, requirement: 'required' | 'optional') => (
      <span className='inline-flex items-center gap-6px'>
        <span>{t(labelKey)}</span>
        <span aria-hidden='true' className='text-12px text-t-tertiary'>
          ({t(requirement === 'required' ? 'settings.speechToTextRequired' : 'settings.speechToTextOptional')})
        </span>
      </span>
    ),
    [t]
  );

  const handleProviderChange = useCallback(
    (value: string) => {
      onChange((current) => ({
        ...current,
        provider: value as SpeechToTextProvider,
      }));
    },
    [onChange]
  );

  const handleOpenAIChange = useCallback(
    (field: keyof NonNullable<SpeechToTextConfig['openai']>, value: string) => {
      onChange((current) => ({
        ...current,
        openai: {
          ...current.openai,
          [field]: value,
        },
      }));
    },
    [onChange]
  );

  const handleDeepgramChange = useCallback(
    (field: keyof NonNullable<SpeechToTextConfig['deepgram']>, value: string | boolean) => {
      onChange((current) => ({
        ...current,
        deepgram: {
          ...current.deepgram,
          [field]: value,
        },
      }));
    },
    [onChange]
  );

  return (
    <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
      <div className='flex items-center justify-between gap-12px mb-8px'>
        <div className='flex flex-col gap-4px'>
          <span className='text-14px text-t-primary'>{t('settings.speechToText')}</span>
          <span className='text-13px text-t-secondary'>{t('settings.speechToTextDescription')}</span>
        </div>
        <Switch
          checked={config.enabled}
          onChange={(checked) => {
            onChange((current) => ({
              ...current,
              enabled: checked,
            }));
          }}
        />
      </div>

      <Divider className='mt-0px mb-20px' />

      <Form layout='horizontal' labelAlign='left' className='space-y-12px'>
        <Form.Item label={t('settings.speechToTextProvider')}>
          <AionSelect value={config.provider} onChange={handleProviderChange}>
            <AionSelect.Option value='openai'>{t('settings.speechToTextProviderOpenAI')}</AionSelect.Option>
            <AionSelect.Option value='deepgram'>{t('settings.speechToTextProviderDeepgram')}</AionSelect.Option>
          </AionSelect>
        </Form.Item>

        {config.provider === 'openai' ? (
          <>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextApiKey', 'required')}>
              <Input.Password
                value={config.openai?.apiKey}
                visibilityToggle
                onChange={(value) => handleOpenAIChange('apiKey', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextBaseUrl', 'optional')}>
              <Input value={config.openai?.baseUrl} onChange={(value) => handleOpenAIChange('baseUrl', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextModel', 'optional')}>
              <Input value={config.openai?.model} onChange={(value) => handleOpenAIChange('model', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextLanguage', 'optional')}>
              <Input value={config.openai?.language} onChange={(value) => handleOpenAIChange('language', value)} />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextApiKey', 'required')}>
              <Input.Password
                value={config.deepgram?.apiKey}
                visibilityToggle
                onChange={(value) => handleDeepgramChange('apiKey', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextBaseUrl', 'optional')}>
              <Input value={config.deepgram?.baseUrl} onChange={(value) => handleDeepgramChange('baseUrl', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextModel', 'optional')}>
              <Input value={config.deepgram?.model} onChange={(value) => handleDeepgramChange('model', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextLanguage', 'optional')}>
              <Input value={config.deepgram?.language} onChange={(value) => handleDeepgramChange('language', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextDetectLanguage', 'optional')}>
              <Switch
                checked={config.deepgram?.detectLanguage !== false}
                onChange={(checked) => handleDeepgramChange('detectLanguage', checked)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextPunctuate', 'optional')}>
              <Switch
                checked={config.deepgram?.punctuate !== false}
                onChange={(checked) => handleDeepgramChange('punctuate', checked)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextSmartFormat', 'optional')}>
              <Switch
                checked={config.deepgram?.smartFormat !== false}
                onChange={(checked) => handleDeepgramChange('smartFormat', checked)}
              />
            </Form.Item>
          </>
        )}
      </Form>
    </div>
  );
};

const ModalMcpManagementSection: React.FC<{
  message: MessageInstance;
  mcpServers: IMcpServer[];
  extensionMcpServers: IMcpServer[];
  saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>;
  isPageMode?: boolean;
}> = ({ message, mcpServers, extensionMcpServers, saveMcpServers, isPageMode }) => {
  const { t } = useTranslation();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } =
    useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();
  const visibleMcpServers = useMemo(
    () => mcpServers.filter((server) => !isBuiltinImageGenServer(server)),
    [mcpServers]
  );

  const handleAuthRequired = useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(
    mcpServers,
    saveMcpServers,
    message,
    handleAuthRequired
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
  const {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
  } = useMcpServerCRUD(
    mcpServers,
    saveMcpServers,
    syncMcpToAgents,
    removeMcpFromAgents,
    checkSingleServerInstallStatus,
    setAgentInstallStatus
  );

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
    async (serverToEdit: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const updatedServer = await handleEditMcpServer(serverToEdit, serverData);
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
          setDetectedAgents(
            response.data.map((agent) => ({
              backend: agent.backend,
              name: agent.name,
            }))
          );
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
          <Button type='outline' icon={<Plus size={'16'} />} shape='round' onClick={(e) => e.stopPropagation()}>
            {t('settings.mcpAddServer')} <Down size='12' />
          </Button>
        </Dropdown>
      );
    }

    return (
      <Button
        type='outline'
        icon={<Plus size={'16'} />}
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
                  agentInstallStatus={agentInstallStatus}
                  isServerLoading={isServerLoading}
                  isTestingConnection={testingServers[server.id] || false}
                  oauthStatus={oauthStatus[server.id]}
                  isLoggingIn={loggingIn[server.id]}
                  onToggleCollapse={() => toggleServerCollapse(server.id)}
                  onTestConnection={handleTestMcpConnection}
                  onEditServer={showEditMcpModal}
                  onDeleteServer={showDeleteConfirm}
                  onToggleServer={handleToggleMcpServer}
                  onOAuthLogin={handleOAuthLogin}
                />
              ))}
              {extensionMcpServers.map((server) => (
                <McpServerItem
                  key={server.id}
                  server={server}
                  isCollapsed={mcpCollapseKey[server.id] || false}
                  agentInstallStatus={agentInstallStatus}
                  isServerLoading={isServerLoading}
                  isTestingConnection={false}
                  onToggleCollapse={() => toggleServerCollapse(server.id)}
                  onTestConnection={handleTestMcpConnection}
                  onEditServer={() => {}}
                  onDeleteServer={() => {}}
                  onToggleServer={() => Promise.resolve()}
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
  const { t } = useTranslation();
  const [mcpMessage, mcpMessageContext] = Message.useMessage({ maxCount: 10 });
  const [imageGenerationModel, setImageGenerationModel] = useState<
    IConfigStorageRefer['tools.imageGenerationModel'] | undefined
  >();
  const [speechToTextConfig, setSpeechToTextConfig] = useState<SpeechToTextConfig>(DEFAULT_SPEECH_TO_TEXT_CONFIG);
  const [isUpdatingImageGeneration, setIsUpdatingImageGeneration] = useState(false);
  const { modelListWithImage: data } = useConfigModelListWithImage();
  const { mcpServers, extensionMcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } =
    useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, mcpMessage);
  const builtinImageGenServer = useMemo(() => mcpServers.find(isBuiltinImageGenServer), [mcpServers]);
  const skipNextImageGenerationAutoCheckRef = useRef(false);
  const imageGenerationInstalledAgents = builtinImageGenServer?.name
    ? (agentInstallStatus[builtinImageGenServer.name] ?? [])
    : [];

  const imageGenerationModelList = useMemo(() => {
    if (!data) return [];
    // Filter models that support image generation
    const isImageModel = (modelName: string) => {
      const name = modelName.toLowerCase();
      return name.includes('image') || name.includes('banana') || name.includes('imagine');
    };
    return (data || [])
      .filter((v) => {
        const filteredModels = v.model.filter(isImageModel);
        return filteredModels.length > 0;
      })
      .map((v) => {
        const filteredModels = v.model.filter(isImageModel);
        return Object.assign({}, v, { model: filteredModels });
      });
  }, [data]);

  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const storedModel = await ConfigStorage.get('tools.imageGenerationModel');
        const storedSpeechToTextConfig = await ConfigStorage.get('tools.speechToText');
        if (storedModel) {
          setImageGenerationModel(storedModel);
        }
        setSpeechToTextConfig(normalizeSpeechToTextConfig(storedSpeechToTextConfig));
      } catch (error) {
        console.error('Failed to load tools config:', error);
      }
    };

    void loadConfigs();
  }, []);

  const updateSpeechToTextConfig = useCallback((updater: (current: SpeechToTextConfig) => SpeechToTextConfig) => {
    setSpeechToTextConfig((current) => {
      const next = normalizeSpeechToTextConfig(updater(current));
      ConfigStorage.set('tools.speechToText', next).catch((error) => {
        console.error('Failed to save speech-to-text config:', error);
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!builtinImageGenServer?.name || !builtinImageGenServer.enabled) return;
    if (skipNextImageGenerationAutoCheckRef.current) {
      skipNextImageGenerationAutoCheckRef.current = false;
      return;
    }
    void checkSingleServerInstallStatus(builtinImageGenServer.name);
  }, [builtinImageGenServer?.enabled, builtinImageGenServer?.name, checkSingleServerInstallStatus]);

  const clearImageGenerationAgentStatus = useCallback(
    (serverName: string) => {
      const updated = { ...agentInstallStatus };
      delete updated[serverName];
      setAgentInstallStatus(updated);
      void ConfigStorage.set('mcp.agentInstallStatus', updated).catch((error) => {
        console.error('Failed to clear image generation agent install status:', error);
      });
    },
    [setAgentInstallStatus, agentInstallStatus]
  );

  // Sync image generation model config to the built-in MCP server's transport.env
  const syncMcpServerEnv = useCallback(
    async (model: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
      const builtinServer = mcpServers.find(isBuiltinImageGenServer);
      if (!builtinServer || builtinServer.transport.type !== 'stdio') return;

      const env: Record<string, string> = { ...builtinServer.transport.env };
      if (model.platform) {
        env.AIONUI_IMG_PLATFORM = model.platform;
      } else {
        delete env.AIONUI_IMG_PLATFORM;
      }
      if (model.baseUrl) {
        env.AIONUI_IMG_BASE_URL = model.baseUrl;
      } else {
        delete env.AIONUI_IMG_BASE_URL;
      }
      if (model.apiKey) {
        env.AIONUI_IMG_API_KEY = model.apiKey;
      } else {
        delete env.AIONUI_IMG_API_KEY;
      }
      if (model.useModel) {
        env.AIONUI_IMG_MODEL = model.useModel;
      } else {
        delete env.AIONUI_IMG_MODEL;
      }

      const updatedServer: IMcpServer = {
        ...builtinServer,
        transport: { ...builtinServer.transport, env },
        updatedAt: Date.now(),
      };

      const updatedServers = mcpServers.map((s) => (s.id === BUILTIN_IMAGE_GEN_ID ? updatedServer : s));
      await saveMcpServers(updatedServers);
      if (updatedServer.enabled) {
        await syncMcpToAgents(updatedServer, true);
      }
    },
    [mcpServers, saveMcpServers, syncMcpToAgents]
  );

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
      void syncMcpServerEnv(updatedModel);
    } else if (!currentProvider) {
      setImageGenerationModel(undefined);
      ConfigStorage.remove('tools.imageGenerationModel').catch((error) => {
        console.error('Failed to remove image generation model config:', error);
      });
      void syncMcpServerEnv({});
    }
  }, [data, imageGenerationModel?.id, imageGenerationModel?.apiKey, syncMcpServerEnv]);

  const handleImageGenerationModelChange = useCallback(
    (value: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
      setImageGenerationModel((prev) => {
        const newImageGenerationModel = { ...prev, ...value };
        ConfigStorage.set('tools.imageGenerationModel', newImageGenerationModel).catch((error) => {
          console.error('Failed to update image generation model config:', error);
        });
        // Sync env vars to the built-in MCP server
        void syncMcpServerEnv(newImageGenerationModel);
        return newImageGenerationModel;
      });
    },
    [syncMcpServerEnv]
  );

  const handleImageGenerationToggle = useCallback(
    async (checked: boolean) => {
      if (!builtinImageGenServer) return;

      const updatedServer: IMcpServer = {
        ...builtinImageGenServer,
        enabled: checked,
        updatedAt: Date.now(),
      };

      setIsUpdatingImageGeneration(true);
      skipNextImageGenerationAutoCheckRef.current = checked;
      try {
        await saveMcpServers((prevServers) =>
          prevServers.map((server) => (isBuiltinImageGenServer(server) ? updatedServer : server))
        );

        setImageGenerationModel((prev) => {
          if (!prev) return prev;
          const next = { ...prev, switch: checked };
          ConfigStorage.set('tools.imageGenerationModel', next).catch((error) => {
            console.error('Failed to sync image generation switch state:', error);
          });
          return next;
        });

        if (checked) {
          clearImageGenerationAgentStatus(updatedServer.name);
          await syncMcpToAgents(updatedServer, true);
          await checkSingleServerInstallStatus(updatedServer.name);
        } else {
          await removeMcpFromAgents(updatedServer.name, undefined, updatedServer.transport.type);
          clearImageGenerationAgentStatus(updatedServer.name);
        }
      } catch (error) {
        skipNextImageGenerationAutoCheckRef.current = false;
        console.error('Failed to toggle image generation MCP server:', error);
      } finally {
        if (!checked) {
          skipNextImageGenerationAutoCheckRef.current = false;
        }
        setIsUpdatingImageGeneration(false);
      }
    },
    [
      builtinImageGenServer,
      checkSingleServerInstallStatus,
      clearImageGenerationAgentStatus,
      removeMcpFromAgents,
      saveMcpServers,
      syncMcpToAgents,
    ]
  );

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
                  saveMcpServers={saveMcpServers}
                  isPageMode={isPageMode}
                />
              </AionScrollArea>
            </div>
          </div>
          {/* 图像生成 */}
          <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
            <div className='flex items-center justify-between mb-16px'>
              <span className='text-14px text-t-primary'>{t('settings.imageGeneration')}</span>
              <div className='flex items-center gap-8px'>
                {builtinImageGenServer?.enabled && builtinImageGenServer.name && (
                  <McpAgentStatusDisplay
                    serverName={builtinImageGenServer.name}
                    agentInstallStatus={agentInstallStatus}
                    isLoadingAgentStatus={
                      isServerLoading(builtinImageGenServer.name) && imageGenerationInstalledAgents.length === 0
                    }
                    alwaysVisible
                  />
                )}
                <Switch
                  disabled={
                    isUpdatingImageGeneration ||
                    !builtinImageGenServer ||
                    !imageGenerationModelList.length ||
                    !imageGenerationModel?.useModel
                  }
                  checked={Boolean(builtinImageGenServer?.enabled)}
                  onChange={handleImageGenerationToggle}
                />
              </div>
            </div>

            <Divider className='mt-0px mb-20px' />

            <Form layout='horizontal' labelAlign='left' className='space-y-12px'>
              <Form.Item label={t('settings.imageGenerationModel')}>
                {imageGenerationModelList.length > 0 ? (
                  <AionSelect
                    value={
                      imageGenerationModel?.id && imageGenerationModel?.useModel
                        ? `${imageGenerationModel.id}|${imageGenerationModel.useModel}`
                        : undefined
                    }
                    onChange={(value) => {
                      const [platformId, modelName] = value.split('|');
                      const platform = imageGenerationModelList.find((p) => p.id === platformId);
                      if (platform) {
                        handleImageGenerationModelChange({
                          ...platform,
                          useModel: modelName,
                        });
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
                          <a
                            href='https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] underline ml-4px'
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t('settings.configGuide')}
                          </a>
                        </div>
                      }
                    >
                      <a
                        href='https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='ml-8px text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] cursor-pointer'
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Help theme='outline' size='14' />
                      </a>
                    </Tooltip>
                  </div>
                )}
              </Form.Item>
            </Form>
          </div>
          <SpeechToTextSettingsSection config={speechToTextConfig} onChange={updateSpeechToTextConfig} />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default ToolsModalContent;
