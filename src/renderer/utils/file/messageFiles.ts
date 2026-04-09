import { AIONUI_FILES_MARKER, AIONUI_TIMESTAMP_REGEX } from '@/common/config/constants';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export const collectSelectedFiles = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): string[] => {
  const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path)).filter(Boolean);
  return Array.from(new Set([...uploadFile, ...atPathFiles]));
};

export const buildDisplayMessage = (input: string, files: string[], workspacePath: string): string => {
  if (!files.length) return input;
  const displayPaths = files.map((filePath) => {
    if (!workspacePath) {
      return filePath.replace(AIONUI_TIMESTAMP_REGEX, '$1');
    }
    const isAbsolute = filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath);
    if (isAbsolute) {
      // If file is inside workspace, preserve relative path (including subdirectories like uploads/)
      const normalizedFile = filePath.replace(/\\/g, '/');
      const normalizedWorkspace = workspacePath.replace(/[\\/]+$/, '').replace(/\\/g, '/');
      if (normalizedFile.startsWith(normalizedWorkspace + '/')) {
        const relativePath = normalizedFile.slice(normalizedWorkspace.length + 1);
        return relativePath.replace(AIONUI_TIMESTAMP_REGEX, '$1');
      }
      // External file outside workspace: use basename only so the marker stays workspace-relative
      const parts = filePath.split(/[\\/]/);
      let fileName = parts[parts.length - 1] || filePath;
      fileName = fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
      return fileName;
    }
    return filePath.replace(AIONUI_TIMESTAMP_REGEX, '$1');
  });
  return `${input}\n\n${AIONUI_FILES_MARKER}\n${displayPaths.join('\n')}`;
};
