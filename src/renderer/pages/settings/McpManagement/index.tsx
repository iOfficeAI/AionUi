import type { IMcpServer } from '@/common/storage';
import { acpConversation, mcpService } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import { Button, Collapse, Message, Modal } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AddMcpServerModal from '../components/AddMcpServerModal';
import McpServerItem from './McpServerItem';

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
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [agentInstallStatus, setAgentInstallStatus] = useState<Record<string, string[]>>({});
  const [isLoadingAgentStatus, setIsLoadingAgentStatus] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 保存 agentInstallStatus 到存储
  const saveAgentInstallStatus = (status: Record<string, string[]>) => {
    ConfigStorage.set('mcp.agentInstallStatus', status);
    setAgentInstallStatus(status);
  };
  const [message, messageContext] = Message.useMessage();

  useEffect(() => {
    // 加载 MCP 服务器配置
    ConfigStorage.get('mcp.config').then((data) => {
      if (data) {
        setMcpServers(data);
        // 初始加载后检查安装状态
        debouncedCheckAgentInstallStatus(data);
      }
    });

    // 加载 agent 安装状态
    ConfigStorage.get('mcp.agentInstallStatus').then((status) => {
      if (status && typeof status === 'object') {
        setAgentInstallStatus(status as Record<string, string[]>);
      }
    });
  }, []);

  // 检查每个MCP服务器在哪些agent中安装了
  const checkAgentInstallStatus = async (servers: IMcpServer[]) => {
    // 避免在加载过程中清空状态造成闪烁
    setIsLoadingAgentStatus(true);
    try {
      const agentsResponse = await acpConversation.getAvailableAgents.invoke();
      if (!agentsResponse.success || !agentsResponse.data) {
        // 如果没有检测到agent，只在初次加载时清空状态
        if (Object.keys(agentInstallStatus).length === 0) {
          saveAgentInstallStatus({});
        }
        return;
      }

      const mcpResponse = await mcpService.getAgentMcpConfigs.invoke(agentsResponse.data);
      if (!mcpResponse.success || !mcpResponse.data) {
        // 如果MCP配置获取失败，保持当前状态，避免闪烁
        return;
      }

      const installStatus: Record<string, string[]> = {};

      // 只为启用的服务器初始化安装状态
      servers.forEach((server) => {
        if (server.enabled) {
          installStatus[server.name] = [];
        }
      });

      // 检查每个agent的MCP配置，只检查启用的服务器
      mcpResponse.data.forEach((agentConfig) => {
        agentConfig.servers.forEach((agentServer) => {
          // 查找对应的本地服务器配置
          const localServer = servers.find((s) => s.name === agentServer.name);
          // 只有当本地服务器存在且启用时，才显示安装状态
          if (localServer && localServer.enabled && installStatus[agentServer.name] !== undefined) {
            installStatus[agentServer.name].push(agentConfig.source);
          }
        });
      });

      saveAgentInstallStatus(installStatus);
    } catch (error) {
      // 出错时保持当前状态，避免闪烁
    } finally {
      setIsLoadingAgentStatus(false);
    }
  };

  // 防抖版本的状态检查，避免频繁调用
  const debouncedCheckAgentInstallStatus = (servers: IMcpServer[]) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      checkAgentInstallStatus(servers).catch(() => {
        // Silently handle errors
      });
    }, 300); // 300ms 防抖
  };

  const saveMcpServers = (servers: IMcpServer[]) => {
    ConfigStorage.set('mcp.config', servers);
    setMcpServers(servers);
    // 保存后重新检查agent安装状态
    debouncedCheckAgentInstallStatus(servers);
  };

  const handleAddMcpServer = (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();

    // 检查是否存在同名服务器
    const existingServerIndex = mcpServers.findIndex((server) => server.name === serverData.name);

    if (existingServerIndex !== -1) {
      // 如果存在同名服务器，更新现有服务器
      const updatedServers = [...mcpServers];
      updatedServers[existingServerIndex] = {
        ...updatedServers[existingServerIndex],
        ...serverData,
        updatedAt: now,
      };
      saveMcpServers(updatedServers);
      message.success(`${serverData.name} ${t('settings.mcpImportSuccess')} (已更新)`);

      // 自动执行连接测试
      setTimeout(() => {
        handleTestMcpConnection(updatedServers[existingServerIndex]).catch(() => {
          // Auto connection test failed
        });
      }, 500);
    } else {
      // 如果不存在同名服务器，添加新服务器
      const newServer: IMcpServer = {
        ...serverData,
        id: `mcp_${now}`,
        createdAt: now,
        updatedAt: now,
      };
      const updatedServers = [...mcpServers, newServer];
      saveMcpServers(updatedServers);
      message.success(t('settings.mcpImportSuccess'));

      // 自动执行连接测试
      setTimeout(() => {
        handleTestMcpConnection(newServer).catch(() => {
          // Auto connection test failed
        });
      }, 500);
    }

    setShowMcpModal(false);
    setEditingMcpServer(undefined);
  };

  const handleBatchImportMcpServers = (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    const now = Date.now();
    const updatedServers = [...mcpServers];
    const addedServers: IMcpServer[] = [];
    const updatedServerNames: string[] = [];

    serversData.forEach((serverData, index) => {
      const existingServerIndex = updatedServers.findIndex((server) => server.name === serverData.name);

      if (existingServerIndex !== -1) {
        // 如果存在同名服务器，更新现有服务器
        updatedServers[existingServerIndex] = {
          ...updatedServers[existingServerIndex],
          ...serverData,
          updatedAt: now,
        };
        updatedServerNames.push(serverData.name);
      } else {
        // 如果不存在同名服务器，添加新服务器
        const newServer: IMcpServer = {
          ...serverData,
          id: `mcp_${now}_${index}`,
          createdAt: now,
          updatedAt: now,
        };
        updatedServers.push(newServer);
        addedServers.push(newServer);
      }
    });

    saveMcpServers(updatedServers);
    setShowMcpModal(false);
    setEditingMcpServer(undefined);

    // 显示导入结果消息
    const totalImported = addedServers.length + updatedServerNames.length;
    let successMessage = `${t('settings.mcpImportSuccess')} (${totalImported})`;
    if (updatedServerNames.length > 0) {
      successMessage += ` - 更新: ${updatedServerNames.join(', ')}`;
    }
    message.success(successMessage);

    // 自动对所有导入的服务器执行连接测试
    setTimeout(() => {
      const allServersToTest = [...addedServers, ...updatedServerNames.map((name) => updatedServers.find((s) => s.name === name)!)];

      allServersToTest.forEach((server, index) => {
        // 间隔执行，避免同时发起太多连接
        setTimeout(() => {
          handleTestMcpConnection(server).catch(() => {
            // Auto connection test failed
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

    // 自动执行连接测试
    setTimeout(() => {
      handleTestMcpConnection(updatedServer).catch(() => {
        // Auto connection test failed
      });
    }, 500);
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

      // 操作成功后刷新安装状态 - 使用当前最新的服务器状态
      setTimeout(() => {
        // 重新获取最新的服务器配置
        ConfigStorage.get('mcp.config').then((latestServers) => {
          if (latestServers) {
            debouncedCheckAgentInstallStatus(latestServers);
          }
        });
      }, 1000);
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

  const handleShowDeleteConfirm = (serverId: string) => {
    setServerToDelete(serverId);
    setDeleteConfirmVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;

    setDeleteConfirmVisible(false);
    await handleDeleteMcpServer(serverToDelete);
    setServerToDelete(null);
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
      message.error(enabled ? t('settings.mcpSyncError') : t('settings.mcpRemoveError'));
    }
  };

  const handleTestMcpConnection = async (server: IMcpServer) => {
    setTestingServers((prev) => ({ ...prev, [server.id]: true }));

    // 更新服务器状态为测试中
    const updateServerStatus = (status: IMcpServer['status'], additionalData?: Partial<IMcpServer>) => {
      setMcpServers((currentServers) => {
        const updatedServers = currentServers.map((s) => (s.id === server.id ? { ...s, status, updatedAt: Date.now(), ...additionalData } : s));
        ConfigStorage.set('mcp.config', updatedServers);
        return updatedServers;
      });
    };

    updateServerStatus('testing');

    try {
      const response = await mcpService.testMcpConnection.invoke(server);

      if (response.success && response.data) {
        const result = response.data;

        if (result.success) {
          // 更新服务器状态为已连接，并保存获取到的工具信息
          updateServerStatus('connected', {
            tools: result.tools?.map((tool) => ({ name: tool.name, description: tool.description })),
            lastConnected: Date.now(),
          });
          message.success(`${server.name}: ${t('settings.mcpTestConnectionSuccess')}`);

          // 如果服务器是启用状态，自动同步到agents
          if (server.enabled) {
            try {
              await syncMcpToAgents(server);
            } catch (syncError) {
              // 不显示同步错误消息，因为主要的连接测试已经成功
            }
          }
        } else {
          // 更新服务器状态为错误
          updateServerStatus('error');
          message.error(`${server.name}: ${result.error || t('settings.mcpError')}`);
        }
      } else {
        // IPC调用失败
        updateServerStatus('error');
        message.error(`${server.name}: ${response.msg || t('settings.mcpError')}`);
      }
    } catch (error) {
      // 更新服务器状态为错误
      updateServerStatus('error');
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
            mcpServers.map((server) => (
              <McpServerItem
                key={server.id}
                server={server}
                isCollapsed={mcpCollapseKey[server.id] || false}
                agentInstallStatus={agentInstallStatus}
                isLoadingAgentStatus={isLoadingAgentStatus}
                isTestingConnection={testingServers[server.id] || false}
                onToggleCollapse={() => {
                  setMcpCollapseKey({ ...mcpCollapseKey, [server.id]: !mcpCollapseKey[server.id] });
                }}
                onTestConnection={handleTestMcpConnection}
                onEditServer={(server) => {
                  setEditingMcpServer(server);
                  setShowMcpModal(true);
                }}
                onDeleteServer={handleShowDeleteConfirm}
                onToggleServer={handleToggleMcpServer}
              />
            ))
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

      <Modal
        title={t('settings.mcpDeleteServer')}
        visible={deleteConfirmVisible}
        onCancel={() => {
          setDeleteConfirmVisible(false);
          setServerToDelete(null);
        }}
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
