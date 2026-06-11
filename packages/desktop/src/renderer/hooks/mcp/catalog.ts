import { httpRequest } from '@/common/adapter/httpBridge';
import { mcpService } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import type { IMcpServer, IMcpServerTransport, ISessionMcpServer } from '@/common/config/storage';

type BackendMcpTransport = Exclude<IMcpServerTransport, { type: 'streamable_http' }>;

type BackendMcpPayload = {
  name: string;
  description?: string;
  transport: BackendMcpTransport;
  original_json: string;
  builtin?: boolean;
};

const isBuiltinServer = (server: IMcpServer) => server.builtin === true;

const normalizeServerName = (name: string) => name.trim().toLowerCase();

const getCatalogServerKey = (server: Pick<IMcpServer, 'id' | 'name' | 'builtin'>) => {
  const normalizedName = normalizeServerName(server.name);
  if (server.builtin === true) {
    return `builtin:${normalizedName || server.id}`;
  }
  return `user:${normalizedName || server.id}`;
};

const dedupeServers = (servers: IMcpServer[]) => {
  const seen = new Set<string>();
  const deduped: IMcpServer[] = [];

  for (const server of servers) {
    const key = getCatalogServerKey(server);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(server);
  }

  return deduped;
};

const normalizeTransportForBackend = (transport: IMcpServerTransport): BackendMcpTransport => {
  if (transport.type === 'streamable_http') {
    return {
      type: 'http',
      url: transport.url,
      headers: transport.headers,
    };
  }
  return transport;
};

export const toBackendMcpPayload = (
  server: Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>
): BackendMcpPayload => ({
  name: server.name,
  description: server.description,
  transport: normalizeTransportForBackend(server.transport),
  original_json: server.original_json || '{}',
  builtin: Boolean(server.builtin),
});

export const toSessionMcpServer = (server: Pick<IMcpServer, 'id' | 'name' | 'transport'>): ISessionMcpServer => ({
  id: server.id,
  name: server.name,
  transport: server.transport,
});

const toggleImportedEnabledServers = async (servers: IMcpServer[], imported: IMcpServer[]) => {
  const enabledNames = new Set(servers.filter((server) => server.enabled).map((server) => server.name));
  const toggledServers: IMcpServer[] = [];

  for (const server of imported) {
    if (!enabledNames.has(server.name) || server.enabled) {
      toggledServers.push(server);
      continue;
    }

    const toggled = await mcpService.toggleServer.invoke({ id: server.id });
    toggledServers.push(toggled);
  }

  return toggledServers;
};

export const ensureBackendMcpCatalog = async (): Promise<{
  userServers: IMcpServer[];
  builtinServers: IMcpServer[];
  allServers: IMcpServer[];
}> => {
  const settings: Record<string, unknown> =
    (await httpRequest<Record<string, unknown>>('GET', '/api/settings/client').catch(
      () => ({}) as Record<string, unknown>
    )) || {};
  const localServers = Array.isArray(settings['mcp.config'])
    ? (settings['mcp.config'] as IMcpServer[])
    : (configService.get('mcp.config') ?? []);
  const builtinServers = dedupeServers(localServers.filter(isBuiltinServer));
  let userServers = dedupeServers(await mcpService.listServers.invoke());

  if (userServers.length === 0) {
    const legacyUserServers = localServers.filter((server) => !isBuiltinServer(server));
    if (legacyUserServers.length > 0) {
      const imported = await mcpService.importServers.invoke({
        servers: legacyUserServers.map((server) => toBackendMcpPayload(server)),
      });
      await toggleImportedEnabledServers(legacyUserServers, imported);
      userServers = dedupeServers(await mcpService.listServers.invoke());
    }
  }

  const allServers = dedupeServers([...userServers, ...builtinServers]);
  configService.setLocal('mcp.config', allServers);

  return {
    userServers,
    builtinServers,
    allServers,
  };
};
