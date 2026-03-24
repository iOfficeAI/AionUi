/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { agentTeam, conversation as ipcConversation, type ICoordTimelineEntry } from '@/common/adapter/ipcBridge';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import SendBox from '@/renderer/components/chat/sendbox';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import MarkdownView from '@/renderer/components/Markdown';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { IAgentTeamMember } from '@/common/config/storage';
import type { FileMetadata } from '@/renderer/services/FileService';
import { useNavigate } from 'react-router-dom';
import styles from './AgentTeamChat.module.css';

type AgentTeamChatProps = {
  conversation_id: string;
  workspace?: string;
};

function mergeTimelineEntries(
  prev: ICoordTimelineEntry[],
  incoming: ICoordTimelineEntry | ICoordTimelineEntry[],
): ICoordTimelineEntry[] {
  const next = Array.isArray(incoming) ? incoming : [incoming];
  if (next.length === 0) {
    return prev;
  }

  const byId = new Map<string, ICoordTimelineEntry>();
  for (const entry of prev) {
    byId.set(entry.id, entry);
  }
  for (const entry of next) {
    byId.set(entry.id, entry);
  }

  return Array.from(byId.values()).sort((a, b) => {
    // Use Date.parse for correct sorting across UTC and local timezone formats
    const timeA = new Date(a.ts).getTime();
    const timeB = new Date(b.ts).getTime();
    if (timeA === timeB) {
      return a.id.localeCompare(b.id);
    }
    return timeA - timeB;
  });
}

