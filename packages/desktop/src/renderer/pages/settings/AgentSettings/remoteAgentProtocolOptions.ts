/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteAgentProtocol } from '@/common/types/agent/remoteAgentTypes';

export type RemoteProtocolOption = {
  value: RemoteAgentProtocol;
  labelKey: 'protocolOpenclaw' | 'protocolOpencode' | 'protocolAcp' | 'protocolZeroclaw';
  statusKey: 'protocolStable' | 'protocolBeta' | 'protocolUnsupported';
  hintKey: 'protocolOpenclawHint' | 'protocolOpencodeHint' | 'protocolAcpHint' | 'protocolUnsupportedHint';
  urlPlaceholder: string;
  disabled?: boolean;
};

export const REMOTE_PROTOCOL_OPTIONS: readonly RemoteProtocolOption[] = [
  {
    value: 'openclaw',
    labelKey: 'protocolOpenclaw',
    statusKey: 'protocolStable',
    hintKey: 'protocolOpenclawHint',
    urlPlaceholder: 'wss://example.com/gateway',
  },
  {
    value: 'opencode',
    labelKey: 'protocolOpencode',
    statusKey: 'protocolBeta',
    hintKey: 'protocolOpencodeHint',
    urlPlaceholder: 'http://127.0.0.1:4096',
  },
  {
    value: 'acp',
    labelKey: 'protocolAcp',
    statusKey: 'protocolBeta',
    hintKey: 'protocolAcpHint',
    urlPlaceholder: 'ws://127.0.0.1:8765',
  },
  {
    value: 'zeroclaw',
    labelKey: 'protocolZeroclaw',
    statusKey: 'protocolUnsupported',
    hintKey: 'protocolUnsupportedHint',
    urlPlaceholder: 'wss://example.com/zeroclaw',
    disabled: true,
  },
] as const;

export const getRemoteProtocolOption = (protocol: RemoteAgentProtocol): RemoteProtocolOption => {
  return REMOTE_PROTOCOL_OPTIONS.find((option) => option.value === protocol) ?? REMOTE_PROTOCOL_OPTIONS[0];
};
