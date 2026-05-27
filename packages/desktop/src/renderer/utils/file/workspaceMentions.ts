import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

const DEFAULT_MENTION_RESULT_LIMIT = 8;

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
