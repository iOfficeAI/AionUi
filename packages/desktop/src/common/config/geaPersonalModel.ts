/**
 * Provider ids with this prefix are owned by the signed-in user's GEA
 * personal-model authorization. The renderer may toggle them, but must not
 * expose edit or delete operations.
 */
export const GEA_PERSONAL_PROVIDER_PREFIX = 'gea-personal-';

export function isGeaPersonalProvider(provider: { id: string }): boolean {
  return provider.id.startsWith(GEA_PERSONAL_PROVIDER_PREFIX);
}
