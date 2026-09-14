import { useCallback, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { mcpService } from '@/common/adapter/ipcBridge';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IMcpServer } from '@/common/config/storage';
import { setClientBusinessSetting, getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import { toBackendMcpPayload } from './catalog';

const mergeServerState = (persisted: IMcpServer, fallback?: Partial<IMcpServer>): IMcpServer => ({
  ...persisted,
  last_test_status: fallback?.last_test_status ?? persisted.last_test_status,
  tools: fallback?.tools ?? persisted.tools,
  last_connected: fallback?.last_connected ?? persisted.last_connected,
  original_json: fallback?.original_json ?? persisted.original_json,
});

const replaceUserServer = (servers: IMcpServer[], nextServer: IMcpServer) => {
  const remainingServers = servers.filter((server) => server.builtin === true || server.id !== nextServer.id);
  const insertIndex = remainingServers.findIndex((server) => server.builtin === true);

  if (insertIndex === -1) {
    return [...remainingServers, nextServer];
  }

  remainingServers.splice(insertIndex, 0, nextServer);
  return remainingServers;
};

const getMcpRequestErrorMessage = (error: unknown, fallback: string): string => {
  if (isBackendHttpError(error) && error.backendMessage.trim()) return error.backendMessage;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
};

const refreshManagedCodexMcpConfig = async (): Promise<void> => {
  const authBridge = window.electronAPI?.aibangAuth;
  if (!authBridge) return;

  try {
    await authBridge.getStatus();
  } catch (error) {
    console.warn('[MCP] Failed to refresh managed Codex config:', error);
  }
};

const toggleLocalBuiltinServer = async (server: IMcpServer): Promise<IMcpServer> => {
  const localServers = (await getClientBusinessSetting('mcp.config')) ?? [];
  const serverIndex = localServers.findIndex(
    (localServer) => localServer.builtin === true && (localServer.id === server.id || localServer.name === server.name)
  );

  if (serverIndex === -1) {
    throw new Error(`MCP server not found: ${server.name}`);
  }

  const nextServers = [...localServers];
  nextServers[serverIndex] = {
    ...localServers[serverIndex],
    enabled: server.enabled === false,
  };
  await setClientBusinessSetting('mcp.config', nextServers);

  return {
    ...server,
    enabled: server.enabled === false,
    updated_at: Date.now(),
  };
};

const deleteLocalBuiltinServer = async (server: IMcpServer): Promise<void> => {
  const localServers = (await getClientBusinessSetting('mcp.config')) ?? [];
  const serverIndex = localServers.findIndex(
    (localServer) => localServer.builtin === true && (localServer.id === server.id || localServer.name === server.name)
  );

  if (serverIndex === -1) {
    throw new Error(`MCP server not found: ${server.name}`);
  }

  await setClientBusinessSetting(
    'mcp.config',
    localServers.filter((_localServer, currentServerIndex) => currentServerIndex !== serverIndex)
  );
};

const persistDeletedBuiltinServerName = async (serverName: string): Promise<void> => {
  const deletedServerNames = (await getClientBusinessSetting('mcp.deletedBuiltinServerNames')) ?? [];
  if (deletedServerNames.includes(serverName)) {
    return;
  }

  await setClientBusinessSetting('mcp.deletedBuiltinServerNames', [...deletedServerNames, serverName]);
};

export const useMcpServerCRUD = (
  saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>
) => {
  const { t } = useTranslation();
  const [togglingServers, setTogglingServers] = useState<Record<string, boolean>>({});

  const persistEnabledState = useCallback(async (server: IMcpServer, enabled: boolean) => {
    if (server.enabled === enabled) {
      return server;
    }

    return mcpService.toggleServer.invoke({ id: server.id });
  }, []);

  const handleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        let persisted = await mcpService.createServer.invoke(toBackendMcpPayload(serverData));
        persisted = await persistEnabledState(persisted, serverData.enabled);

        const nextServer = mergeServerState(persisted, serverData);
        await saveMcpServers((prevServers) => replaceUserServer(prevServers, nextServer));
        await refreshManagedCodexMcpConfig();
        return nextServer;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpImportFailed')));
        return undefined;
      }
    },
    [persistEnabledState, saveMcpServers, t]
  );

  const handleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]) => {
      try {
        const imported = await mcpService.importServers.invoke({
          servers: serversData.map((server) => toBackendMcpPayload(server)),
        });

        const finalServers: IMcpServer[] = [];
        for (const importedServer of imported) {
          const original = serversData.find((server) => server.name === importedServer.name);
          const persisted = await persistEnabledState(importedServer, original?.enabled ?? false);
          finalServers.push(mergeServerState(persisted, original));
        }

        await saveMcpServers((prevServers) => {
          let nextServers = prevServers.filter((server) => server.builtin === true);
          const existingUserServers = prevServers.filter((server) => server.builtin !== true);

          for (const server of existingUserServers) {
            if (!finalServers.some((next) => next.id === server.id || next.name === server.name)) {
              nextServers = [...nextServers, server];
            }
          }

          for (const server of finalServers) {
            nextServers = replaceUserServer(nextServers, server);
          }

          return nextServers;
        });
        await refreshManagedCodexMcpConfig();

        return finalServers;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpImportFailed')));
        return [];
      }
    },
    [persistEnabledState, saveMcpServers, t]
  );

  const handleEditMcpServer = useCallback(
    async (
      editingMcpServer: IMcpServer | undefined,
      serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>
    ): Promise<IMcpServer | undefined> => {
      if (!editingMcpServer) {
        return undefined;
      }

      try {
        let persisted = await mcpService.updateServer.invoke({
          id: editingMcpServer.id,
          data: toBackendMcpPayload(serverData),
        });
        persisted = await persistEnabledState(persisted, serverData.enabled);

        const nextServer = mergeServerState(persisted, {
          ...editingMcpServer,
          ...serverData,
        });
        await saveMcpServers((prevServers) =>
          prevServers.map((server) => (server.id === editingMcpServer.id ? nextServer : server))
        );
        await refreshManagedCodexMcpConfig();

        Message.success(t('settings.mcpImportSuccess'));
        return nextServer;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpImportFailed')));
        return undefined;
      }
    },
    [persistEnabledState, saveMcpServers, t]
  );

  const handleDeleteMcpServer = useCallback(
    async (server: IMcpServer) => {
      try {
        try {
          await mcpService.deleteServer.invoke({ id: server.id });
        } catch (error) {
          if (server.builtin !== true || !isBackendHttpError(error) || error.status !== 404) {
            throw error;
          }
          await deleteLocalBuiltinServer(server);
        }
        if (server.builtin === true) {
          await persistDeletedBuiltinServerName(server.name);
        }
        await saveMcpServers((prevServers) => prevServers.filter((currentServer) => currentServer.id !== server.id));
        await refreshManagedCodexMcpConfig();
        Message.success(t('settings.mcpDeleted'));
        return true;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpDeleteFailed')));
        return false;
      }
    },
    [saveMcpServers, t]
  );

  const handleToggleMcpServer = useCallback(
    async (server: IMcpServer) => {
      if (togglingServers[server.id]) return undefined;

      setTogglingServers((prevTogglingServers) => ({ ...prevTogglingServers, [server.id]: true }));
      try {
        let persisted: IMcpServer;
        try {
          persisted = await mcpService.toggleServer.invoke({ id: server.id });
        } catch (error) {
          if (server.builtin !== true || !isBackendHttpError(error) || error.status !== 404) {
            throw error;
          }
          persisted = await toggleLocalBuiltinServer(server);
        }
        const nextServer = mergeServerState(persisted, server);
        await saveMcpServers((prevServers) =>
          prevServers.map((currentServer) => (currentServer.id === server.id ? nextServer : currentServer))
        );
        await refreshManagedCodexMcpConfig();
        return nextServer;
      } catch (error) {
        Message.error(getMcpRequestErrorMessage(error, t('settings.mcpToggleFailed')));
        return undefined;
      } finally {
        setTogglingServers((prevTogglingServers) => {
          const { [server.id]: _isToggling, ...remainingServers } = prevTogglingServers;
          return remainingServers;
        });
      }
    },
    [saveMcpServers, t, togglingServers]
  );

  return {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
    togglingServers,
  };
};
