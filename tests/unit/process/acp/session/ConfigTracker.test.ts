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

  it('drops desired model when it is absent from session model list', () => {
    const ct = new ConfigTracker({ model: 'claude-sonnet-4-6' });
    ct.syncFromSessionResult({
      currentModelId: 'default',
      availableModels: [
        { modelId: 'default', name: 'Claude Default' },
        { modelId: 'opus', name: 'Claude Opus' },
      ],
      cwd: '/tmp',
    });

    expect(ct.discardUnavailableDesiredModel()).toBe('claude-sonnet-4-6');
    expect(ct.getPendingChanges().model).toBeNull();
    expect(ct.modelSnapshot().currentModelId).toBe('default');
  });

  it('keeps desired model when it exists in a model config option', () => {
    const ct = new ConfigTracker({ model: 'opus' });
    ct.syncFromSessionResult({
      currentModelId: 'default',
      configOptions: [
        {
          id: 'model',
          name: 'Model',
          type: 'select',
          category: 'model',
          currentValue: 'default',
          options: [
            { id: 'default', name: 'Claude Default' },
            { id: 'opus', name: 'Claude Opus' },
          ],
        },
      ],
      cwd: '/tmp',
    });

    expect(ct.discardUnavailableDesiredModel()).toBeNull();
    expect(ct.getPendingChanges().model).toBe('opus');
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

  it('syncFromInitializeResult seeds modes advertised at initialize time', () => {
    const ct = new ConfigTracker();
    ct.syncFromInitializeResult({
      currentModeId: 'default',
      availableModes: [
        { id: 'plan', name: 'Plan' },
        { id: 'default', name: 'Default' },
        { id: 'auto-edit', name: 'Auto Edit' },
        { id: 'yolo', name: 'YOLO' },
      ],
    });
    const snapshot = ct.modeSnapshot();
    expect(snapshot.currentModeId).toBe('default');
    expect(snapshot.availableModes.map((m) => m.id)).toEqual(['plan', 'default', 'auto-edit', 'yolo']);
  });

  it('syncFromInitializeResult is a no-op for null / empty modes', () => {
    const ct = new ConfigTracker();
    ct.syncFromInitializeResult(null);
    expect(ct.modeSnapshot().availableModes).toEqual([]);
    ct.syncFromInitializeResult({ availableModes: [] });
    expect(ct.modeSnapshot().availableModes).toEqual([]);
  });

  it('syncFromSessionResult overrides modes seeded by syncFromInitializeResult', () => {
    const ct = new ConfigTracker();
    ct.syncFromInitializeResult({
      availableModes: [
        { id: 'plan', name: 'Plan' },
        { id: 'default', name: 'Default' },
      ],
    });
    ct.syncFromSessionResult({
      availableModes: [{ id: 'code', name: 'Code' }],
      currentModeId: 'code',
      cwd: '/tmp',
    });
    expect(ct.modeSnapshot().availableModes.map((m) => m.id)).toEqual(['code']);
  });
});
