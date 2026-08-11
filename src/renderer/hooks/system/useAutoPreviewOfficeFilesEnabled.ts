import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { ipcBridge } from '@/common';
import useSWR from 'swr';

export const AUTO_PREVIEW_OFFICE_FILES_SWR_KEY = 'system.autoPreviewOfficeFiles';

const OFFICE_AUTO_PREVIEW_TRIGGER_TYPES = new Set(['tool_group', 'tool_call', 'acp_tool_call', 'codex_tool_call']);

export const isOfficeAutoPreviewTriggerMessage = (message: Pick<IResponseMessage, 'type'>): boolean =>
  OFFICE_AUTO_PREVIEW_TRIGGER_TYPES.has(message.type);

export const findNewOfficeFiles = (currentFiles: string[], knownFiles: Set<string>): string[] =>
  currentFiles.filter((filePath) => !knownFiles.has(filePath));

/**
 * Returns whether auto-preview for newly created Office files is enabled globally.
 */
export const useAutoPreviewOfficeFilesEnabled = (): boolean => {
  const { data = true } = useSWR(AUTO_PREVIEW_OFFICE_FILES_SWR_KEY, () =>
    ipcBridge.systemSettings.getAutoPreviewOfficeFiles.invoke()
  );

  return data;
};
