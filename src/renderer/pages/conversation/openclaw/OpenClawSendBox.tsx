/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/fileSelection';
import { Button, Message, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { iconColors } from '@/renderer/theme/colors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDisplayMessage } from '@/renderer/utils/messageFiles';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import FilePreview from '@/renderer/components/FilePreview';
import HorizontalFileList from '@/renderer/components/HorizontalFileList';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { useLatestRef } from '@/renderer/hooks/useLatestRef';
import { useAutoTitle } from '@/renderer/hooks/useAutoTitle';

interface OpenClawDraftData {
  _type: 'openclaw-gateway';
  atPath: Array<string | FileOrFolderItem>;
  content: string;
  uploadFile: string[];
}

const useOpenClawSendBoxDraft = getSendBoxDraftHook('openclaw-gateway', {
  _type: 'openclaw-gateway',
  atPath: [],
  content: '',
  uploadFile: [],
});

/**
 * Validate that the OpenClaw runtime matches the expected configuration.
 * Returns true if validation passes, false otherwise (with user-facing error).
 */
const validateRuntimeMismatch = async (conversationId: string): Promise<boolean> => {
  const runtimeResult = await ipcBridge.openclawConversation.getRuntime.invoke({ conversation_id: conversationId });
  if (!runtimeResult?.success || !runtimeResult.data) {
    Message.error('Failed to validate agent runtime');
    return false;
  }

  const runtime = runtimeResult.data.runtime || {};
  const expected = runtimeResult.data.expected || {};
  const mismatches: string[] = [];

  const norm = (v?: string | null) => (v || '').trim();
  const eqPath = (a?: string | null, b?: string | null) => norm(a).replace(/[\\/]+$/, '') === norm(b).replace(/[\\/]+$/, '');

  if (expected.expectedWorkspace && !eqPath(expected.expectedWorkspace, runtime.workspace)) {
    mismatches.push(`workspace: expected=${expected.expectedWorkspace || '-'} actual=${runtime.workspace || '-'}`);
  }
  if (expected.expectedBackend && norm(expected.expectedBackend) !== norm(runtime.backend)) {
    mismatches.push(`backend: expected=${expected.expectedBackend || '-'} actual=${runtime.backend || '-'}`);
  }
  if (expected.expectedAgentName && norm(expected.expectedAgentName) !== norm(runtime.agentName)) {
    mismatches.push(`agent: expected=${expected.expectedAgentName || '-'} actual=${runtime.agentName || '-'}`);
  }
  if (expected.expectedCliPath && norm(expected.expectedCliPath) !== norm(runtime.cliPath)) {
    mismatches.push(`cliPath: expected=${expected.expectedCliPath || '-'} actual=${runtime.cliPath || '-'}`);
  }
  if (expected.expectedModel && norm(expected.expectedModel) !== norm(runtime.model)) {
    mismatches.push(`model: expected=${expected.expectedModel || '-'} actual=${runtime.model || '-'}`);
  }
  if (expected.expectedIdentityHash && norm(expected.expectedIdentityHash) !== norm(runtime.identityHash)) {
    mismatches.push(`identity: expected=${expected.expectedIdentityHash || '-'} actual=${runtime.identityHash || '-'}`);
  }

  if (mismatches.length > 0) {
    Message.error(`Agent switch validation failed: ${mismatches.join(' | ')}`);
    return false;
  }
  return true;
};

const OpenClawSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  const [aiProcessing, setAiProcessing] = useState(false);
  const [openclawStatus, setOpenClawStatus] = useState<string | null>(null);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });

  // Use ref to sync state for immediate access in event handlers
  // 使用 ref 同步状态，以便在事件处理程序中立即访问
  const aiProcessingRef = useRef(aiProcessing);

  // Track whether current turn has content output
  // Only reset aiProcessing when finish arrives after content (not after tool calls)
  const hasContentInTurnRef = useRef(false);

  // Delayed finish timeout to detect true end of task
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50;
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;
      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        ref.pending = data;
        if (!ref.timer) {
          ref.timer = setTimeout(
            () => {
              ref.lastUpdate = Date.now();
              ref.timer = null;
              if (ref.pending) {
                setThought(ref.pending);
                ref.pending = null;
              }
            },
            THROTTLE_MS - (now - ref.lastUpdate)
          );
        }
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  const { content, setContent, atPath, setAtPath, uploadFile, setUploadFile } = (function useDraft() {
    const { data, mutate } = useOpenClawSendBoxDraft(conversation_id);
    const EMPTY: Array<string | FileOrFolderItem> = [];
    const atPath = data?.atPath ?? EMPTY;
    const uploadFile = data?.uploadFile ?? [];
    const content = data?.content ?? '';
    return {
      atPath,
      uploadFile,
      content,
      setAtPath: (val: Array<string | FileOrFolderItem>) => mutate((prev) => ({ ...(prev as OpenClawDraftData), atPath: val })),
      setUploadFile: (val: string[]) => mutate((prev) => ({ ...(prev as OpenClawDraftData), uploadFile: val })),
      setContent: (val: string) => mutate((prev) => ({ ...(prev as OpenClawDraftData), content: val })),
    };
  })();

  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  // Reset state when conversation changes and restore actual running status
  useEffect(() => {
    // Clear pending finish timeout when conversation changes
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }

    setOpenClawStatus(null);
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;

    // Check actual conversation status from backend before resetting aiProcessing
    // to avoid flicker when switching to a running conversation
    // 先获取后端状态再重置 aiProcessing，避免切换到运行中的会话时闪烁
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) {
        setAiProcessing(false);
        aiProcessingRef.current = false;
        return;
      }
      const isRunning = res.status === 'running';
      setAiProcessing(isRunning);
      aiProcessingRef.current = isRunning;
    });

    // Eagerly initialize the OpenClaw agent and recover its connection status.
    // The agent may have already emitted 'session_active' before this listener was set up
    // (race condition: agent starts in constructor during conversation.create, before navigation).
    // getRuntime awaits bootstrap, so by the time it returns the agent is fully connected.
    void ipcBridge.openclawConversation.getRuntime
      .invoke({ conversation_id })
      .then((res) => {
        if (res?.success && res.data?.runtime?.hasActiveSession) {
          setOpenClawStatus('session_active');
        }
      })
      .catch(() => {
        // Agent not ready or conversation not found – ignore
      });
  }, [conversation_id]);

  useEffect(() => {
    const handler = (text: string) => {
      const newContent = content ? `${content}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

  useEffect(() => {
    return ipcBridge.openclawConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      // Cancel pending finish timeout if new message arrives
      if (finishTimeoutRef.current && message.type !== 'finish') {
        clearTimeout(finishTimeoutRef.current);
        finishTimeoutRef.current = null;
      }

      switch (message.type) {
        case 'thought':
          // Auto-recover aiProcessing state if thought arrives after finish
          // 如果 thought 在 finish 后到达，自动恢复 aiProcessing 状态
          if (!aiProcessingRef.current) {
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'finish':
          {
            // Use delayed reset to detect true end of task
            // 使用延迟重置来检测任务的真正结束
            finishTimeoutRef.current = setTimeout(() => {
              setAiProcessing(false);
              aiProcessingRef.current = false;
              setThought({ subject: '', description: '' });
              finishTimeoutRef.current = null;
            }, 1000);
            hasContentInTurnRef.current = false;
          }
          break;
        case 'content':
        case 'acp_permission': {
          // Mark that current turn has content output
          hasContentInTurnRef.current = true;
          // Auto-recover aiProcessing state if content arrives after finish
          if (!aiProcessingRef.current) {
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        case 'agent_status': {
          // Auto-recover aiProcessing state if agent_status arrives after finish
          if (!aiProcessingRef.current) {
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          const statusData = message.data as { status: string; message: string };
          setOpenClawStatus(statusData.status);
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        default: {
          // Mark that current turn has content output
          hasContentInTurnRef.current = true;
          // Auto-recover aiProcessing state if other messages arrive after finish
          if (!aiProcessingRef.current) {
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage]);

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      const filePaths = pastedFiles.map((file) => file.path);
      setUploadFile([...uploadFile, ...filePaths]);
    },
    [uploadFile, setUploadFile]
  );

  useAddEventListener('openclaw-gateway.selected.file', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      setAtPath(items);
    }, 10);
  });

  useAddEventListener('openclaw-gateway.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      const merged = mergeFileSelectionItems(atPathRef.current, items);
      if (merged !== atPathRef.current) {
        setAtPath(merged as Array<string | FileOrFolderItem>);
      }
    }, 10);
  });

  const onSendHandler = async (message: string) => {
    const runtimeOk = await validateRuntimeMismatch(conversation_id);
    if (!runtimeOk) return;

    const msg_id = uuid();
    setContent('');
    emitter.emit('openclaw-gateway.selected.file.clear');
    const currentAtPath = [...atPath];
    const currentUploadFile = [...uploadFile];
    setAtPath([]);
    setUploadFile([]);

    const filePaths = [...currentUploadFile, ...currentAtPath.map((item) => (typeof item === 'string' ? item : item.path))];
    const displayMessage = buildDisplayMessage(message, filePaths, workspacePath);

    const userMessage: TMessage = {
      id: msg_id,
      msg_id,
      conversation_id,
      type: 'text',
      position: 'right',
      content: { content: displayMessage },
      createdAt: Date.now(),
    };
    addOrUpdateMessage(userMessage, true);
    setAiProcessing(true);
    aiProcessingRef.current = true;
    try {
      const atPathStrings = currentAtPath.map((item) => (typeof item === 'string' ? item : item.path));
      await ipcBridge.openclawConversation.sendMessage.invoke({
        input: displayMessage,
        msg_id,
        conversation_id,
        files: [...currentUploadFile, ...atPathStrings],
      });
      void checkAndUpdateTitle(conversation_id, message);
      emitter.emit('chat.history.refresh');
    } catch (error) {
      // Only reset aiProcessing on error, normal flow is reset by 'finish' event
      setAiProcessing(false);
      aiProcessingRef.current = false;
      throw error;
    }
  };

  // Handle initial message from guid page
  useEffect(() => {
    if (!conversation_id || !openclawStatus) return;
    if (openclawStatus !== 'session_active') return;

    const storageKey = `openclaw_initial_message_${conversation_id}`;
    const processedKey = `openclaw_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;
      if (sessionStorage.getItem(processedKey)) return;

      try {
        const runtimeOk = await validateRuntimeMismatch(conversation_id);
        if (!runtimeOk) return;

        sessionStorage.setItem(processedKey, 'true');
        setAiProcessing(true);
        aiProcessingRef.current = true;
        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        const msg_id = `initial_${conversation_id}_${Date.now()}`;
        const loading_id = uuid();
        const initialDisplayMessage = buildDisplayMessage(input, files, workspacePath);

        const userMessage: TMessage = {
          id: msg_id,
          msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: { content: initialDisplayMessage },
          createdAt: Date.now(),
        };
        addOrUpdateMessage(userMessage, true);

        await ipcBridge.openclawConversation.sendMessage.invoke({ input: initialDisplayMessage, msg_id, conversation_id, files, loading_id });
        void checkAndUpdateTitle(conversation_id, input);
        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch (err) {
        sessionStorage.removeItem(processedKey);
        // Only reset aiProcessing on error, normal flow is reset by 'finish' event
        setAiProcessing(false);
        aiProcessingRef.current = false;
      }
    };

    const timer = setTimeout(() => {
      processInitialMessage().catch((error) => {
        console.error('Failed to process initial message:', error);
      });
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [conversation_id, openclawStatus, addOrUpdateMessage]);

  const handleStop = async (): Promise<void> => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      // Clear pending finish timeout
      if (finishTimeoutRef.current) {
        clearTimeout(finishTimeoutRef.current);
        finishTimeoutRef.current = null;
      }

      setAiProcessing(false);
      aiProcessingRef.current = false;
      setThought({ subject: '', description: '' });
      hasContentInTurnRef.current = false;
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} running={aiProcessing} onStop={handleStop} />

      <SendBox
        value={content}
        onChange={(val) => {
          if (!aiProcessing) {
            setContent(val);
          }
        }}
        loading={aiProcessing}
        disabled={aiProcessing}
        className='z-10'
        placeholder={
          aiProcessing
            ? t('conversation.chat.processing')
            : t('acp.sendbox.placeholder', {
                backend: 'OpenClaw',
                defaultValue: `Send message to OpenClaw...`,
              })
        }
        onStop={handleStop}
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        tools={
          <Button
            type='secondary'
            shape='circle'
            icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
            onClick={() => {
              void ipcBridge.dialog.showOpen.invoke({ properties: ['openFile', 'multiSelections'] }).then((files) => {
                if (files && files.length > 0) {
                  setUploadFile([...uploadFile, ...files]);
                }
              });
            }}
          />
        }
        prefix={
          <>
            {(uploadFile.length > 0 || atPath.some((item) => (typeof item === 'string' ? true : item.isFile))) && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))} />
                ))}
                {atPath.map((item) => {
                  const isFile = typeof item === 'string' ? true : item.isFile;
                  const path = typeof item === 'string' ? item : item.path;
                  if (isFile) {
                    return (
                      <FilePreview
                        key={path}
                        path={path}
                        onRemove={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? v !== path : v.path !== path));
                          emitter.emit('openclaw-gateway.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </HorizontalFileList>
            )}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('openclaw-gateway.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default OpenClawSendBox;
