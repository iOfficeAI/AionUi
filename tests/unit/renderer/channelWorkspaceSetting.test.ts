/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPlatformSettings, IChannelWorkspaceSetting } from '@/common/types/channel/channel';
import { describe, expect, it } from 'vitest';

describe('IChannelPlatformSettings workspace field', () => {
  it('accepts optional workspace on platform settings', () => {
    const withWorkspace: IChannelPlatformSettings = {
      platform: 'telegram',
      assistant: null,
      default_model: null,
      workspace: { path: '/projects/demo' },
    };

    expect(withWorkspace.workspace?.path).toBe('/projects/demo');
  });

  it('allows clearing workspace via empty path payload', () => {
    const clearPayload: IChannelWorkspaceSetting = { path: '' };
    expect(clearPayload.path).toBe('');
  });

  it('treats missing workspace as temporary-folder default', () => {
    const settings: IChannelPlatformSettings = {
      platform: 'lark',
      assistant: null,
      default_model: null,
    };

    expect(settings.workspace ?? null).toBeNull();
  });
});
