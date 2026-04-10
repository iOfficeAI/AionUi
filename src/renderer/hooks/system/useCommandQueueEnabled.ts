import { ipcBridge } from '@/common';
import useSWR from 'swr';

export const COMMAND_QUEUE_ENABLED_SWR_KEY = 'system.commandQueueEnabled';

/**
 * Returns whether the conversation command queue feature is enabled globally.
 */
export const useCommandQueueEnabled = (): boolean => {
  const { data = true } = useSWR(COMMAND_QUEUE_ENABLED_SWR_KEY, () =>
    ipcBridge.systemSettings.getCommandQueueEnabled.invoke()
  );

  return data;
};
