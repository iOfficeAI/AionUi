import { AIONUI_FILES_MARKER, AIONUI_TIMESTAMP_REGEX } from '@/common/config/constants';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export const collectSelectedFiles = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): string[] => {
  const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path)).filter(Boolean);
  return Array.from(new Set([...uploadFile, ...atPathFiles]));
};

export const buildDisplayMessage = (input: string, files: string[], workspacePath: string): string => {
  if (!files.length) return input;
  const normalizedWorkspace = workspacePath?.replace(/[\\/]+$/, '');
  const displayPaths = files.map((filePath) => {
    const sanitizedPath = filePath.replace(AIONUI_TIMESTAMP_REGEX, '$1');
    if (!normalizedWorkspace) {
      return sanitizedPath;
    }

    const isAbsolute = filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath);
    if (isAbsolute) {
      // If file is inside workspace, preserve relative path (including subdirectories like uploads/)
      const normalizedFile = filePath.replace(/\\/g, '/');
      const normalizedWorkspaceWithForwardSlash = normalizedWorkspace.replace(/\\/g, '/');
      if (normalizedFile.startsWith(normalizedWorkspaceWithForwardSlash + '/')) {
        const relativePath = normalizedFile.slice(normalizedWorkspaceWithForwardSlash.length + 1);
        return `${normalizedWorkspace}/${relativePath.replace(AIONUI_TIMESTAMP_REGEX, '$1')}`;
      }
      // Keep external absolute paths unchanged so preview and metadata lookups
      // continue to read the real file instead of a non-existent workspace path.
      return sanitizedPath;
    }
    return `${normalizedWorkspace}/${sanitizedPath}`;
  });
  return `${input}\n\n${AIONUI_FILES_MARKER}\n${displayPaths.join('\n')}`;
};
