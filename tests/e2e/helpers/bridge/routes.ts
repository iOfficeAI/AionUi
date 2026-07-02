import type { ResponseMapperKey } from './mappers';

export type HttpRoute = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string | ((params: Record<string, unknown>) => string);
  mapBody?: (params: Record<string, unknown>) => unknown;
  /**
   * Optional response mapper key — translates snake_case backend fields to
   * the camelCase shapes our legacy IPC contract exposed, so test assertions
   * can stay idiomatic TypeScript.
   */
  mapResponse?: ResponseMapperKey;
};

function mapPreviewHistoryTarget(target: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!target) return target;
  return {
    ...target,
    content_type: target.content_type ?? target.contentType,
    file_path: target.file_path ?? target.filePath,
  };
}

/**
 * Mapping from legacy dotted IPC keys to aioncore HTTP routes.
 * Only keys actually used by E2E tests are listed — unknown keys fall through
 * to the legacy IPC bridge.
 */
export const HTTP_ROUTES: Record<string, HttpRoute> = {
  'cron.list-jobs': {
    method: 'GET',
    path: '/api/cron/jobs',
  },
  'cron.get-job': {
    method: 'GET',
    path: (p) => `/api/cron/jobs/${encodeURIComponent(String(p.job_id))}`,
  },
  'cron.remove-job': {
    method: 'DELETE',
    path: (p) => `/api/cron/jobs/${encodeURIComponent(String(p.job_id))}`,
  },
  'cron.run-now': {
    method: 'POST',
    path: (p) => `/api/cron/jobs/${encodeURIComponent(String(p.job_id))}/run`,
  },
  'team.list': {
    method: 'GET',
    path: (p) => `/api/teams?user_id=${encodeURIComponent(String(p.user_id ?? ''))}`,
  },
  'team.create': { method: 'POST', path: '/api/teams' },
  'team.get': {
    method: 'GET',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.id))}`,
  },
  'team.remove': {
    method: 'DELETE',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.id))}`,
  },
  'team.add-agent': {
    method: 'POST',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.team_id))}/agents`,
    mapBody: (p) => ({ assistant: p.agent ?? p.assistant }),
  },
  'team.ensure-session': {
    method: 'POST',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.team_id))}/session`,
  },
  'team.send-message': {
    method: 'POST',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.team_id))}/messages`,
    mapBody: (p) => ({
      content: p.input,
      files: p.files,
    }),
  },
  'get-conversation': {
    method: 'GET',
    path: (p) => `/api/conversations/${encodeURIComponent(String(p.id))}`,
    mapResponse: 'conversation',
  },
  'database.get-conversation-messages': {
    method: 'GET',
    path: (p) => {
      const qs = new URLSearchParams();
      const limit = p.limit ?? p.page_size ?? p.pageSize;
      if (limit) qs.set('limit', String(limit));
      if (p.before) qs.set('before', String(p.before));
      if (p.after) qs.set('after', String(p.after));
      if (p.anchor_message_id) qs.set('anchor_message_id', String(p.anchor_message_id));
      if (p.content_mode) qs.set('content_mode', String(p.content_mode));
      return `/api/conversations/${encodeURIComponent(String(p.conversation_id))}/messages?${qs.toString()}`;
    },
  },
  // Workspace / file-system routes (aioncore, --local mode: no auth).
  // mapResponse translates snake_case → camelCase so test assertions stay
  // in idiomatic TS.
  'fs.dir': { method: 'POST', path: '/api/fs/dir', mapResponse: 'dirOrFileTree' },
  'fs.list': { method: 'POST', path: '/api/fs/list', mapResponse: 'flatFileList' },
  'fs.read': { method: 'POST', path: '/api/fs/read' },
  'fs.write': { method: 'POST', path: '/api/fs/write' },
  'fs.rename': { method: 'POST', path: '/api/fs/rename', mapResponse: 'renameResult' },
  'fs.remove': { method: 'POST', path: '/api/fs/remove' },
  'fs.metadata': { method: 'POST', path: '/api/fs/metadata' },
  // Office preview — officecli watch-server lifecycle.
  'word-preview.start': {
    method: 'POST',
    path: '/api/word-preview/start',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath, workspace: p.workspace }),
  },
  'word-preview.stop': {
    method: 'POST',
    path: '/api/word-preview/stop',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'excel-preview.start': {
    method: 'POST',
    path: '/api/excel-preview/start',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath, workspace: p.workspace }),
  },
  'excel-preview.stop': {
    method: 'POST',
    path: '/api/excel-preview/stop',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'ppt-preview.start': {
    method: 'POST',
    path: '/api/ppt-preview/start',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath, workspace: p.workspace }),
  },
  'ppt-preview.stop': {
    method: 'POST',
    path: '/api/ppt-preview/stop',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'document.convert': {
    method: 'POST',
    path: '/api/document/convert',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath, to: p.to, workspace: p.workspace }),
  },
  'preview-history.list': {
    method: 'POST',
    path: '/api/preview-history/list',
    mapBody: (p) => ({ target: mapPreviewHistoryTarget(p.target as Record<string, unknown> | undefined) }),
    mapResponse: 'previewSnapshotInfo',
  },
  'preview-history.save': {
    method: 'POST',
    path: '/api/preview-history/save',
    mapBody: (p) => ({
      target: mapPreviewHistoryTarget(p.target as Record<string, unknown> | undefined),
      content: p.content,
    }),
    mapResponse: 'previewSnapshotInfo',
  },
  'preview-history.get-content': {
    method: 'POST',
    path: '/api/preview-history/get-content',
    mapBody: (p) => ({
      target: mapPreviewHistoryTarget(p.target as Record<string, unknown> | undefined),
      snapshot_id: p.snapshot_id ?? p.snapshotId,
    }),
    mapResponse: 'previewSnapshotContent',
  },
  // File snapshot — git-backed staging/compare/discard for workspace changes.
  'fs.snapshot.init': { method: 'POST', path: '/api/fs/snapshot/init' },
  'fs.snapshot.info': { method: 'POST', path: '/api/fs/snapshot/info' },
  'fs.snapshot.compare': {
    method: 'POST',
    path: '/api/fs/snapshot/compare',
    mapResponse: 'snapshotCompare',
  },
  'fs.snapshot.stage': { method: 'POST', path: '/api/fs/snapshot/stage' },
  'fs.snapshot.stage-all': { method: 'POST', path: '/api/fs/snapshot/stage-all' },
  'fs.snapshot.unstage': { method: 'POST', path: '/api/fs/snapshot/unstage' },
  'fs.snapshot.unstage-all': { method: 'POST', path: '/api/fs/snapshot/unstage-all' },
  'fs.snapshot.discard': { method: 'POST', path: '/api/fs/snapshot/discard' },
  'fs.snapshot.reset': { method: 'POST', path: '/api/fs/snapshot/reset' },
  'fs.snapshot.branches': { method: 'POST', path: '/api/fs/snapshot/branches' },
  'fs.snapshot.dispose': { method: 'POST', path: '/api/fs/snapshot/dispose' },
};
