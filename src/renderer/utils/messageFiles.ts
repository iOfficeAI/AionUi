import { AIONUI_FILES_MARKER, AIONUI_TIMESTAMP_REGEX } from '@/common/constants';
import type { FileOrFolderItem } from '@/renderer/types/files';

export const collectSelectedFiles = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): string[] => {
  const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path)).filter(Boolean);
  return Array.from(new Set([...uploadFile, ...atPathFiles]));
};

export const buildDisplayMessage = (input: string, files: string[], workspacePath: string): string => {
  if (!files.length) return input;
  const displayPaths = files.map((filePath) => {
    if (!workspacePath) return filePath;
    const isAbsolute = filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath);
    if (isAbsolute) {
      const parts = filePath.split(/[\\/]/);
      let fileName = parts[parts.length - 1] || filePath;
      fileName = fileName.replace(AIONUI_TIMESTAMP_REGEX, '$1');
      return `${workspacePath}/${fileName}`;
    }
    return `${workspacePath}/${filePath}`;
  });
  return `${input}\n\n${AIONUI_FILES_MARKER}\n${displayPaths.join('\n')}`;
};
