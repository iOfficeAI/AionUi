import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export const collectSelectedFiles = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): string[] => {
  const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path)).filter(Boolean);
  return Array.from(new Set([...uploadFile, ...atPathFiles]));
};

export const buildDisplayMessage = (input: string, files: string[], workspacePath: string): string => {
  if (!files.length) return input;
  const normalizedWorkspace = workspacePath?.replace(/[\\/]+$/, '');
  const displayPaths = files.map((filePath) => {
    // Keep the on-disk filename (including any `_aionui_<ts>` collision suffix) so that
    // FilePreview can resolve the marker path to the real file when rendering the chat
    // history bubble. Cleaning the suffix is a display-only concern handled by
    // FilePreview via getCleanFileName().
    if (!normalizedWorkspace) {
      return filePath;
    }

    const isAbsolute = filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath);
    if (isAbsolute) {
      // If file is inside workspace, preserve the relative path (incl. subdirs like uploads/).
      const normalizedFile = filePath.replace(/\\/g, '/');
      const normalizedWorkspaceWithForwardSlash = normalizedWorkspace.replace(/\\/g, '/');
      if (normalizedFile.startsWith(normalizedWorkspaceWithForwardSlash + '/')) {
        const relativePath = normalizedFile.slice(normalizedWorkspaceWithForwardSlash.length + 1);
        return `${normalizedWorkspace}/${relativePath}`;
      }
      // External file outside the workspace (e.g. cache-dir upload for non-Gemini agents):
      // keep the absolute path verbatim so MessagetText's FilePreview can still load it.
      // The conversationBridge rewrites these markers with canonical paths after any
      // workspace copy step, so the optimistic marker just needs to point at something real.
      return filePath;
    }
    return `${normalizedWorkspace}/${filePath}`;
  });
  return `${input}\n\n${AIONUI_FILES_MARKER}\n${displayPaths.join('\n')}`;
};
