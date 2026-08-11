import { describe, expect, it, vi } from 'vitest';
import { CodexModelService } from '@/process/agent/codex/appserver/CodexModelService';

function createService(result: unknown, currentModelId?: string) {
  const client = {
    request: vi.fn(async () => result),
  };
  return {
    client,
    service: new CodexModelService(client, currentModelId),
  };
}

describe('CodexModelService', () => {
  it('returns the configured model before the app-server model list is loaded', () => {
    const { service } = createService({}, 'gpt-5.2-codex');

    expect(service.getModelInfo()).toEqual({
      currentModelId: 'gpt-5.2-codex',
      currentModelLabel: 'gpt-5.2-codex',
      availableModels: [{ id: 'gpt-5.2-codex', label: 'gpt-5.2-codex' }],
      canSwitch: false,
      source: 'models',
      sourceDetail: 'codex-stream',
    });
  });

  it('normalizes app-server models to AcpModelInfo and preserves the selected model', async () => {
    const { client, service } = createService(
      {
        data: [
          { id: 'gpt-5.2-codex', displayName: 'GPT-5.2 Codex', isDefault: true },
          { model: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
          { id: 'gpt-oss', name: 'GPT OSS' },
        ],
      },
      'gpt-5.3-codex'
    );

    await expect(service.refresh()).resolves.toEqual({
      currentModelId: 'gpt-5.3-codex',
      currentModelLabel: 'GPT-5.3 Codex',
      availableModels: [
        { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
        { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
        { id: 'gpt-oss', label: 'GPT OSS' },
      ],
      canSwitch: true,
      source: 'models',
      sourceDetail: 'codex-stream',
    });
    expect(client.request).toHaveBeenCalledWith('model/list', {});
  });

  it('falls back to the Codex default model when the configured model is not returned', async () => {
    const { service } = createService(
      {
        data: [
          { id: 'gpt-5.5', displayName: 'GPT-5.5', isDefault: true },
          { id: 'gpt-5.4', displayName: 'GPT-5.4' },
        ],
      },
      'gpt-5.6-sol'
    );

    await expect(service.refresh()).resolves.toMatchObject({
      currentModelId: 'gpt-5.5',
      currentModelLabel: 'GPT-5.5',
      availableModels: [
        { id: 'gpt-5.5', label: 'GPT-5.5' },
        { id: 'gpt-5.4', label: 'GPT-5.4' },
      ],
      canSwitch: true,
    });
  });

  it('preserves model-specific reasoning capabilities from app-server', async () => {
    const { service } = createService({
      data: [
        {
          id: 'gpt-5.6-sol',
          displayName: 'GPT-5.6 Sol',
          defaultReasoningEffort: 'low',
          supportedReasoningEfforts: [
            { reasoningEffort: 'low' },
            { reasoningEffort: 'xhigh' },
            { reasoningEffort: 'max' },
            { reasoningEffort: 'max' },
            { description: 'missing effort' },
          ],
          isDefault: true,
        },
      ],
    });

    await expect(service.refresh()).resolves.toMatchObject({
      availableModels: [
        {
          id: 'gpt-5.6-sol',
          supportedReasoningEfforts: ['low', 'xhigh', 'max'],
          defaultReasoningEffort: 'low',
        },
      ],
    });
  });

  it('falls back to the default or first returned model when no current model is selected', async () => {
    const { service } = createService({
      models: [
        { id: 'hidden-model', label: 'Hidden Model' },
        { id: 'default-model', name: 'Default Model', is_default: true },
      ],
    });

    await expect(service.refresh()).resolves.toMatchObject({
      currentModelId: 'default-model',
      currentModelLabel: 'Default Model',
      canSwitch: true,
    });
  });

  it('handles empty and missing model lists while preserving the configured model', async () => {
    const { service } = createService({}, 'gpt-5.2-codex');

    await expect(service.refresh()).resolves.toEqual({
      currentModelId: 'gpt-5.2-codex',
      currentModelLabel: 'gpt-5.2-codex',
      availableModels: [{ id: 'gpt-5.2-codex', label: 'gpt-5.2-codex' }],
      canSwitch: false,
      source: 'models',
      sourceDetail: 'codex-stream',
    });
  });

  it('updates the selected model locally', async () => {
    const { service } = createService({
      data: [{ id: 'gpt-5.2-codex' }, { id: 'gpt-5.3-codex', display_name: 'GPT-5.3 Codex' }],
    });
    await service.refresh();

    expect(service.selectModel('gpt-5.3-codex')).toMatchObject({
      currentModelId: 'gpt-5.3-codex',
      currentModelLabel: 'GPT-5.3 Codex',
    });
  });
});
