/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Tag, Tooltip } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Header indicator for remote OpenCode conversations showing which tool surface
 * is active (C04): the user's local files (default "local" mode) or the
 * server's own files ("server" mode). Renders nothing until the agent config
 * resolves, and nothing for non-opencode remote agents.
 *
 * Reads the agent config the same way `RemoteSendBox` does: conversation
 * `extra.remote_agent_id` (snake_case, with a camelCase fallback) →
 * `ipcBridge.remoteAgent.get`.
 */
const RemoteToolHostBadge: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const [toolHost, setToolHost] = useState<'local' | 'server' | undefined>(undefined);
  const [isOpencode, setIsOpencode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getConversationOrNull(conversation_id).then(async (res) => {
      const extra = res?.extra as { remoteAgentId?: string; remote_agent_id?: string } | undefined;
      const remoteAgentId = extra?.remoteAgentId || extra?.remote_agent_id;
      if (!remoteAgentId) return;
      const agent = await ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId });
      if (cancelled) return;
      setIsOpencode(agent?.protocol === 'opencode');
      setToolHost(agent?.tool_host ?? 'local');
    });
    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  if (!isOpencode || !toolHost) return null;

  const isServer = toolHost === 'server';
  return (
    <Tooltip
      content={isServer ? t('conversation.remoteToolHost.serverHint') : t('conversation.remoteToolHost.localHint')}
    >
      <Tag size='small' color={isServer ? 'orange' : 'arcoblue'}>
        {isServer ? t('conversation.remoteToolHost.server') : t('conversation.remoteToolHost.local')}
      </Tag>
    </Tooltip>
  );
};

export default RemoteToolHostBadge;
