/**
 * ACP V2 is now always enabled. This hook is kept for backward compatibility
 * so existing SendBox consumers don't need to be rewritten yet.
 *
 * TODO: Remove this hook and inline `true` at all call sites during final cleanup.
 */
export const useAcpV2Enabled = (): boolean => true;
