import { describe, expect, it } from 'vitest';

import {
  COMMAND_EVE_DEFAULT_ACP_BACKEND,
  COMMAND_EVE_DEFAULT_ACP_MODEL_ID,
  COMMAND_EVE_EGRESS_PROXY_OPENAI_BASE_URL,
  COMMAND_EVE_LOCAL_RUNTIME_PROVIDER_ID,
  COMMAND_EVE_LOCAL_MODEL_TIERS,
  COMMAND_EVE_SHELL_ENABLED,
  getCommandEveAcpModelIdForTier,
  getCommandEveDefaultAcpModelId,
  getCommandEveDefaultAcpModelIdForTier,
  getCommandEveLocalAcpModelInfo,
  getCommandEveLocalAcpModelInfoForTier,
  getCommandEveLocalRuntimeProvider,
  isCommandEveAcpConversation,
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

  it('exposes Command EVE local model tiers as Hermes ACP model metadata before handshake', () => {
    const modelInfo = getCommandEveLocalAcpModelInfo('hermes');
    expect(modelInfo?.current_model_id).toBe(COMMAND_EVE_DEFAULT_ACP_MODEL_ID);
    expect(modelInfo?.current_model_label).toBe('Gemma 4 E4B');
    expect(modelInfo?.available_models).toEqual([
      { id: 'custom:command-eve-gemma4-e4b-64k:latest', label: 'Gemma 4 E4B' },
      { id: 'custom:command-eve-gemma4-12b-64k:latest', label: 'Gemma 4 12B' },
      { id: 'custom:command-eve-gemma4-31b-64k:latest', label: 'Gemma 4 31B' },
    ]);
    expect(getCommandEveLocalAcpModelInfo('codex')).toBeUndefined();
  });

  it('can expose a non-default Command EVE tier as the selected ACP model', () => {
    const modelInfo = getCommandEveLocalAcpModelInfoForTier('hermes', 'gemma-4-12b-local-planning');
    expect(modelInfo?.current_model_id).toBe('custom:command-eve-gemma4-12b-64k:latest');
    expect(modelInfo?.current_model_label).toBe('Gemma 4 12B');
  });

  it('creates a loopback provider identity for the selected local EVE tier', () => {
    const provider = getCommandEveLocalRuntimeProvider('gemma-4-12b-local-planning');
    expect(provider.id).toBe(COMMAND_EVE_LOCAL_RUNTIME_PROVIDER_ID);
    expect(provider.name).toBe('Command EVE Local Runtime');
    expect(provider.base_url).toBe(COMMAND_EVE_EGRESS_PROXY_OPENAI_BASE_URL);
    expect(provider.api_key).toBe('command-eve-local-loopback');
    expect(provider.use_model).toBe('custom:command-eve-gemma4-12b-64k:latest');
    expect(provider.context_limit).toBe(65_536);
  });

  describe('isCommandEveAcpConversation', () => {
    // The unit test runner does not set AIONUI_UPSTREAM_MODE=1, so the EVE shell
    // is enabled and the helper keys purely off the backend being Hermes.
    it('runs with the EVE shell enabled in this test env', () => {
      expect(COMMAND_EVE_SHELL_ENABLED).toBe(true);
    });

    it('detects the Hermes (EVE) backend as a Command EVE conversation', () => {
      expect(isCommandEveAcpConversation('hermes')).toBe(true);
      expect(isCommandEveAcpConversation(COMMAND_EVE_DEFAULT_ACP_BACKEND)).toBe(true);
    });

    it('rejects every other CLI/agent backend so they keep the raw model picker', () => {
      expect(isCommandEveAcpConversation('codex')).toBe(false);
      expect(isCommandEveAcpConversation('claude')).toBe(false);
      expect(isCommandEveAcpConversation('gemini')).toBe(false);
      expect(isCommandEveAcpConversation('aionrs')).toBe(false);
      expect(isCommandEveAcpConversation(undefined)).toBe(false);
      expect(isCommandEveAcpConversation(null)).toBe(false);
      expect(isCommandEveAcpConversation('')).toBe(false);
    });
  });
});