export default function AgentTeamChat({ conversation_id, workspace }: AgentTeamChatProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'agents'>('timeline');
  const [timeline, setTimeline] = useState<ICoordTimelineEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(false);
  const [memberMap, setMemberMap] = useState<Map<string, { name: string; backend?: string; type: string }>>(new Map());
  const [pendingFiles, setPendingFiles] = useState<FileMetadata[]>([]);

  const handleFilesAdded = useCallback((files: FileMetadata[]) => {
    setPendingFiles((prev) => [...prev, ...files]);
  }, []);

  const { openFileSelector } = useOpenFileSelector({
    onFilesSelected: (paths) => {
      const files: FileMetadata[] = paths.map((p) => ({
        path: p,
        name: p.split('/').pop() || p,
        size: 0,
        type: '',
        lastModified: Date.now(),
      }));
      handleFilesAdded(files);
    },
  });

  // Load team members for avatar mapping — use team.extra.members[] which has memberId
  useEffect(() => {
    ipcConversation.get.invoke({ id: conversation_id }).then((teamConv) => {
      if (!teamConv || teamConv.type !== 'agent-team') return;
      const members = (teamConv.extra as { members?: IAgentTeamMember[] }).members || [];
      const map = new Map<string, { name: string; backend?: string; type: string }>();
      for (const m of members) {
        const info = { name: m.name, backend: m.backend || m.type, type: m.type };
        map.set(m.memberId, info);          // coord from=memberId
        map.set(m.conversationId, info);     // fallback: from=conversationId
        map.set(m.name, info);               // fallback: from=name
      }
      setMemberMap(map);
    });
  }, [conversation_id]);

  // Load initial timeline
  useEffect(() => {
    shouldAutoScrollRef.current = false;
    agentTeam.getTimeline.invoke({ conversation_id }).then((result) => {
      if (result.success && result.data) {
        setTimeline((prev) => mergeTimelineEntries(prev, result.data.entries));
      }
    });
  }, [conversation_id]);

  // Listen for timeline stream updates
  useEffect(() => {
    const cleanup = agentTeam.timelineStream.on((event) => {
      if (event.conversation_id === conversation_id) {
        shouldAutoScrollRef.current = true;
        setTimeline((prev) => mergeTimelineEntries(prev, event.entry));
      }
    });
    return cleanup;
  }, [conversation_id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!shouldAutoScrollRef.current || !timelineRef.current) {
      return;
    }

    timelineRef.current.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior: 'smooth',
    });
    shouldAutoScrollRef.current = false;
  }, [timeline]);

  const handleSend = useCallback(async (message: string) => {
    const text = message.trim();
    if (!text && pendingFiles.length === 0) return;

    setSending(true);
    try {
      const filePaths = pendingFiles.length > 0 ? pendingFiles.map((f) => f.path) : undefined;
      const result = await agentTeam.sendMessage.invoke({
        conversation_id,
        input: text,
        files: filePaths,
      });
      if (result.success && result.data?.entry) {
        setTimeline((prev) => mergeTimelineEntries(prev, result.data!.entry));
      }
      setPendingFiles([]);
    } catch (err) {
      console.error('[AgentTeamChat] Send failed:', err);
    } finally {
      setSending(false);
    }
  }, [conversation_id, pendingFiles]);

  return (
    <ConversationProvider value={{ conversationId: conversation_id, workspace, type: 'agent-team' }}>
      <div className={styles.container}>
        {/* Simple tab bar — no Arco Tabs, avoids absolute-positioning layout conflicts */}
        <div className={styles.tabBar}>
          <button
            type='button'
            className={`${styles.tab} ${activeTab === 'timeline' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
          </button>
          <button
            type='button'
            className={`${styles.tab} ${activeTab === 'agents' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('agents')}
          >
            Agents
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'timeline' ? (
          <div ref={timelineRef} className={styles.timeline}>
            {timeline.length === 0 ? (
              <div className={styles.empty}>No coordination messages yet. Send a message to start the team.</div>
            ) : (
              timeline.map((entry) => {
                const memberInfo = memberMap.get(entry.from);
                const logoBackend = entry.role === 'user' ? null : (memberInfo?.backend || entry.from);
                const logoSrc = logoBackend ? getAgentLogo(logoBackend) : null;
                const displayName = entry.role === 'user' ? 'You' : (memberInfo?.name || entry.from);
                const dispatchLabel = entry.dispatch === 'targets' && entry.to
                  ? `→ ${entry.to.join(', ')}`
                  : entry.dispatch === 'none'
                    ? '(no wakeup)'
                    : null;

                return (
                  <div key={entry.id} className={styles.entry}>
                    <div className={styles.entryHeader}>
                      {logoSrc ? (
                        <img src={logoSrc} alt='' width={18} height={18} className={styles.entryLogo} />
                      ) : (
                        <div className={styles.entryUserIcon}>U</div>
                      )}
                      <span className={styles.entryFrom}>{displayName}</span>
                      <span className={styles.entryType}>{entry.type}</span>
                      {dispatchLabel && <span className={styles.entryDispatch}>{dispatchLabel}</span>}
                      <span className={styles.entryTime}>{new Date(entry.ts).toLocaleTimeString()}</span>
                    </div>
                    <div className={styles.entrySummary}>{entry.summary}</div>
                    {entry.body && (
                      <div className={styles.entryBody}>
                        <MarkdownView>{entry.body}</MarkdownView>
                      </div>
                    )}
                    {entry.files && entry.files.length > 0 && (
                      <div className={styles.entryFiles}>
                        <HorizontalFileList>
                          {entry.files.map((filePath, i) => (
                            <FilePreview
                              key={`${filePath}-${i}`}
                              path={filePath}
                              onRemove={() => {}}
                              readonly
                            />
                          ))}
                        </HorizontalFileList>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <AgentsMembersView conversation_id={conversation_id} />
        )}

        <div className={styles.inputArea}>
          {pendingFiles.length > 0 && (
            <div className={styles.pendingFiles}>
              <HorizontalFileList>
                {pendingFiles.map((f, i) => (
                  <FilePreview
                    key={`${f.path}-${i}`}
                    path={f.path}
                    onRemove={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </HorizontalFileList>
            </div>
          )}
          <SendBox
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            loading={sending}
            disabled={sending}
            placeholder='Send a message to the team...'
            defaultMultiLine
            onFilesAdded={handleFilesAdded}
            tools={
              <FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />
            }
          />
        </div>
      </div>
    </ConversationProvider>
  );
}

function AgentsMembersView({ conversation_id }: { conversation_id: string }) {
  const [members, setMembers] = useState<Array<{ id: string; name: string; type: string; backend?: string }>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    agentTeam.getMembers.invoke({ conversation_id }).then((result) => {
      if (result.success && result.data) {
        setMembers(
          result.data.conversations.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            backend: (c.extra as { backend?: string })?.backend,
          })),
        );
      }
    });
  }, [conversation_id]);

  return (
    <div className={styles.members}>
      {members.length === 0 ? (
        <div className={styles.empty}>No team members found.</div>
      ) : (
        members.map((member) => {
          const logoSrc = getAgentLogo(member.backend || member.type);
          return (
            <div
              key={member.id}
              className={styles.memberCard}
              onClick={() => {
                navigate(`/conversation/${member.id}`);
              }}
            >
              {logoSrc && <img src={logoSrc} alt='' width={24} height={24} className={styles.memberLogo} />}
              <div className={styles.memberName}>{member.name}</div>
              <div className={styles.memberType}>{member.backend || member.type}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
