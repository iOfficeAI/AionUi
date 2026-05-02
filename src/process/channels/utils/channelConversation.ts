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
  workspace?: string;
}): {
  backend?: AcpBackend;
  customAgentId?: string;
  agentName?: string;
  enabledSkills?: string[];
  workspace?: string;
} {
  const enabledSkills = getChannelEnabledSkills(args.platform);

  if (
    args.backend === 'gemini' ||
    args.backend === 'aionrs' ||
    args.backend === 'codex' ||
    args.backend === 'openclaw-gateway'
  ) {
    return {
      ...(args.workspace ? { workspace: args.workspace } : {}),
      ...(enabledSkills ? { enabledSkills } : {}),
    };
  }

  return {
    backend: args.backend as AcpBackend,
    customAgentId: args.customAgentId,
    agentName: args.agentName,
    ...(args.workspace ? { workspace: args.workspace } : {}),
    ...(enabledSkills ? { enabledSkills } : {}),
  };
}
