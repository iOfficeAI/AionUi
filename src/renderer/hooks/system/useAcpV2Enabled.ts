import { ipcBridge } from '@/common';
import useSWR from 'swr';

export const ACP_V2_ENABLED_SWR_KEY = 'system.acpV2Enabled';

/**
 * Whether AionUi ACP 2.0 is enabled.
 * When true, also implies command queue is enabled.
 */
export const useAcpV2Enabled = (): boolean => {
  const { data = false } = useSWR(ACP_V2_ENABLED_SWR_KEY, () => ipcBridge.systemSettings.getAcpV2Enabled.invoke());
  return data;
};
