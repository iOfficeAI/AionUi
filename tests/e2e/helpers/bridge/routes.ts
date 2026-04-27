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

/**
 * Mapping from legacy dotted IPC keys to aionui-backend HTTP routes.
 * Only keys actually used by E2E tests are listed — unknown keys fall through
 * to the legacy IPC bridge.
 */
export const HTTP_ROUTES: Record<string, HttpRoute> = {
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
    mapBody: (p) => p.agent,
  },
  'team.ensure-session': {
    method: 'POST',
    path: (p) => `/api/teams/${encodeURIComponent(String(p.team_id))}/session`,
  },
  'database.get-conversation-messages': {
    method: 'GET',
    path: (p) => {
      const qs = new URLSearchParams();
      qs.set('page', String(p.page ?? 1));
      qs.set('page_size', String(p.page_size ?? 50));
      if (p.order) qs.set('order', String(p.order));
      return `/api/conversations/${encodeURIComponent(String(p.conversation_id))}/messages?${qs.toString()}`;
    },
  },
  // Workspace / file-system routes (aionui-backend, --local mode: no auth).
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
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'word-preview.stop': {
    method: 'POST',
    path: '/api/word-preview/stop',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'excel-preview.start': {
    method: 'POST',
    path: '/api/excel-preview/start',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'excel-preview.stop': {
    method: 'POST',
    path: '/api/excel-preview/stop',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'ppt-preview.start': {
    method: 'POST',
    path: '/api/ppt-preview/start',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'ppt-preview.stop': {
    method: 'POST',
    path: '/api/ppt-preview/stop',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath }),
  },
  'document.convert': {
    method: 'POST',
    path: '/api/document/convert',
    mapBody: (p) => ({ file_path: p.file_path ?? p.filePath, to: p.to }),
  },
  'preview-history.list': { method: 'POST', path: '/api/preview-history/list' },
  'preview-history.save': { method: 'POST', path: '/api/preview-history/save' },
  'preview-history.get-content': { method: 'POST', path: '/api/preview-history/get-content' },
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
