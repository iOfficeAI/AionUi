import { useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer } from '@/common/config/storage';
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

export const useMcpServerCRUD = (
  saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>
) => {
  const { t } = useTranslation();

  const persistEnabledState = useCallback(async (server: IMcpServer, enabled: boolean) => {
    if (server.enabled === enabled) {
      return server;
    }

    return mcpService.toggleServer.invoke({ id: server.id });
  }, []);

  const handleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>) => {
      let persisted = await mcpService.createServer.invoke(toBackendMcpPayload(serverData));
      persisted = await persistEnabledState(persisted, serverData.enabled);

      const nextServer = mergeServerState(persisted, serverData);
      await saveMcpServers((prevServers) => replaceUserServer(prevServers, nextServer));
      return nextServer;
    },
    [persistEnabledState, saveMcpServers]
  );

  const handleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>[]) => {
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

      return finalServers;
    },
    [persistEnabledState, saveMcpServers]
  );

  const handleEditMcpServer = useCallback(
    async (
      editingMcpServer: IMcpServer | undefined,
      serverData: Omit<IMcpServer, 'id' | 'created_at' | 'updated_at'>
    ): Promise<IMcpServer | undefined> => {
      if (!editingMcpServer) {
        return undefined;
      }

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

      Message.success(t('settings.mcpImportSuccess'));
      return nextServer;
    },
    [persistEnabledState, saveMcpServers, t]
  );

  const handleDeleteMcpServer = useCallback(
    async (serverId: string) => {
      await mcpService.deleteServer.invoke({ id: serverId });
      await saveMcpServers((prevServers) => prevServers.filter((server) => server.id !== serverId));
      Message.success(t('settings.mcpDeleted'));
    },
    [saveMcpServers, t]
  );

  return {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
  };
};
