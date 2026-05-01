/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/common/types/acpTypes';
import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import type { DetectedAgentKind } from '@/common/types/detectedAgent';
import { getConversationTypeForBackend } from '@/common/utils/buildAgentConversationParams';
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

  if (
    args.backend === 'gemini' ||
    args.backend === 'aionrs' ||
    args.backend === 'codex' ||
    args.backend === 'openclaw-gateway'
  ) {
    return enabledSkills ? { enabledSkills } : {};
  }

  return {
    backend: args.backend as AcpBackend,
    customAgentId: args.customAgentId,
    agentName: args.agentName,
    ...(enabledSkills ? { enabledSkills } : {}),
  };
}

export function buildChannelCreateConversationParams(args: {
  backend: string;
  detectedAgentKind?: DetectedAgentKind;
  detectedCliPath?: string;
  model: TProviderWithModel;
  name: string;
  source: string;
  channelChatId: string;
  extra: ICreateConversationParams['extra'];
}): ICreateConversationParams & { source: string; channelChatId: string } {
  const type = getConversationTypeForBackend(args.backend, args.detectedAgentKind);
  const extra: ICreateConversationParams['extra'] = { ...args.extra };

  if (type === 'codex') {
    extra.codexNative = true;
    if (args.detectedCliPath) {
      extra.cliPath = args.detectedCliPath;
    }
  } else if (type === 'acp') {
    extra.backend = args.backend as AcpBackend;
  }

  return {
    type,
    model: args.model,
    name: args.name,
    source: args.source,
    channelChatId: args.channelChatId,
    extra,
  };
}
