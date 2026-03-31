/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/common/types/acpTypes';
import type { PluginType } from '../types';

const WEIXIN_FILE_SEND_SKILL = 'weixin-file-send';

export function getChannelEnabledSkills(platform: PluginType): string[] | undefined {
  return platform === 'weixin' ? [WEIXIN_FILE_SEND_SKILL] : undefined;
}

export function buildChannelConversationExtra(args: {
  platform: PluginType;
  backend: string;
  customAgentId?: string;
  agentName?: string;
}): {
  backend?: AcpBackend;
  customAgentId?: string;
  agentName?: string;
  enabledSkills?: string[];
} {
  const enabledSkills = getChannelEnabledSkills(args.platform);

  if (args.backend === 'gemini' || args.backend === 'codex' || args.backend === 'openclaw-gateway') {
    return enabledSkills ? { enabledSkills } : {};
  }

  return {
    backend: args.backend as AcpBackend,
    customAgentId: args.customAgentId,
    agentName: args.agentName,
    ...(enabledSkills ? { enabledSkills } : {}),
  };
}
