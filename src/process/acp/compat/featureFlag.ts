// src/process/acp/compat/featureFlag.ts
const ENABLED_VALUES = new Set(['1', 'true']);

export function isAcpV2Enabled(): boolean {
  return ENABLED_VALUES.has(process.env.AION_ACP_V2?.toLowerCase() ?? '');
}
