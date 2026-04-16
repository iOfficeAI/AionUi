import { ProcessConfig } from '@process/utils/initStorage';

const ENV_OVERRIDE = new Set(['1', 'true']);

/**
 * Check if ACP V2 is enabled.
 *
 * Priority:
 *   1. AION_ACP_V2 env var (dev override, sync)
 *   2. system.acpV2Enabled persisted setting (user toggle)
 *
 * When ACP V2 is enabled, command queue is also implicitly enabled.
 */
export async function isAcpV2Enabled(): Promise<boolean> {
  // Dev override via env var (no storage access needed)
  if (ENV_OVERRIDE.has(process.env.AION_ACP_V2?.toLowerCase() ?? '')) {
    return true;
  }
  const stored = await ProcessConfig.get('system.acpV2Enabled');
  return stored ?? false;
}
