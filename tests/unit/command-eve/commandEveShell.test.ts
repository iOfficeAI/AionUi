import { describe, expect, it } from 'vitest';

import {
  COMMAND_EVE_DEFAULT_ACP_BACKEND,
  COMMAND_EVE_DEFAULT_ACP_MODEL_ID,
  COMMAND_EVE_LOCAL_MODEL_TIERS,
  getCommandEveAcpModelIdForTier,
  getCommandEveDefaultAcpModelId,
  getCommandEveDefaultAcpModelIdForTier,
  normalizeCommandEveLocalModelTierId,
} from '@/common/config/commandEveShell';

describe('commandEveShell', () => {
  it('pins the Command EVE Hermes default to the local E4B 64k model', () => {
    expect(COMMAND_EVE_DEFAULT_ACP_BACKEND).toBe('hermes');
    expect(COMMAND_EVE_DEFAULT_ACP_MODEL_ID).toBe('custom:command-eve-gemma4-e4b-64k:latest');
    expect(getCommandEveDefaultAcpModelId('hermes')).toBe(COMMAND_EVE_DEFAULT_ACP_MODEL_ID);
  });

  it('does not override non-Hermes ACP backends', () => {
    expect(getCommandEveDefaultAcpModelId('codex')).toBeUndefined();
    expect(getCommandEveDefaultAcpModelId('claude')).toBeUndefined();
  });

  it('exposes local Gemma tiers for the Command EVE model settings surface', () => {
    expect(COMMAND_EVE_LOCAL_MODEL_TIERS.map((tier) => tier.modelRef)).toEqual([
      'gemma4:e4b',
      'gemma4:12b',
      'gemma4:31b',
    ]);
    expect(COMMAND_EVE_LOCAL_MODEL_TIERS[0].state).toBe('default');
    expect(COMMAND_EVE_LOCAL_MODEL_TIERS[1].state).toBe('opt_in');
  });

  it('maps the selected local tier to the Hermes ACP model id', () => {
    const planningTier = 'gemma-4-12b-local-planning';
    expect(normalizeCommandEveLocalModelTierId(planningTier)).toBe(planningTier);
    expect(getCommandEveAcpModelIdForTier(planningTier)).toBe('custom:command-eve-gemma4-12b-64k:latest');
    expect(getCommandEveDefaultAcpModelIdForTier('hermes', planningTier)).toBe(
      'custom:command-eve-gemma4-12b-64k:latest'
    );
    expect(getCommandEveDefaultAcpModelIdForTier('codex', planningTier)).toBeUndefined();
    expect(normalizeCommandEveLocalModelTierId('missing')).toBe(COMMAND_EVE_LOCAL_MODEL_TIERS[0].id);
  });
});
