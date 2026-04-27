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
  custom_agent_id?: string;
  agent_name?: string;
}): {
  backend?: AcpBackend;
  custom_agent_id?: string;
  agent_name?: string;
  preset_enabled_skills?: string[];
} {
  const preset_enabled_skills = getChannelEnabledSkills(args.platform);

  if (
    args.backend === 'gemini' ||
    args.backend === 'aionrs' ||
    args.backend === 'codex' ||
    args.backend === 'openclaw-gateway'
  ) {
    return preset_enabled_skills ? { preset_enabled_skills } : {};
  }

  return {
    backend: args.backend as AcpBackend,
    custom_agent_id: args.custom_agent_id,
    agent_name: args.agent_name,
    ...(preset_enabled_skills ? { preset_enabled_skills } : {}),
  };
}
