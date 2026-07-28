import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export const collectSelectedFiles = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): string[] => {
  const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path)).filter(Boolean);
  return Array.from(new Set([...uploadFile, ...atPathFiles]));
};

export const buildDisplayMessage = (input: string, files: string[], workspacePath: string): string => {
  if (!files.length) return input;
  const normalizedWorkspace = workspacePath?.replace(/[\\/]+$/, '');
  const messagePaths = files.map((file_path) => {
    if (!normalizedWorkspace) {
      return file_path;
    }

    const isAbsolute = file_path.startsWith('/') || /^[A-Za-z]:/.test(file_path);
    if (isAbsolute) {
      // Keep exact on-disk paths in the marker. The backend reads these paths to
      // attach binary inputs (including images), so display-only cleanup would
      // point it at files that do not exist.
      return file_path;
    }
    return `${normalizedWorkspace}/${file_path}`;
  });
  return `${input}\n\n${AIONUI_FILES_MARKER}\n${messagePaths.join('\n')}`;
};
