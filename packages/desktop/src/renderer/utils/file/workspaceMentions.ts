import type { IWorkspaceFlatFile } from '@/common/adapter/ipcBridge';
import { localFileRef } from '@/common/types/chatFile';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

const DEFAULT_MENTION_RESULT_LIMIT = 8;

/**
 * Map a workspace flat-file listing entry to a send-box `@`-mention item.
 *
 * This is the LEGACY loading-window fallback source (used only while the
 * project's pe roots are unresolved, so `fs/search` project-ref items are not
 * available yet — see useProjectMentionSearch). Each item is tagged with a
 * `local` chat-ref carrying the backend-machine absolute path (`fullPath`).
 * Without the ref, `collectChatFileRefs` falls back to an `upload` ref and the
 * backend rejects the workspace path as outside its managed upload dir → 400
 * (ELECTRON-3TG). `local` is sent as-is and canonicalized by the backend
 * (handles Windows verbatim `\\?\`), so no front-end prefix stripping is needed.
 */
export const workspaceMentionItemFromListing = (item: IWorkspaceFlatFile): FileOrFolderItem => ({
  path: item.fullPath,
  name: item.name,
  isFile: true,
  relativePath: item.relativePath || undefined,
  chatRef: localFileRef(item.fullPath),
});

function normalizeSearchValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function getItemNameSearchValue(item: FileOrFolderItem): string {
  return normalizeSearchValue(item.name || item.relativePath || item.path);
}

function getItemPathSearchValue(item: FileOrFolderItem): string {
  return normalizeSearchValue(item.relativePath || item.path || item.name);
}

function computeMentionScore(item: FileOrFolderItem, query: string): number {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return 0;
  }

  const normalizedName = getItemNameSearchValue(item);
  const normalizedPath = getItemPathSearchValue(item);
  if (!normalizedName && !normalizedPath) {
    return -1;
  }

  const normalizedStem = normalizedName.replace(/\.[^.]+$/, '');

  if (normalizedName === normalizedQuery) {
    return 400;
  }
  if (normalizedStem === normalizedQuery) {
    return 350;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 300;
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 200;
  }
  if (normalizedPath.startsWith(normalizedQuery)) {
    return 100;
  }
  if (normalizedPath.includes(normalizedQuery)) {
    return 50;
  }

  return -1;
}

export function filterWorkspaceMentionItems(
  items: FileOrFolderItem[],
  query: string,
  limit = DEFAULT_MENTION_RESULT_LIMIT
): FileOrFolderItem[] {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return [];
  }
  const scored = items
    .map((item) => ({
      item,
      score: computeMentionScore(item, normalizedQuery),
    }))
    .filter((entry) => (normalizedQuery ? entry.score >= 0 : true))
    .toSorted((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftPath = left.item.relativePath || left.item.path || left.item.name || '';
      const rightPath = right.item.relativePath || right.item.path || right.item.name || '';
      return leftPath.localeCompare(rightPath);
    });

  return scored.slice(0, limit).map((entry) => entry.item);
}
