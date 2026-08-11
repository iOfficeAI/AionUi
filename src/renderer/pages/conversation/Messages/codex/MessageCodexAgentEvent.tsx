/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CodexAgentEvent,
  IMessageCodexAgentEvent,
  IMessageCodexAgentTranscript,
  IMessageCodexToolCall,
} from '@/common/chat/chatLib';
import { Badge, Button, Tag } from '@arco-design/web-react';
import type { BadgeProps } from '@arco-design/web-react';
import { Down, Right, Robot } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MessageToolGroupSummary from '../components/MessageToolGroupSummary';

type AgentState = CodexAgentEvent['agents'][number];

const statusToBadge = (status: string): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
    case 'errored':
      return 'error';
    case 'canceled':
    case 'closed':
    case 'interrupted':
    case 'shutdown':
    case 'notFound':
      return 'default';
    case 'pendingInit':
    case 'running':
    default:
      return 'processing';
  }
};

const shortThreadId = (threadId: string): string => (threadId.length > 12 ? `${threadId.slice(0, 12)}...` : threadId);

const AgentLine: React.FC<{ agent: AgentState }> = ({ agent }) => {
  const { t } = useTranslation();
  const label = agent.nickname || agent.role || shortThreadId(agent.threadId);
  const status = agent.status || 'unknown';

  return (
    <div className='flex items-center gap-8px min-w-0'>
      <Robot theme='outline' size='14' fill='var(--color-text-3)' />
      <span className='font-medium text-t-primary truncate'>{label}</span>
      <Badge status={statusToBadge(status)} text={t(`codex.agentEvent.status.${status}`, { defaultValue: status })} />
      <span className='text-12px text-t-tertiary truncate'>{shortThreadId(agent.threadId)}</span>
    </div>
  );
};

const buildTranscriptContent = (transcripts: IMessageCodexAgentTranscript[]): string => {
  const contentByItemId = new Map<string, string>();
  for (const transcript of transcripts) {
    const itemId = `${transcript.content.threadId}:${transcript.content.itemId}`;
    contentByItemId.set(itemId, (contentByItemId.get(itemId) || '') + transcript.content.content);
  }
  return Array.from(contentByItemId.values())
    .filter((content) => content.trim().length > 0)
    .join('\n\n');
};

const MessageCodexAgentEvent: React.FC<{
  message: IMessageCodexAgentEvent;
  transcripts?: IMessageCodexAgentTranscript[];
  toolCalls?: IMessageCodexToolCall[];
}> = ({ message, transcripts = [], toolCalls = [] }) => {
  const { t } = useTranslation();
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const { action, status, receiverThreadIds, prompt, model, reasoningEffort, agents } = message.content;
  const visibleAgents = agents.length > 0 ? agents : receiverThreadIds.map((threadId) => ({ threadId }));
  const transcriptContent = buildTranscriptContent(transcripts);
  const hasDiagnostics = Boolean(
    prompt || transcriptContent || toolCalls.length > 0 || message.content.callId || message.content.senderThreadId
  );
  const title = t(`codex.agentEvent.action.${action}`, {
    defaultValue: t('codex.agentEvent.action.unknown'),
  });
  const summary = useMemo(() => {
    const parts = [
      visibleAgents.length > 0 ? t('codex.agentEvent.agentCount', { count: visibleAgents.length }) : undefined,
      model,
      reasoningEffort ? t('codex.agentEvent.reasoningEffort', { effort: reasoningEffort }) : undefined,
    ].filter((part): part is string => Boolean(part));
    return parts.join(' · ');
  }, [model, reasoningEffort, t, visibleAgents.length]);
  const toggleAgentsExpanded = () => {
    setAgentsExpanded((value) => {
      if (value) {
        setDiagnosticsExpanded(false);
      }
      return !value;
    });
  };

  return (
    <div className='w-full rounded-8px border border-solid border-b-base bg-1 px-12px py-10px'>
      <div className='flex items-start gap-10px'>
        <Button
          type='text'
          size='mini'
          icon={agentsExpanded ? <Down theme='outline' /> : <Right theme='outline' />}
          onClick={toggleAgentsExpanded}
          title={agentsExpanded ? t('codex.agentEvent.collapse') : t('codex.agentEvent.expand')}
        />
        <div className='flex-1 min-w-0'>
          <div className='flex flex-wrap items-center gap-8px'>
            <span className='font-medium text-t-primary'>{title}</span>
            <Badge
              status={statusToBadge(status)}
              text={t(`codex.agentEvent.status.${status}`, { defaultValue: status })}
            />
            {summary ? <span className='text-12px text-t-secondary truncate'>{summary}</span> : null}
          </div>
          {agentsExpanded && visibleAgents.length > 0 ? (
            <div className='mt-8px flex flex-col gap-6px'>
              {visibleAgents.map((agent) => (
                <AgentLine key={agent.threadId} agent={agent} />
              ))}
            </div>
          ) : null}
          {agentsExpanded && hasDiagnostics ? (
            <div className='mt-8px flex flex-col gap-8px text-12px text-t-secondary'>
              <Button
                type='text'
                size='mini'
                className='self-start'
                icon={diagnosticsExpanded ? <Down theme='outline' /> : <Right theme='outline' />}
                onClick={() => setDiagnosticsExpanded((value) => !value)}
                title={
                  diagnosticsExpanded
                    ? t('codex.agentEvent.collapseDiagnostics')
                    : t('codex.agentEvent.expandDiagnostics')
                }
              >
                {t('codex.agentEvent.diagnostics')}
              </Button>
              {diagnosticsExpanded ? (
                <>
                  {prompt ? (
                    <div className='bg-2 border border-solid border-b-base rd-6px p-8px whitespace-pre-wrap break-words'>
                      {prompt}
                    </div>
                  ) : null}
                  {transcriptContent ? (
                    <div className='bg-2 border border-solid border-b-base rd-6px p-8px whitespace-pre-wrap break-words'>
                      {transcriptContent}
                    </div>
                  ) : null}
                  {toolCalls.length > 0 ? <MessageToolGroupSummary messages={toolCalls} /> : null}
                  <div className='flex flex-wrap gap-6px'>
                    <Tag size='small' color='gray'>
                      {message.content.callId}
                    </Tag>
                    {message.content.senderThreadId ? (
                      <Tag size='small' color='gray'>
                        {message.content.senderThreadId}
                      </Tag>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MessageCodexAgentEvent;
