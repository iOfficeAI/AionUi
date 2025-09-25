import type { IMcpServer, IMcpServerTransport, IMcpTool } from '@/common/storage';
import { Button, Modal } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';

interface JsonImportModalProps {
  visible: boolean;
  server?: IMcpServer;
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onBatchImport?: (servers: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
}

const JsonImportModal: React.FC<JsonImportModalProps> = ({ visible, server, onCancel, onSubmit, onBatchImport }) => {
  const { t } = useTranslation();
  const [jsonInput, setJsonInput] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // 当编辑现有服务器时，预填充JSON数据
  React.useEffect(() => {
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
    } else if (visible && !server) {
      // 新建模式下清空JSON输入
      setJsonInput('');
    }
  }, [visible, server]);

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
            tools: [] as IMcpTool[], // JSON导入时初始化为空数组，后续可通过连接测试获取
            originalJson: JSON.stringify({ mcpServers: { [serverKey]: serverConfig } }, null, 2),
          };
        });

        onBatchImport(serversToImport);
        onCancel();
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
        tools: [] as IMcpTool[], // JSON导入时初始化为空数组，后续可通过连接测试获取
        originalJson: jsonInput,
      });
      onCancel();
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      // TODO: 显示错误提示
      return;
    }
  };

  if (!visible) return null;

  return (
    <Modal
      title={server ? t('settings.mcpEditServer') : t('settings.mcpImportFromJSON')}
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

                void copyToClipboard();
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
    </Modal>
  );
};

export default JsonImportModal;
