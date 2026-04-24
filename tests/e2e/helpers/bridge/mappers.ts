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
  | 'previewSnapshotList'
  | 'snapshotContent';

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

function mapPreviewSnapshot(snap: Record<string, unknown>): Record<string, unknown> {
  return {
    ...snap,
    createdAt: (snap.created_at as number | undefined) ?? (snap.createdAt as number | undefined),
    contentType: (snap.content_type as string | undefined) ?? (snap.contentType as string | undefined),
    fileName: (snap.file_name as string | undefined) ?? (snap.fileName as string | undefined),
    filePath: (snap.file_path as string | undefined) ?? (snap.filePath as string | undefined),
  };
}

/**
 * Normalize a PreviewHistoryTarget-like object to the snake_case shape the
 * backend DTO expects. Accepts either camelCase (legacy) or snake_case input
 * and always emits snake_case.
 */
export function normalizePreviewTarget(target: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!target || typeof target !== 'object') return {};
  const t = target;
  const out: Record<string, unknown> = {};
  const pass = (snake: string, camel: string) => {
    const v = (t[snake] ?? t[camel]) as unknown;
    if (v !== undefined) out[snake] = v;
  };
  pass('content_type', 'contentType');
  pass('file_path', 'filePath');
  pass('workspace', 'workspace');
  pass('file_name', 'fileName');
  pass('title', 'title');
  pass('language', 'language');
  pass('conversation_id', 'conversationId');
  return out;
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
  previewSnapshotInfo: (data) =>
    data && typeof data === 'object' ? mapPreviewSnapshot(data as Record<string, unknown>) : data,
  previewSnapshotList: (data) =>
    Array.isArray(data) ? data.map((e) => mapPreviewSnapshot(e as Record<string, unknown>)) : data,
  snapshotContent: (data) => {
    if (!data || typeof data !== 'object') return data;
    const d = data as { snapshot?: unknown };
    return {
      ...(data as Record<string, unknown>),
      snapshot:
        d.snapshot && typeof d.snapshot === 'object'
          ? mapPreviewSnapshot(d.snapshot as Record<string, unknown>)
          : d.snapshot,
    };
  },
};
