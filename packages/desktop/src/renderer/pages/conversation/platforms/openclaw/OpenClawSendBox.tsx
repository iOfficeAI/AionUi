/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isErrorTipMessage, transformMessage } from '@/common/chat/chatLib';
import { uuid } from '@/common/utils';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import SendBox from '@/renderer/components/chat/SendBox';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { getConversationRuntimeWorkspaceErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { isConversationProcessing } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { Message, Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];
const OpenClawSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  const { checkAndUpdateTitle } = useAutoTitle();
  const slash_commands = useSlashCommands(conversation_id);
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  const [aiProcessing, setAiProcessing] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
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

  // Track whether the current turn was triggered by a Star Office install request
  const starOfficeInstallInFlightRef = useRef(false);

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

  const { data: draftData, mutate: mutateDraft } = useOpenClawSendBoxDraft(conversation_id);
  const atPath = draftData?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = draftData?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = draftData?.content ?? '';

  const setAtPath = useCallback(
    (val: Array<string | FileOrFolderItem>) => {
      mutateDraft((prev) => ({ ...(prev as OpenClawDraftData), atPath: val }));
    },
    [mutateDraft]
  );

  const setUploadFile = createSetUploadFile(mutateDraft, draftData);

  const setContent = useCallback(
    (val: string) => {
      mutateDraft((prev) => ({ ...(prev as OpenClawDraftData), content: val }));
    },
    [mutateDraft]
  );

  const handleContentChange = useCallback(
    (val: string) => {
      if (val && teamPermission) teamPermission.warmupSession();
      setContent(val);
    },
    [teamPermission, setContent]
  );

  const setContentRef = useLatestRef(setContent);
  const contentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);
  const immediateSendRef = useRef<((text: string) => Promise<void>) | null>(null);
  // Reset state when conversation changes and restore actual running status
  useEffect(() => {
    let cancelled = false;

    setAiProcessing(false);
    aiProcessingRef.current = false;
    setHasHydratedRunningState(false);
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;

    // Check actual conversation status from backend before resetting aiProcessing
    // to avoid flicker when switching to a running conversation
    // 先获取后端状态再重置 aiProcessing，避免切换到运行中的会话时闪烁
    void getConversationOrNull(conversation_id).then((res) => {
      if (cancelled) {
        return;
      }

      if (!res) {
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setHasHydratedRunningState(true);
        return;
      }
      const isRunning = isConversationProcessing(res);
      setAiProcessing(isRunning);
      aiProcessingRef.current = isRunning;
      setHasHydratedRunningState(true);
    });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  useEffect(() => {
    const handler = (text: string) => {
      const new_content = content ? `${content}\n${text}` : text;
      setContentRef.current(new_content);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      const prev = contentRef.current;
      setContentRef.current(prev ? `${prev}${text}` : text);
    },
    []
  );

  useEffect(() => {
    return ipcBridge.openclawConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      if (isErrorTipMessage(message)) {
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          addOrUpdateMessage(transformedMessage);
        }
        return;
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
            // Immediate state reset (notification is handled by centralized hook)
            // 立即重置状态（通知由集中化 hook 处理）
            setAiProcessing(false);
            aiProcessingRef.current = false;
            setThought({ subject: '', description: '' });
            // Notify StarOfficeMonitorCard to re-detect and auto-open panel
            if (starOfficeInstallInFlightRef.current) {
              starOfficeInstallInFlightRef.current = false;
              emitter.emit('staroffice.install.finished', { conversation_id: conversation_id });
            }
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
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        default: {
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
    void getConversationOrNull(conversation_id).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  useAddEventListener(
    'staroffice.install.request',
    ({ conversation_id, text }) => {
      if (conversation_id !== conversation_id) return;
      // Show the simplified prompt to user, inject star-office-helper skill via main process
      setAiProcessing(true);
      aiProcessingRef.current = true;
      starOfficeInstallInFlightRef.current = true;
      void checkAndUpdateTitle(conversation_id, text);
      ipcBridge.openclawConversation.sendMessage
        .invoke({ input: text, conversation_id, inject_skills: ['star-office-helper'] })
        .then(() => {
          emitter.emit('chat.history.refresh');
        })
        .catch(() => {
          setAiProcessing(false);
          aiProcessingRef.current = false;
          starOfficeInstallInFlightRef.current = false;
        });
    },
    [conversation_id, addOrUpdateMessage, checkAndUpdateTitle]
  );

  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      const file_paths = pastedFiles.map((file) => file.path);
      setUploadFile((prev) => [...prev, ...file_paths]);
    },
    [setUploadFile]
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

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      if (teamPermission) await teamPermission.warmupSession();
      const displayMessage = buildDisplayMessage(input, files, workspacePath);

      setAiProcessing(true);
      aiProcessingRef.current = true;
      let msg_id: string | null = null;
      try {
        void checkAndUpdateTitle(conversation_id, input);
        await ipcBridge.openclawConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id,
          files,
        });
        emitter.emit('chat.history.refresh');
      } catch (error) {
        setAiProcessing(false);
        aiProcessingRef.current = false;
        Message.error(getConversationRuntimeWorkspaceErrorMessage(error, t));
        throw error;
      }
    },
    [checkAndUpdateTitle, conversation_id, t, workspacePath]
  );

  const {
    items,
    isPaused: isQueuePaused,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue,
    remove,
    clear,
    reorder,
    pause,
    resume,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversation_id: conversation_id,
    enabled: true,
    isBusy: aiProcessing,
    isHydrated: hasHydratedRunningState,
    onExecute: executeCommand,
  });

  const onSendHandler = async (message: string) => {
    emitter.emit('openclaw-gateway.selected.file.clear');
    const file_paths = [...uploadFile, ...atPath.map((item) => (typeof item === 'string' ? item : item.path))];
    setAtPath([]);
    setUploadFile([]);

    if (
      shouldEnqueueConversationCommand({
        enabled: true,
        isBusy: aiProcessing,
        hasPendingCommands,
      })
    ) {
      enqueue({ input: message, files: file_paths });
      return;
    }

    await executeCommand({ input: message, files: file_paths });
  };

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      setUploadFile(Array.from(new Set(item.files)));
      setAtPath([]);
      emitter.emit('openclaw-gateway.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  useEffect(() => {
    immediateSendRef.current = (text) => executeCommand({ input: text, files: [] });
    return () => {
      immediateSendRef.current = null;
    };
  }, [executeCommand]);

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  // Handle initial message from guid page.
  // In backend-proxy mode, warmup happens on the backend when send_message is
  // called, so we no longer need to wait for a frontend 'session_active' status.
  useEffect(() => {
    if (!conversation_id || !hasHydratedRunningState) return;

    const storageKey = `openclaw_initial_message_${conversation_id}`;
    const processedKey = `openclaw_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;
      if (sessionStorage.getItem(processedKey)) return;

      try {
        sessionStorage.setItem(processedKey, 'true');
        setAiProcessing(true);
        aiProcessingRef.current = true;
        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        const loading_id = uuid();
        const initialDisplayMessage = buildDisplayMessage(input, files, workspacePath);

        void checkAndUpdateTitle(conversation_id, input);
        await ipcBridge.openclawConversation.sendMessage.invoke({
          input: initialDisplayMessage,
          conversation_id,
          files,
          loading_id,
        });
        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch (error) {
        sessionStorage.removeItem(processedKey);
        setAiProcessing(false);
        aiProcessingRef.current = false;
        Message.error(getConversationRuntimeWorkspaceErrorMessage(error, t));
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
  }, [conversation_id, hasHydratedRunningState, addOrUpdateMessage]);

  const handleStop = async (): Promise<void> => {
    // Best-effort cancel: swallow rejections so they don't bubble up as
    // unhandled rejections. UI state is still reset via finally.
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } catch (error) {
      console.warn('[OpenClawSendBox] stop request failed', error);
    } finally {
      setAiProcessing(false);
      aiProcessingRef.current = false;
      setThought({ subject: '', description: '' });
      hasContentInTurnRef.current = false;
      resetActiveExecution('stop');
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <CommandQueuePanel
        items={items}
        paused={isQueuePaused}
        interactionLocked={isQueueInteractionLocked}
        onPause={pause}
        onResume={resume}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onEdit={handleEditQueuedCommand}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />
      <ThoughtDisplay thought={thought} running={aiProcessing} onStop={handleStop} />

      <SendBox
        value={content}
        onChange={handleContentChange}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(nextSelectedItems) => {
          emitter.emit('openclaw-gateway.selected.file', nextSelectedItems);
          setAtPath(nextSelectedItems);
        }}
        loading={aiProcessing}
        disabled={false}
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
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={<FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />}
        prefix={
          <>
            {uploadFile.length > 0 && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview
                    key={path}
                    path={path}
                    onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))}
                  />
                ))}
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
        slash_commands={slash_commands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading
      ></SendBox>
    </div>
  );
};

export default OpenClawSendBox;
