import type { IMcpServer, IMcpServerTransport, IMcpTool } from '@/common/config/storage';
import { Alert, Button } from '@arco-design/web-react';
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import AionModal from '@/renderer/components/base/AionModal';

interface JsonImportModalProps {
  visible: boolean;
  server?: IMcpServer;
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => Promise<void> | void;
  onBatchImport?: (
    servers: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]
  ) => Promise<IMcpServer[] | void> | IMcpServer[] | void;
}

interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

type JsonServerConfig = Record<string, any>;

const SPLITTABLE_STDIO_LAUNCHERS = ['npx', 'pnpx', 'bunx', 'uvx', 'uv', 'node', 'python', 'python3', 'deno'];

const shellSplit = (input: string): string[] => {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (char === '\\' && quote === '"' && index + 1 < input.length) {
        current += input[index + 1];
        index += 1;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '\\' && index + 1 < input.length) {
      current += input[index + 1];
      index += 1;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
};

const normalizeStdioCommand = (command: string, args?: string[]) => {
  const trimmed = command.trim();
  if (trimmed.length === 0 || (Array.isArray(args) && args.length > 0)) {
    return {
      command,
      args: args || [],
    };
  }

  const firstToken = trimmed.split(/\s+/)[0]?.replace(/^['"]|['"]$/g, '');
  if (!firstToken || !SPLITTABLE_STDIO_LAUNCHERS.includes(firstToken) || !/\s/.test(trimmed)) {
    return {
      command,
      args: args || [],
    };
  }

  const tokens = shellSplit(trimmed);
  if (tokens.length < 2) {
    return {
      command,
      args: args || [],
    };
  }

  return {
    command: tokens[0],
    args: tokens.slice(1),
  };
};

const buildOriginalJson = (name: string, description: string | undefined, transport: IMcpServerTransport): string => {
  const transportConfig =
    transport.type === 'stdio'
      ? {
          command: transport.command,
          args: transport.args || [],
          env: transport.env || {},
        }
      : {
          type: transport.type,
          url: transport.url,
          ...(transport.headers ? { headers: transport.headers } : {}),
        };

  return JSON.stringify(
    {
      mcpServers: {
        [name]: {
          ...(description ? { description } : {}),
          ...transportConfig,
        },
      },
    },
    null,
    2
  );
};

const JsonImportModal: React.FC<JsonImportModalProps> = ({ visible, server, onCancel, onSubmit, onBatchImport }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();
  const [jsonInput, setJsonInput] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true });

  /**
   * JSON语法校验
   */
  const validateJsonSyntax = useCallback((input: string): ValidationResult => {
    if (!input.trim()) {
      return { isValid: true }; // 空值视为有效
    }

    try {
      JSON.parse(input);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        errorMessage: error instanceof SyntaxError ? error.message : 'Invalid JSON format',
      };
    }
  }, []);

  // 监听 jsonInput 变化，实时更新校验结果
  React.useEffect(() => {
    setValidation(validateJsonSyntax(jsonInput));
  }, [jsonInput, validateJsonSyntax]);

  // 当编辑现有服务器时，预填充JSON数据
  React.useEffect(() => {
    if (visible && server) {
      // 优先使用存储的original_json，如果没有则生成JSON配置
      if (server.original_json) {
        setJsonInput(server.original_json);
      } else {
        // 兼容没有original_json的旧数据，生成JSON配置
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

  /**
   * Parse transport config from JSON server config.
   * Supports both "type" field (standard) and "transport" field (Gemini CLI format).
   */
  const parseTransport = (serverConfig: JsonServerConfig): IMcpServerTransport => {
    if (serverConfig.command) {
      const normalized = normalizeStdioCommand(serverConfig.command, serverConfig.args);
      return {
        type: 'stdio',
        command: normalized.command,
        args: normalized.args,
        env: serverConfig.env || {},
      };
    }

    // Check both "type" and "transport" fields for transport type detection
    // Gemini CLI uses "transport" field, standard format uses "type" field
    const transport_type = serverConfig.type || serverConfig.transport;

    if (transport_type === 'sse' || serverConfig.url?.includes('/sse')) {
      return { type: 'sse', url: serverConfig.url, headers: serverConfig.headers };
    }
    if (transport_type === 'streamable_http') {
      return { type: 'streamable_http', url: serverConfig.url, headers: serverConfig.headers };
    }
    return { type: 'http', url: serverConfig.url, headers: serverConfig.headers };
  };

  const normalizeArrayServer = (serverItem: unknown): { name: string; config: JsonServerConfig } => {
    if (!serverItem || typeof serverItem !== 'object' || Array.isArray(serverItem)) {
      throw new Error(t('settings.mcpJsonFormatError'));
    }

    const rawServer = serverItem as JsonServerConfig;
    if (typeof rawServer.name !== 'string' || !rawServer.name.trim()) {
      throw new Error(t('settings.mcpJsonFormatError'));
    }

    const { name, ...restConfig } = rawServer;
    const transport_config = restConfig.transport;
    if (transport_config && typeof transport_config === 'object' && !Array.isArray(transport_config)) {
      const typedTransport = transport_config as JsonServerConfig;
      if (typedTransport.type === 'stdio') {
        return {
          name,
          config: {
            ...restConfig,
            command: typedTransport.command,
            args: typedTransport.args,
            env: typedTransport.env,
            transport: undefined,
          },
        };
      }

      return {
        name,
        config: {
          ...restConfig,
          type: typedTransport.type,
          url: typedTransport.url,
          headers: typedTransport.headers,
          transport: undefined,
        },
      };
    }

    return { name, config: restConfig };
  };

  const normalizeMcpServers = (config: JsonServerConfig): Record<string, JsonServerConfig> => {
    const rawServers = config.mcpServers ?? config;

    if (Array.isArray(rawServers)) {
      return rawServers.reduce<Record<string, JsonServerConfig>>((accumulator, serverItem) => {
        const { name, config: normalizedConfig } = normalizeArrayServer(serverItem);
        accumulator[name] = normalizedConfig;
        return accumulator;
      }, {});
    }

    if (!rawServers || typeof rawServers !== 'object') {
      throw new Error(t('settings.mcpJsonFormatError'));
    }

    return rawServers as Record<string, JsonServerConfig>;
  };

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    // Re-validate at submit time to guard against race between useEffect validation and click
    let config: Record<string, any>;
    try {
      config = JSON.parse(jsonInput);
    } catch {
      setValidation({ isValid: false, errorMessage: 'Invalid JSON format' });
      return;
    }
    let mcpServers: Record<string, JsonServerConfig>;
    try {
      mcpServers = normalizeMcpServers(config);
    } catch (error) {
      setValidation({
        isValid: false,
        errorMessage: error instanceof Error ? error.message : t('settings.mcpJsonFormatError'),
      });
      return;
    }

    const serverKeys = Object.keys(mcpServers);
    if (serverKeys.length === 0) {
      console.warn('No MCP server found in configuration');
      return;
    }

    setSubmitting(true);

    // 如果有多个服务器，使用批量导入
    if (serverKeys.length > 1 && onBatchImport) {
      const serversToImport = serverKeys.map((serverKey) => {
        const serverConfig = mcpServers[serverKey];
        const description = serverConfig.description || `Imported from JSON`;
        const transport = parseTransport(serverConfig);
        return {
          name: serverKey,
          description,
          enabled: true,
          transport,
          last_test_status: 'disconnected' as const,
          tools: [] as IMcpTool[], // JSON导入时初始化为空数组，后续可通过连接测试获取
          original_json: buildOriginalJson(serverKey, description, transport),
        };
      });

      try {
        await onBatchImport(serversToImport);
        onCancel();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // 单个服务器导入
    const firstServerKey = serverKeys[0];
    const serverConfig = mcpServers[firstServerKey];
    const description = serverConfig.description || 'Imported from JSON';
    const transport = parseTransport(serverConfig);

    try {
      await onSubmit({
        name: firstServerKey,
        description,
        enabled: true,
        transport,
        last_test_status: 'disconnected',
        tools: [] as IMcpTool[], // JSON导入时初始化为空数组，后续可通过连接测试获取
        original_json: buildOriginalJson(firstServerKey, description, transport),
      });
      onCancel();
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okButtonProps={{ disabled: !validation.isValid || submitting, loading: submitting }}
      header={{ title: server ? t('settings.mcpEditServer') : t('settings.mcpImportFromJSON'), showClose: true }}
      style={{ width: 600, height: 450 }}
      contentStyle={{
        borderRadius: 16,
        padding: '24px',
        background: 'var(--dialog-fill-0)',
        overflow: 'auto',
        height: 420 - 80,
      }} // 与“添加模型”弹窗保持统一尺寸 / Keep same size as Add Model modal
    >
      <div className='space-y-12px'>
        <div>
          <div className='mb-2 text-sm text-t-secondary'>{t('settings.mcpImportPlaceholder')}</div>
          <div className='relative'>
            <CodeMirror
              value={jsonInput}
              height='300px'
              theme={theme}
              extensions={[json()]}
              onChange={(value: string) => setJsonInput(value)}
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
                border: validation.isValid || !jsonInput.trim() ? '1px solid var(--bg-3)' : '1px solid var(--danger)',
                borderRadius: '6px',
                marginBottom: '20px',
                overflow: 'hidden',
              }}
              className='[&_.cm-editor]:rounded-[6px]'
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
                        // Fallback to legacy method 降级到传统方法
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
                      console.error('Copy failed 复制失败:', err);
                      setCopyStatus('error');
                      setTimeout(() => setCopyStatus('idle'), 2000);
                    }
                  };

                  void copyToClipboard();
                }}
                style={{
                  backdropFilter: 'blur(4px)',
                }}
              >
                {copyStatus === 'success'
                  ? t('common.copySuccess')
                  : copyStatus === 'error'
                    ? t('common.copyFailed')
                    : t('common.copy')}
              </Button>
            )}
          </div>

          {/* JSON 格式错误提示 */}
          {!validation.isValid && jsonInput.trim() && (
            <div className='mt-2 text-sm text-red-600'>
              {validation.errorMessage || t('settings.mcpJsonFormatError') || 'JSON format error'}
            </div>
          )}
        </div>

        <Alert
          type='info'
          showIcon
          content={
            <div>
              <div>{t('settings.mcpImportTips')}</div>
              <ul className='list-disc pl-5 mt-2 space-y-1 text-sm'>
                <li>{t('settings.mcpImportTip1')}</li>
                <li>{t('settings.mcpImportTip2')}</li>
                <li>{t('settings.mcpImportTip3')}</li>
              </ul>
            </div>
          }
        />
      </div>
    </AionModal>
  );
};

export default JsonImportModal;
