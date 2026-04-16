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
  const envVal = process.env.AION_ACP_V2?.toLowerCase() ?? '';
  if (ENV_OVERRIDE.has(envVal)) {
    console.log(`[ACP Feature Flag] V2 enabled via env var AION_ACP_V2=${process.env.AION_ACP_V2}`);
    return true;
  }
  const stored = await ProcessConfig.get('system.acpV2Enabled');
  const result = stored ?? false;
  console.log(`[ACP Feature Flag] V2 '${result ? 'enabled' : 'disabled'}' via setting (system.acpV2Enabled=${stored})`);
  return result;
}
