/**
 * Response/request shape translators between the backend's snake_case DTOs
 * and the legacy camelCase IPC contract our tests assert against.
 *
 * Keeping these as plain Node helpers (not page-evaluated strings) means
 * they're unit-testable and don't require a browser context.
 */

export type ResponseMapperKey =
  | 'dirOrFileTree'
  | 'flatFileList'
  | 'snapshotCompare'
  | 'renameResult'
  | 'previewSnapshotInfo'
  | 'previewSnapshotContent'
  | 'conversation';

type DirOrFileRaw = {
  name: string;
  full_path?: string;
  fullPath?: string;
  relative_path?: string;
  relativePath?: string;
  is_dir?: boolean;
  isDir?: boolean;
  is_file?: boolean;
  isFile?: boolean;
  children?: DirOrFileRaw[];
};

function mapDirOrFile(entry: DirOrFileRaw): Record<string, unknown> {
  return {
    ...entry,
    fullPath: entry.full_path ?? entry.fullPath,
    relativePath: entry.relative_path ?? entry.relativePath,
    isDir: entry.is_dir ?? entry.isDir,
    isFile: entry.is_file ?? entry.isFile,
    children: Array.isArray(entry.children) ? entry.children.map(mapDirOrFile) : entry.children,
  };
}

function mapFlatFile(entry: Record<string, unknown>): Record<string, unknown> {
  return {
    ...entry,
    fullPath: (entry.full_path as string | undefined) ?? (entry.fullPath as string | undefined),
    relativePath: (entry.relative_path as string | undefined) ?? (entry.relativePath as string | undefined),
  };
}

function mapFileChange(entry: Record<string, unknown>): Record<string, unknown> {
  return {
    ...entry,
    filePath: (entry.file_path as string | undefined) ?? (entry.filePath as string | undefined),
    relativePath: (entry.relative_path as string | undefined) ?? (entry.relativePath as string | undefined),
  };
}

function mapConversation(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as Record<string, unknown>;
  const extra = d.extra as Record<string, unknown> | undefined;
  const rawTeamMcp =
    (extra?.team_mcp_stdio_config as Record<string, unknown> | undefined) ??
    (extra?.teamMcpStdioConfig as Record<string, unknown> | undefined);
  const teamMcpStdioConfig = rawTeamMcp
    ? {
        ...rawTeamMcp,
        env: [
          { name: 'TEAM_MCP_PORT', value: String(rawTeamMcp.port ?? '') },
          { name: 'TEAM_MCP_TOKEN', value: String(rawTeamMcp.token ?? '') },
          { name: 'TEAM_AGENT_SLOT_ID', value: String(rawTeamMcp.slot_id ?? rawTeamMcp.slotId ?? '') },
        ].filter((entry) => entry.value.length > 0),
      }
    : undefined;

  return {
    ...d,
    model:
      d.model && typeof d.model === 'object'
        ? {
            ...(d.model as Record<string, unknown>),
            id:
              ((d.model as Record<string, unknown>).provider_id as string | undefined) ??
              ((d.model as Record<string, unknown>).id as string | undefined),
            use_model:
              ((d.model as Record<string, unknown>).use_model as string | undefined) ??
              ((d.model as Record<string, unknown>).model as string | undefined),
          }
        : d.model,
    extra:
      extra && typeof extra === 'object'
        ? {
            ...extra,
            teamMcpStdioConfig,
            custom_workspace:
              (extra.custom_workspace as boolean | undefined) ??
              (typeof extra.workspace === 'string' &&
                extra.workspace.length > 0 &&
                extra.is_temporary_workspace !== true),
          }
        : extra,
  };
}

export const RESPONSE_MAPPERS: Record<ResponseMapperKey, (data: unknown) => unknown> = {
  dirOrFileTree: (data) => (Array.isArray(data) ? data.map(mapDirOrFile) : data),
  flatFileList: (data) => (Array.isArray(data) ? data.map((e) => mapFlatFile(e as Record<string, unknown>)) : data),
  snapshotCompare: (data) => {
    if (!data || typeof data !== 'object') return data;
    const d = data as { staged?: unknown; unstaged?: unknown };
    return {
      staged: Array.isArray(d.staged) ? d.staged.map((e) => mapFileChange(e as Record<string, unknown>)) : [],
      unstaged: Array.isArray(d.unstaged) ? d.unstaged.map((e) => mapFileChange(e as Record<string, unknown>)) : [],
    };
  },
  renameResult: (data) => {
    if (!data || typeof data !== 'object') return data;
    const d = data as Record<string, unknown>;
    return {
      ...d,
      newPath: (d.new_path as string | undefined) ?? (d.newPath as string | undefined),
    };
  },
  previewSnapshotInfo: (data) => {
    if (Array.isArray(data)) {
      return data.map((entry) => RESPONSE_MAPPERS.previewSnapshotInfo(entry));
    }
    if (!data || typeof data !== 'object') return data;
    const d = data as Record<string, unknown>;
    return {
      ...d,
      contentType: (d.content_type as string | undefined) ?? (d.contentType as string | undefined),
    };
  },
  previewSnapshotContent: (data) => {
    if (!data || typeof data !== 'object') return data;
    const d = data as Record<string, unknown>;
    const snapshot = d.snapshot as Record<string, unknown> | undefined;
    return {
      ...d,
      snapshot: snapshot
        ? {
            ...snapshot,
            contentType: (snapshot.content_type as string | undefined) ?? (snapshot.contentType as string | undefined),
          }
        : snapshot,
    };
  },
  conversation: (data) => mapConversation(data),
};
