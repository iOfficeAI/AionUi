import type { IMcpServer, IMcpTool } from '@/common/storage';
import { acpConversation, mcpService } from '@/common/ipcBridge';
import { Button, Modal, Select } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface OneClickImportModalProps {
  visible: boolean;
  onCancel: () => void;
  onBatchImport?: (servers: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
}

const OneClickImportModal: React.FC<OneClickImportModalProps> = ({ visible, onCancel, onBatchImport }) => {
  const { t } = useTranslation();
  const [detectedAgents, setDetectedAgents] = useState<Array<{ backend: string; name: string }>>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [importableServers, setImportableServers] = useState<IMcpServer[]>([]);
  const [loadingImport, setLoadingImport] = useState(false);

  useEffect(() => {
    if (visible) {
      // 初始化时检测可用的agents
      const loadAgents = async () => {
        try {
          const response = await acpConversation.getAvailableAgents.invoke();
          if (response.success && response.data) {
            const agents = response.data.map((agent) => ({ backend: agent.backend, name: agent.name }));
            setDetectedAgents(agents);
            // 设置第一个agent为默认值
            if (agents.length > 0 && !selectedAgent) {
              setSelectedAgent(agents[0].backend);
            }
          }
        } catch (error) {
          console.error('Failed to load agents:', error);
        }
      };
      void loadAgents();
    }
  }, [visible, selectedAgent]);

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
        const serverConfig: Record<string, string | string[] | Record<string, string>> = {
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
          tools: (server.tools || []) as IMcpTool[], // 保留原始的 tools 信息
          originalJson: JSON.stringify({ mcpServers: { [server.name]: serverConfig } }, null, 2),
        };
      });
      onBatchImport(serversToImport);
      onCancel();
    }
  };

  if (!visible) return null;

  return (
    <Modal
      title={t('settings.mcpOneKeyImport')}
      visible={visible}
      onCancel={onCancel}
      footer={[
        <Button key='cancel' onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button key='import' type='primary' onClick={handleBatchImport} disabled={importableServers.length === 0}>
          {t('common.save')}
        </Button>,
      ]}
      style={{ width: 600 }}
    >
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
          </div>
        )}
      </div>
    </Modal>
  );
};

export default OneClickImportModal;
