import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { Message, Tag, Tooltip } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type RemoteExtra = {
  remoteAgentId?: string;
  remote_agent_id?: string;
  sessionKey?: string;
  workspace?: string;
  remote_workspace?: string;
};

const truncateSession = (sessionId: string): string => {
  if (sessionId.length <= 14) return sessionId;
  return `${sessionId.slice(0, 10)}...${sessionId.slice(-4)}`;
};

const RemoteSessionBadge: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t } = useTranslation();
  const extra = conversation.extra as RemoteExtra | undefined;
  const sessionKey = extra?.sessionKey;
  const remoteAgentId = extra?.remoteAgentId || extra?.remote_agent_id;
  const [isOpencode, setIsOpencode] = useState(false);

  useEffect(() => {
    if (!remoteAgentId || !sessionKey) return;
    let cancelled = false;
    void ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId }).then((agent) => {
      if (!cancelled) setIsOpencode(agent?.protocol === 'opencode');
    });
    return () => {
      cancelled = true;
    };
  }, [remoteAgentId, sessionKey]);

  if (!sessionKey || !isOpencode) return null;

  const directory = extra?.remote_workspace || extra?.workspace || '';
  const handleCopy = async () => {
    await navigator.clipboard.writeText(sessionKey);
    Message.success(t('conversation.remoteSessionBadge.copied'));
  };

  return (
    <Tooltip content={t('conversation.remoteSessionBadge.tooltip', { sessionId: sessionKey, directory })}>
      <Tag size='small' color='arcoblue' className='cursor-pointer' onClick={handleCopy}>
        {t('conversation.remoteSessionBadge.label', { sessionId: truncateSession(sessionKey) })}
      </Tag>
    </Tooltip>
  );
};

export default RemoteSessionBadge;
