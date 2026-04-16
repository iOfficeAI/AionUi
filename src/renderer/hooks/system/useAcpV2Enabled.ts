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

/**
 * Backward-compat alias: command queue is enabled when ACP V2 is on.
 * Existing SendBox consumers import this — no need to update them all now.
 */
// export const ACP_V2_ENABLED_SWR_KEY = ACP_V2_ENABLED_SWR_KEY;
// export const useAcpV2Enabled = useAcpV2Enabled;
