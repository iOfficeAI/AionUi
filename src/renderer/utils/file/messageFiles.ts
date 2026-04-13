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
      // External file outside workspace: use basename only so the marker stays tied to this workspace
      const parts = sanitizedPath.split(/[\\/]/);
      const fileName = parts[parts.length - 1] || sanitizedPath;
      return `${normalizedWorkspace}/${fileName}`;
    }
    return `${normalizedWorkspace}/${sanitizedPath}`;
  });
  return `${input}\n\n${AIONUI_FILES_MARKER}\n${displayPaths.join('\n')}`;
};
