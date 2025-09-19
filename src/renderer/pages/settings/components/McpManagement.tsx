import type { IMcpServer } from '@/common/storage';
import { acpConversation, mcpService } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import { Button, Collapse, Message, Popconfirm, Switch, Tag } from '@arco-design/web-react';
import { DeleteFour, Plus, Write, Wifi } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddMcpServerModal from './AddMcpServerModal';

// 定义MCP操作结果类型
interface McpOperationResult {
  agent: string;
  success: boolean;
  error?: string;
}

interface McpOperationResponse {
  success: boolean;
  data?: {
    results: McpOperationResult[];
  };
  msg?: string;
}

const McpManagement: React.FC = () => {
  const { t } = useTranslation();
  const [mcpServers, setMcpServers] = useState<IMcpServer[]>([]);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState<IMcpServer | undefined>();
  const [mcpCollapseKey, setMcpCollapseKey] = useState<Record<string, boolean>>({});
  const [testingServers, setTestingServers] = useState<Record<string, boolean>>({});
  const [message, messageContext] = Message.useMessage();

  useEffect(() => {
    ConfigStorage.get('mcp.config').then((data) => {
      if (data) {
        setMcpServers(data);
      }
    });
  }, []);

  const saveMcpServers = (servers: IMcpServer[]) => {
    ConfigStorage.set('mcp.config', servers);
    setMcpServers(servers);
  };

  const handleAddMcpServer = (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    const newServer: IMcpServer = {
      ...serverData,
      id: `mcp_${now}`,
      createdAt: now,
      updatedAt: now,
    };
    const updatedServers = [...mcpServers, newServer];
    saveMcpServers(updatedServers);
    setShowMcpModal(false);
    setEditingMcpServer(undefined);
    message.success(t('settings.mcpImportSuccess'));

    // 自动执行连接测试
    setTimeout(() => {
      handleTestMcpConnection(newServer).catch((error) => {
        console.error('Auto connection test failed:', error);
      });
    }, 500);
  };

  const handleBatchImportMcpServers = (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    const now = Date.now();
    const newServers: IMcpServer[] = serversData.map((serverData, index) => ({
      ...serverData,
      id: `mcp_${now}_${index}`,
      createdAt: now,
      updatedAt: now,
    }));
    const updatedServers = [...mcpServers, ...newServers];
    saveMcpServers(updatedServers);
    setShowMcpModal(false);
    setEditingMcpServer(undefined);
    message.success(`${t('settings.mcpImportSuccess')} (${newServers.length})`);

    // 自动对所有新添加的服务器执行连接测试
    setTimeout(() => {
      newServers.forEach((server, index) => {
        // 间隔执行，避免同时发起太多连接
        setTimeout(() => {
          handleTestMcpConnection(server).catch((error) => {
            console.error(`Auto connection test failed for ${server.name}:`, error);
          });
        }, index * 1000);
      });
    }, 500);
  };

  const handleEditMcpServer = (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!editingMcpServer) return;

    const updatedServer: IMcpServer = {
      ...editingMcpServer,
      ...serverData,
      updatedAt: Date.now(),
    };

    const updatedServers = mcpServers.map((server) => (server.id === editingMcpServer.id ? updatedServer : server));
    saveMcpServers(updatedServers);
    setShowMcpModal(false);
    setEditingMcpServer(undefined);
    message.success(t('settings.mcpImportSuccess'));
  };

  // 处理MCP配置同步到agents的结果
  const handleMcpOperationResult = (response: McpOperationResponse, operation: 'sync' | 'remove', successMessage?: string) => {
    if (response.success && response.data) {
      const { results } = response.data;
      const failedAgents = results.filter((r: McpOperationResult) => !r.success);

      if (failedAgents.length > 0) {
        const failedNames = failedAgents.map((r: McpOperationResult) => `${r.agent}: ${r.error}`).join(', ');
        const partialFailedKey = operation === 'sync' ? 'mcpSyncPartialFailed' : 'mcpRemovePartialFailed';
        message.warning(t(`settings.${partialFailedKey}`, { errors: failedNames }));
      } else {
        if (successMessage) {
          message.success(successMessage);
        } else {
          const successKey = operation === 'sync' ? 'mcpSyncSuccess' : 'mcpRemoveSuccess';
          message.success(t(`settings.${successKey}`, { count: results.length }));
        }
      }
    } else {
      const failedKey = operation === 'sync' ? 'mcpSyncFailed' : 'mcpRemoveFailed';
      message.error(t(`settings.${failedKey}`, { error: response.msg || t('settings.unknownError') }));
    }
  };

  // 从agents中删除MCP配置
  const removeMcpFromAgents = async (serverName: string, successMessage?: string) => {
    const agentsResponse = await acpConversation.getAvailableAgents.invoke();
    if (agentsResponse.success && agentsResponse.data) {
      const removeResponse = await mcpService.removeMcpFromAgents.invoke({
        mcpServerName: serverName,
        agents: agentsResponse.data,
      });
      handleMcpOperationResult(removeResponse, 'remove', successMessage);
    }
  };

  // 向agents同步MCP配置
  const syncMcpToAgents = async (server: IMcpServer) => {
    const agentsResponse = await acpConversation.getAvailableAgents.invoke();
    if (agentsResponse.success && agentsResponse.data) {
      const syncResponse = await mcpService.syncMcpToAgents.invoke({
        mcpServers: [server],
        agents: agentsResponse.data,
      });
      handleMcpOperationResult(syncResponse, 'sync');
    }
  };

  const handleDeleteMcpServer = async (serverId: string) => {
    const targetServer = mcpServers.find((server) => server.id === serverId);
    if (!targetServer) return;

    // 先从本地状态中删除
    const updatedServers = mcpServers.filter((server) => server.id !== serverId);
    saveMcpServers(updatedServers);

    try {
      // 如果服务器是启用状态，需要从所有agents中删除MCP配置
      if (targetServer.enabled) {
        await removeMcpFromAgents(targetServer.name, t('settings.mcpDeletedWithCleanup'));
      } else {
        message.success(t('settings.mcpDeleted'));
      }
    } catch (error) {
      console.error('Failed to remove MCP server from agents:', error);
      message.error(t('settings.mcpDeleteError'));
    }
  };

  const handleToggleMcpServer = async (serverId: string, enabled: boolean) => {
    const targetServer = mcpServers.find((server) => server.id === serverId);
    if (!targetServer) return;

    const updatedServers = mcpServers.map((server) => (server.id === serverId ? { ...server, enabled, updatedAt: Date.now() } : server));

    saveMcpServers(updatedServers);

    try {
      if (enabled) {
        // 如果启用了MCP服务器，只将当前服务器同步到所有检测到的agent
        const updatedTargetServer = updatedServers.find((server) => server.id === serverId);
        if (!updatedTargetServer) return;
        await syncMcpToAgents(updatedTargetServer);
      } else {
        // 如果禁用了MCP服务器，从所有agent中删除该配置
        await removeMcpFromAgents(targetServer.name);
      }
    } catch (error) {
      console.error('Failed to handle MCP server toggle:', error);
      message.error(enabled ? t('settings.mcpSyncError') : t('settings.mcpRemoveError'));
    }
  };

  const getStatusColor = (status?: IMcpServer['status']) => {
    switch (status) {
      case 'connected':
        return 'green';
      case 'testing':
        return 'blue';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusText = (status?: IMcpServer['status']) => {
    switch (status) {
      case 'connected':
        return t('settings.mcpConnected');
      case 'testing':
        return t('settings.mcpTesting');
      case 'error':
        return t('settings.mcpError');
      default:
        return t('settings.mcpDisconnected');
    }
  };

  const handleTestMcpConnection = async (server: IMcpServer) => {
    setTestingServers((prev) => ({ ...prev, [server.id]: true }));

    // 更新服务器状态为测试中
    const updatedServers = mcpServers.map((s) => (s.id === server.id ? { ...s, status: 'testing' as const, updatedAt: Date.now() } : s));
    saveMcpServers(updatedServers);

    try {
      const response = await mcpService.testMcpConnection.invoke(server);

      if (response.success && response.data) {
        const result = response.data;

        if (result.success) {
          // 更新服务器状态为已连接，并保存获取到的工具信息
          const updatedServers = mcpServers.map((s) =>
            s.id === server.id
              ? {
                  ...s,
                  status: 'connected' as const,
                  tools: result.tools?.map((tool) => ({ name: tool.name, description: tool.description })),
                  lastConnected: Date.now(),
                  updatedAt: Date.now(),
                }
              : s
          );
          saveMcpServers(updatedServers);
          message.success(`${server.name}: ${t('settings.mcpConnected')}`);
        } else {
          // 更新服务器状态为错误
          const updatedServers = mcpServers.map((s) => (s.id === server.id ? { ...s, status: 'error' as const, updatedAt: Date.now() } : s));
          saveMcpServers(updatedServers);
          message.error(`${server.name}: ${result.error || t('settings.mcpError')}`);
        }
      } else {
        // IPC调用失败
        const updatedServers = mcpServers.map((s) => (s.id === server.id ? { ...s, status: 'error' as const, updatedAt: Date.now() } : s));
        saveMcpServers(updatedServers);
        message.error(`${server.name}: ${response.msg || t('settings.mcpError')}`);
      }
    } catch (error) {
      // 更新服务器状态为错误
      const updatedServers = mcpServers.map((s) => (s.id === server.id ? { ...s, status: 'error' as const, updatedAt: Date.now() } : s));
      saveMcpServers(updatedServers);
      message.error(`${server.name}: ${error instanceof Error ? error.message : t('settings.mcpError')}`);
    } finally {
      setTestingServers((prev) => ({ ...prev, [server.id]: false }));
    }
  };

  return (
    <div>
      {messageContext}
      <Collapse.Item
        className={' [&_div.arco-collapse-item-header-title]:flex-1'}
        header={
          <div className='flex items-center justify-between'>
            {t('settings.mcpSettings')}
            <Button
              size='mini'
              type='outline'
              icon={<Plus size={'14'} />}
              shape='round'
              onClick={(e) => {
                e.stopPropagation();
                setEditingMcpServer(undefined);
                setShowMcpModal(true);
              }}
            >
              {t('settings.mcpAddServer')}
            </Button>
          </div>
        }
        name={'mcp-servers'}
      >
        <div>
          {mcpServers.length === 0 ? (
            <div className='text-center py-8 text-gray-500'>{t('settings.mcpNoServersFound')}</div>
          ) : (
            mcpServers.map((server) => {
              const key = server.id;
              return (
                <Collapse
                  key={key}
                  activeKey={mcpCollapseKey[key] ? ['1'] : []}
                  onChange={() => {
                    setMcpCollapseKey({ ...mcpCollapseKey, [key]: !mcpCollapseKey[key] });
                  }}
                  className='mb-4'
                >
                  <Collapse.Item
                    header={
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-2'>
                          <span>{server.name}</span>
                          <Tag color={getStatusColor(server.status)}>{getStatusText(server.status)}</Tag>
                        </div>
                        <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
                          <Switch checked={server.enabled} onChange={(checked) => handleToggleMcpServer(server.id, checked)} size='small' disabled={server.status === 'disconnected' || server.status === 'error'} />
                          <Button size='mini' icon={<Wifi size={'14'} />} title={t('settings.mcpTestConnection')} loading={testingServers[server.id]} onClick={() => handleTestMcpConnection(server)} />
                          <Button
                            size='mini'
                            icon={<Write size={'14'} />}
                            onClick={() => {
                              setEditingMcpServer(server);
                              setShowMcpModal(true);
                            }}
                          />
                          <Popconfirm title={t('settings.mcpDeleteConfirm')} onOk={() => handleDeleteMcpServer(server.id)}>
                            <Button size='mini' icon={<DeleteFour size={'14'} />} status='danger' />
                          </Popconfirm>
                        </div>
                      </div>
                    }
                    name='1'
                    className={'[&_div.arco-collapse-item-content-box]:py-3'}
                  >
                    <div className='space-y-3'>
                      {server.tools && server.tools.length > 0 && (
                        <div>
                          <div className='space-y-2'>
                            {server.tools.map((tool, index) => (
                              <div key={index} className='border border-gray-200 rounded p-3'>
                                <div className='flex gap-4'>
                                  <div className='flex-shrink-0 min-w-0 w-1/3'>
                                    <div className='font-medium text-sm text-blue-600 break-words'>{tool.name}</div>
                                  </div>
                                  <div className='flex-1 min-w-0'>
                                    <div className='text-xs text-gray-600 break-words'>{tool.description || t('settings.mcpNoDescription')}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Collapse.Item>
                </Collapse>
              );
            })
          )}
        </div>
      </Collapse.Item>

      <AddMcpServerModal
        visible={showMcpModal}
        server={editingMcpServer}
        onCancel={() => {
          setShowMcpModal(false);
          setEditingMcpServer(undefined);
        }}
        onSubmit={editingMcpServer ? handleEditMcpServer : handleAddMcpServer}
        onBatchImport={handleBatchImportMcpServers}
      />
    </div>
  );
};

export default McpManagement;
