/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { fromApiConversation, fromApiPaginatedConversations } from '@/common/adapter/apiModelMapper';

describe('fromApiConversation', () => {
  it('derives custom_workspace=true when workspace is user-chosen', () => {
    const raw = {
      id: 'conv_1',
      type: 'acp',
      model: { provider_id: 'p1', model: 'm1' },
      extra: {
        workspace: '/Users/alice/project',
        is_temporary_workspace: false,
      },
    };

    const mapped = fromApiConversation(raw);

    expect(mapped.extra.custom_workspace).toBe(true);
    expect(mapped.extra.workspace).toBe('/Users/alice/project');
    expect(mapped.extra.is_temporary_workspace).toBe(false);
  });

  it('derives custom_workspace=false when workspace is auto-provisioned', () => {
    const raw = {
      id: 'conv_2',
      type: 'acp',
      extra: {
        workspace: '/srv/aionui-data/conversations/claude-temp-abc',
        is_temporary_workspace: true,
      },
    };

    const mapped = fromApiConversation(raw);

    expect(mapped.extra.custom_workspace).toBe(false);
  });

  it('derives custom_workspace=false when workspace is empty', () => {
    const raw = {
      id: 'conv_3',
      type: 'gemini',
      extra: { workspace: '', is_temporary_workspace: false },
    };

    const mapped = fromApiConversation(raw);

    expect(mapped.extra.custom_workspace).toBe(false);
  });

  it('derives custom_workspace=false when workspace key is absent', () => {
    const raw = {
      id: 'conv_4',
      type: 'gemini',
      extra: {},
    };

    const mapped = fromApiConversation(raw);

    expect(mapped.extra.custom_workspace).toBe(false);
  });

  it('preserves explicit custom_workspace from legacy rows', () => {
    const raw = {
      id: 'conv_5',
      type: 'acp',
      extra: {
        workspace: '/Users/alice/project',
        is_temporary_workspace: true,
        custom_workspace: true,
      },
    };

    const mapped = fromApiConversation(raw);

    expect(mapped.extra.custom_workspace).toBe(true);
  });

  it('returns primitives unchanged', () => {
    expect(fromApiConversation('plain-value')).toBe('plain-value');
  });

  it('still maps model when no extra exists', () => {
    const raw = {
      id: 'conv_7',
      type: 'acp',
      model: { provider_id: 'p1', model: 'm1' },
    };

    const mapped = fromApiConversation(raw);

    expect(mapped).toEqual({
      id: 'conv_7',
      type: 'acp',
      model: {
        id: 'p1',
        platform: '',
        name: '',
        base_url: '',
        api_key: '',
        use_model: 'm1',
      },
    });
  });

  it('maps model and derives custom_workspace in the same pass', () => {
    const raw = {
      id: 'conv_8',
      type: 'acp',
      model: { provider_id: 'p9', model: 'm9', use_model: 'm9-use' },
      extra: { workspace: '/Users/a/ws', is_temporary_workspace: false },
    };

    const mapped = fromApiConversation(raw);

    expect(mapped.model).toEqual({
      id: 'p9',
      platform: '',
      name: '',
      base_url: '',
      api_key: '',
      use_model: 'm9-use',
    });
    expect(mapped.extra.custom_workspace).toBe(true);
  });
});

describe('fromApiPaginatedConversations', () => {
  it('derives custom_workspace on every item', () => {
    const page = {
      items: [
        { id: 'a', type: 'acp', extra: { workspace: '/ws/a', is_temporary_workspace: false } },
        { id: 'b', type: 'acp', extra: { workspace: '/tmp/b', is_temporary_workspace: true } },
      ],
      total: 2,
      has_more: false,
    };

    const mapped = fromApiPaginatedConversations(page);

    expect(mapped.items[0].extra.custom_workspace).toBe(true);
    expect(mapped.items[1].extra.custom_workspace).toBe(false);
    expect(mapped.total).toBe(2);
    expect(mapped.has_more).toBe(false);
  });

  it('keeps empty pages intact', () => {
    const page = {
      items: [] as Array<{ id: string }>,
      total: 0,
      has_more: false,
    };

    const mapped = fromApiPaginatedConversations(page);

    expect(mapped.items).toEqual([]);
    expect(mapped.total).toBe(0);
    expect(mapped.has_more).toBe(false);
  });
});
