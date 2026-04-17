// tests/unit/process/acp/session/ConfigTracker.test.ts

import { describe, it, expect } from 'vitest';
import { ConfigTracker } from '@process/acp/session/ConfigTracker';

describe('ConfigTracker', () => {
  it('starts with null current values', () => {
    const ct = new ConfigTracker();
    expect(ct.modelSnapshot().currentModelId).toBeNull();
    expect(ct.modeSnapshot().currentModeId).toBeNull();
  });

  it('setDesiredModel caches intent', () => {
    const ct = new ConfigTracker();
    ct.setDesiredModel('gpt-4');
    expect(ct.getPendingChanges().model).toBe('gpt-4');
  });

  it('setCurrentModel clears desired (INV-S-11)', () => {
    const ct = new ConfigTracker();
    ct.setDesiredModel('gpt-4');
    ct.setCurrentModel('gpt-4');
    expect(ct.getPendingChanges().model).toBeNull();
    expect(ct.modelSnapshot().currentModelId).toBe('gpt-4');
  });

  it('syncFromSessionResult populates available options', () => {
    const ct = new ConfigTracker();
    ct.syncFromSessionResult({
      currentModelId: 'claude-3',
      availableModels: [{ modelId: 'claude-3', name: 'Claude 3' }],
      currentModeId: 'code',
      availableModes: [{ id: 'code', name: 'Code' }],
      configOptions: [{ id: 'think', name: 'Think', type: 'boolean' as const, currentValue: true }],
      cwd: '/tmp',
    });
    expect(ct.modelSnapshot().currentModelId).toBe('claude-3');
    expect(ct.modeSnapshot().currentModeId).toBe('code');
    expect(ct.configSnapshot().configOptions).toHaveLength(1);
  });

  it('desired overrides current when both set', () => {
    const ct = new ConfigTracker();
    ct.setCurrentModel('claude-3');
    ct.setDesiredModel('gpt-4');
    expect(ct.getPendingChanges().model).toBe('gpt-4');
  });

  it('setDesiredMode caches intent', () => {
    const ct = new ConfigTracker();
    ct.setDesiredMode('architect');
    expect(ct.getPendingChanges().mode).toBe('architect');
  });

  it('setDesiredConfigOption caches intent', () => {
    const ct = new ConfigTracker();
    ct.setDesiredConfigOption('think', true);
    expect(ct.getPendingChanges().configOptions).toEqual([{ id: 'think', value: true }]);
  });

  it('clearPending removes all desired values', () => {
    const ct = new ConfigTracker();
    ct.setDesiredModel('gpt-4');
    ct.setDesiredMode('ask');
    ct.clearPending();
    const pending = ct.getPendingChanges();
    expect(pending.model).toBeNull();
    expect(pending.mode).toBeNull();
    expect(pending.configOptions).toEqual([]);
  });
});
