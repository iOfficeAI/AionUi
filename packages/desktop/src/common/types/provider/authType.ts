/**
 * Authentication modes used by provider configuration and API clients.
 * Values are persisted, so they must remain stable.
 */
export const AuthType = {
  LOGIN_WITH_GOOGLE: 'oauth-personal',
  USE_GEMINI: 'gemini-api-key',
  USE_VERTEX_AI: 'vertex-ai',
  LEGACY_CLOUD_SHELL: 'cloud-shell',
  COMPUTE_ADC: 'compute-default-credentials',
  USE_OPENAI: 'openai',
  USE_ANTHROPIC: 'anthropic',
  USE_BEDROCK: 'bedrock',
} as const;

export type AuthType = (typeof AuthType)[keyof typeof AuthType];
