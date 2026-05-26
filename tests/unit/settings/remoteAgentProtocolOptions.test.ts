/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { RemoteAgentProtocol } from '@/common/types/agent/remoteAgentTypes';
import {
  getRemoteProtocolOption,
  REMOTE_PROTOCOL_OPTIONS,
} from '@/renderer/pages/settings/AgentSettings/remoteAgentProtocolOptions';

describe('remote agent protocol options', () => {
  it('exposes OpenCode as a first-class remote protocol', () => {
    const opencode = getRemoteProtocolOption('opencode');

    expect(opencode.labelKey).toBe('protocolOpencode');
    expect(opencode.hintKey).toBe('protocolOpencodeHint');
    expect(opencode.urlPlaceholder).toMatch(/^http:\/\//);
  });

  it('keeps unsupported protocols visible but disabled', () => {
    const zeroclaw = getRemoteProtocolOption('zeroclaw');

    expect(zeroclaw.statusKey).toBe('protocolUnsupported');
    expect(zeroclaw.disabled).toBe(true);
  });

  it('falls back to OpenClaw metadata for an unknown protocol value', () => {
    const fallback = getRemoteProtocolOption('unknown' as RemoteAgentProtocol);

    expect(fallback.value).toBe('openclaw');
  });

  it('has a unique option for each remote protocol', () => {
    const values = REMOTE_PROTOCOL_OPTIONS.map((option) => option.value);

    expect(new Set(values).size).toBe(values.length);
  });
});
