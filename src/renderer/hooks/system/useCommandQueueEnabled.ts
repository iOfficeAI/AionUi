import { ACP_V2_ENABLED_SWR_KEY, useAcpV2Enabled } from './useAcpV2Enabled';

/**
 * Backward-compat alias: command queue is enabled when ACP V2 is on.
 * Existing SendBox consumers import this — no need to update them all now.
 */
export const COMMAND_QUEUE_ENABLED_SWR_KEY = ACP_V2_ENABLED_SWR_KEY;
export const useCommandQueueEnabled = useAcpV2Enabled;
