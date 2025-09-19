import type { IMcpServer, IMcpServerTransport } from '@/common/storage';
import { acpConversation, mcpService } from '@/common/ipcBridge';
import { Button, Modal, Select } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';

interface AddMcpServerModalProps {
  visible: boolean;
  server?: IMcpServer;
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onBatchImport?: (servers: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
}

const AddMcpServerModal: React.FC<AddMcpServerModalProps> = ({ visible, server, onCancel, onSubmit, onBatchImport }) => {
  const { t } = useTranslation();
  const [jsonInput, setJsonInput] = useState('');
  const [isImportMode, setIsImportMode] = useState(false);
  const [detectedAgents, setDetectedAgents] = useState<Array<{ backend: string; name: string }>>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [importableServers, setImportableServers] = useState<IMcpServer[]>([]);
  const [loadingImport, setLoadingImport] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (visible && !server) {
      // 初始化时检测可用的agents
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
      loadAgents();
    }
  }, [visible, server]);

  // 当编辑现有服务器时，预填充JSON数据
  useEffect(() => {
    if (visible && server) {
      // 优先使用存储的originalJson，如果没有则生成JSON配置
      if (server.originalJson) {
        setJsonInput(server.originalJson);
      } else {
        // 兼容没有originalJson的旧数据，生成JSON配置
        const serverConfig = {
          mcpServers: {
            [server.name]: {
              description: server.description,
              ...(server.transport.type === 'stdio'
                ? {
                    command: server.transport.command,
                    args: server.transport.args || [],
                    env: server.transport.env || {},
                  }
                : {
                    type: server.transport.type,
                    url: server.transport.url,
                    ...(server.transport.headers && { headers: server.transport.headers }),
                  }),
            },
          },
        };
        setJsonInput(JSON.stringify(serverConfig, null, 2));
      }
      setIsImportMode(false); // 编辑模式下使用JSON模式
    } else if (visible && !server) {
      // 新建模式下清空JSON输入
      setJsonInput('');
    }
  }, [visible, server]);

  const handleImportFromCLI = async () => {
    if (!selectedAgent) return;

    setLoadingImport(true);
    try {
      // 获取所有可用的agents
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (!agentsResponse.success || !agentsResponse.data) {
        throw new Error('Failed to get available agents');
      }

      // 通过IPC调用后端服务获取MCP配置
      const mcpResponse = await mcpService.getAgentMcpConfigs.invoke(agentsResponse.data);
      if (mcpResponse.success && mcpResponse.data) {
        const allServers: IMcpServer[] = [];

        // 过滤选中的agent的服务器
        mcpResponse.data.forEach((agentConfig) => {
          if (agentConfig.source === selectedAgent) {
            allServers.push(...agentConfig.servers);
          }
        });

        setImportableServers(allServers);
      } else {
        throw new Error(mcpResponse.msg || 'Failed to get MCP configs');
      }
    } catch (error) {
      console.error('Failed to import from CLI:', error);
      setImportableServers([]);
    } finally {
      setLoadingImport(false);
    }
  };

  const handleBatchImport = () => {
    if (onBatchImport && importableServers.length > 0) {
      const serversToImport = importableServers.map((server) => {
        // 为CLI导入的服务器生成标准的JSON格式
        const serverConfig: any = {
          description: server.description,
        };

        if (server.transport.type === 'stdio') {
          serverConfig.command = server.transport.command;
          if (server.transport.args?.length) {
            serverConfig.args = server.transport.args;
          }
          if (server.transport.env && Object.keys(server.transport.env).length) {
            serverConfig.env = server.transport.env;
          }
        } else {
          serverConfig.type = server.transport.type;
          serverConfig.url = server.transport.url;
          if (server.transport.headers && Object.keys(server.transport.headers).length) {
            serverConfig.headers = server.transport.headers;
          }
        }

        return {
          name: server.name,
          description: server.description,
          enabled: server.enabled,
          transport: server.transport,
          status: server.status as IMcpServer['status'],
          originalJson: JSON.stringify({ mcpServers: { [server.name]: serverConfig } }, null, 2),
        };
      });
      onBatchImport(serversToImport);
      onCancel();
    }
  };

  const handleSubmit = () => {
    try {
      const config = JSON.parse(jsonInput);
      const mcpServers = config.mcpServers || config;

      if (Array.isArray(mcpServers)) {
        // TODO: 支持数组格式的导入
        console.warn('Array format not supported yet');
        return;
      }

      const serverKeys = Object.keys(mcpServers);
      if (serverKeys.length === 0) {
        throw new Error('No MCP server found in configuration');
      }

      // 如果有多个服务器，使用批量导入
      if (serverKeys.length > 1 && onBatchImport) {
        const serversToImport = serverKeys.map((serverKey) => {
          const serverConfig = mcpServers[serverKey];
          const transport: IMcpServerTransport = serverConfig.command
            ? {
                type: 'stdio',
                command: serverConfig.command,
                args: serverConfig.args || [],
                env: serverConfig.env || {},
              }
            : serverConfig.type === 'sse' || serverConfig.url?.includes('/sse')
              ? {
                  type: 'sse',
                  url: serverConfig.url,
                  headers: serverConfig.headers,
                }
              : serverConfig.type === 'streamable_http'
                ? {
                    type: 'streamable_http',
                    url: serverConfig.url,
                    headers: serverConfig.headers,
                  }
                : {
                    type: 'http',
                    url: serverConfig.url,
                    headers: serverConfig.headers,
                  };

          return {
            name: serverKey,
            description: serverConfig.description || `Imported from JSON`,
            enabled: true,
            transport,
            status: 'disconnected' as const,
            originalJson: JSON.stringify({ mcpServers: { [serverKey]: serverConfig } }, null, 2),
          };
        });

        onBatchImport(serversToImport);
        return;
      }

      // 单个服务器导入
      const firstServerKey = serverKeys[0];
      const serverConfig = mcpServers[firstServerKey];
      const transport: IMcpServerTransport = serverConfig.command
        ? {
            type: 'stdio',
            command: serverConfig.command,
            args: serverConfig.args || [],
            env: serverConfig.env || {},
          }
        : serverConfig.type === 'sse' || serverConfig.url?.includes('/sse')
          ? {
              type: 'sse',
              url: serverConfig.url,
              headers: serverConfig.headers,
            }
          : serverConfig.type === 'streamable_http'
            ? {
                type: 'streamable_http',
                url: serverConfig.url,
                headers: serverConfig.headers,
              }
            : {
                type: 'http',
                url: serverConfig.url,
                headers: serverConfig.headers,
              };

      onSubmit({
        name: firstServerKey,
        description: serverConfig.description || 'Imported from JSON',
        enabled: true,
        transport,
        status: 'disconnected',
        originalJson: jsonInput,
      });
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      // TODO: 显示错误提示
      return;
    }
  };

  if (!visible) return null;

  return (
    <Modal
      title={server ? t('settings.mcpEditServer') : t('settings.mcpAddServer')}
      visible={visible}
      onCancel={onCancel}
      footer={[
        <Button key='cancel' onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key='submit' type='primary' onClick={handleSubmit}>
          {t('common.save')}
        </Button>,
      ]}
      style={{ width: 600 }}
    >
      <div className='mb-4 space-y-2'>
        <div className='flex gap-2'>
          <Button
            type={!isImportMode ? 'primary' : 'outline'}
            size='small'
            onClick={() => {
              setIsImportMode(false);
            }}
          >
            {t('settings.mcpImportFromJSON')}
          </Button>

          {!server && detectedAgents.length > 0 && (
            <Button
              type={isImportMode ? 'primary' : 'outline'}
              size='small'
              onClick={() => {
                setIsImportMode(true);
              }}
            >
              {t('settings.mcpOneKeyImport')}
            </Button>
          )}
        </div>
      </div>

      {isImportMode ? (
        <div className='space-y-4'>
          <div>
            <div className='mb-2 text-sm font-medium'>{t('settings.mcpSelectCLI')}</div>
            <Select placeholder={t('settings.mcpSelectCLI')} value={selectedAgent} onChange={setSelectedAgent} className='w-full'>
              {detectedAgents.map((agent) => (
                <Select.Option key={agent.backend} value={agent.backend}>
                  {agent.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          {selectedAgent && (
            <div>
              <Button type='primary' loading={loadingImport} onClick={handleImportFromCLI} className='mb-4'>
                {t('settings.mcpImportFromCLI')}
              </Button>
            </div>
          )}

          {importableServers.length > 0 && (
            <div>
              <div className='mb-2 text-sm font-medium'>
                {t('settings.mcpServerList')} ({importableServers.length})
              </div>
              <div className='border border-gray-200 rounded'>
                {importableServers.map((server, index) => (
                  <div key={index} className='p-3 border-b border-gray-100 last:border-b-0'>
                    <div className='flex-1'>
                      <div className='font-medium'>{server.name}</div>
                      {server.description && <div className='text-sm text-gray-500'>{server.description}</div>}
                      <div className='text-xs text-gray-400 mt-1'>
                        {server.transport.type.toUpperCase()}: {server.transport.type === 'stdio' ? `${server.transport.command} ${server.transport.args?.join(' ')}` : server.transport.url}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className='mt-4'>
                <Button type='primary' onClick={handleBatchImport}>
                  {t('settings.mcpImportSuccess')} ({importableServers.length})
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className='mb-2 text-sm text-gray-600'>{t('settings.mcpImportPlaceholder')}</div>
          <div className='relative'>
            <CodeMirror
              value={jsonInput}
              height='300px'
              extensions={[json()]}
              onChange={(value) => setJsonInput(value)}
              placeholder={`{
  "mcpServers": {
    "weather": {
      "command": "uv",
      "args": ["--directory", "/path/to/weather", "run", "weather.py"],
      "description": "Weather information server"
    }
  }
}`}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                dropCursor: false,
                allowMultipleSelections: false,
              }}
              style={{
                fontSize: '13px',
                border: '1px solid #d9d9d9',
                borderRadius: '6px',
              }}
            />
            {jsonInput && (
              <Button
                size='mini'
                type='outline'
                className='absolute top-2 right-2 z-10'
                onClick={() => {
                  const copyToClipboard = async () => {
                    try {
                      if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(jsonInput);
                      } else {
                        // 降级到传统方法
                        const textArea = document.createElement('textarea');
                        textArea.value = jsonInput;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-9999px';
                        textArea.style.top = '-9999px';
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                      }
                      setCopyStatus('success');
                      setTimeout(() => setCopyStatus('idle'), 2000);
                    } catch (err) {
                      console.error('复制失败:', err);
                      setCopyStatus('error');
                      setTimeout(() => setCopyStatus('idle'), 2000);
                    }
                  };

                  copyToClipboard();
                }}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                {copyStatus === 'success' ? t('common.copySuccess') : copyStatus === 'error' ? t('common.copyFailed') : t('common.copy')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AddMcpServerModal;
