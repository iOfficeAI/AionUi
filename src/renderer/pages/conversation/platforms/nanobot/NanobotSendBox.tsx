/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/chat/sendbox';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';

interface NanobotDraftData {
  _type: 'nanobot';
  atPath: Array<string | FileOrFolderItem>;
  content: string;
  uploadFile: string[];
}

const useNanobotSendBoxDraft = getSendBoxDraftHook('nanobot', {
  _type: 'nanobot',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const NanobotSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const slashCommands = useSlashCommands(conversation_id);
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const { setSendBoxHandler } = usePreviewContext();

  const [aiProcessing, setAiProcessing] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });

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

  const { data: draftData, mutate: mutateDraft } = useNanobotSendBoxDraft(conversation_id);
  const atPath = draftData?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = draftData?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = draftData?.content ?? '';

  const setAtPath = useCallback(
    (val: Array<string | FileOrFolderItem>) => {
      mutateDraft((prev) => ({ ...(prev as NanobotDraftData), atPath: val }));
    },
    [mutateDraft]
  );

  const setUploadFile = createSetUploadFile(mutateDraft, draftData);

  const setContent = useCallback(
    (val: string) => {
      mutateDraft((prev) => ({ ...(prev as NanobotDraftData), content: val }));
    },
    [mutateDraft]
  );

  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  useEffect(() => {
    let cancelled = false;

    setAiProcessing(false);
    setHasHydratedRunningState(false);
    setThought({ subject: '', description: '' });

    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (cancelled) {
        return;
      }

      const isRunning = res?.status === 'running';
      setAiProcessing(isRunning);
      setHasHydratedRunningState(true);
    });

    return () => {
      cancelled = true;
    };
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
    return ipcBridge.conversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      switch (message.type) {
        case 'thought':
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'finish': {
          setThought({ subject: '', description: '' });
          setAiProcessing(false);
          break;
        }
        case 'content':
        case 'error':
        case 'user_content':
        default: {
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          if (message.type === 'error') {
            setAiProcessing(false);
          }
          break;
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage]);

  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      const filePaths = pastedFiles.map((file) => file.path);
      setUploadFile((prev) => [...prev, ...filePaths]);
    },
    [setUploadFile]
  );

  useAddEventListener('nanobot.selected.file', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      setAtPath(items);
    }, 10);
  });

  useAddEventListener('nanobot.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      const merged = mergeFileSelectionItems(atPathRef.current, items);
      if (merged !== atPathRef.current) {
        setAtPath(merged as Array<string | FileOrFolderItem>);
      }
    }, 10);
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const msg_id = uuid();
      const displayMessage = buildDisplayMessage(input, files, workspacePath);

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
      try {
        void checkAndUpdateTitle(conversation_id, input);
        const result = await ipcBridge.conversation.sendMessage.invoke({
          input: displayMessage,
          msg_id,
          conversation_id,
          files,
        });
        assertBridgeSuccess(result, 'Failed to send message to Nanobot');
        emitter.emit('chat.history.refresh');
      } catch (error) {
        removeMessageByMsgId(msg_id);
        setAiProcessing(false);
        throw error;
      }
    },
    [addOrUpdateMessage, checkAndUpdateTitle, conversation_id, removeMessageByMsgId, workspacePath]
  );

  const {
    items,
    isPaused: isQueuePaused,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue,
    update,
    remove,
    clear,
    reorder,
    pause,
    resume,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversationId: conversation_id,
    isBusy: aiProcessing,
    isHydrated: hasHydratedRunningState,
    onExecute: executeCommand,
  });

  const onSendHandler = async (message: string) => {
    emitter.emit('nanobot.selected.file.clear');
    const filePaths = [...uploadFile, ...atPath.map((item) => (typeof item === 'string' ? item : item.path))];
    setAtPath([]);
    setUploadFile([]);

    if (shouldEnqueueConversationCommand({ isBusy: aiProcessing, hasPendingCommands })) {
      enqueue({ input: message, files: filePaths });
      return;
    }

    await executeCommand({ input: message, files: filePaths });
  };

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  // Handle initial message from guid page — nanobot is stateless, send immediately
  useEffect(() => {
    if (!conversation_id) return;

    const storageKey = `nanobot_initial_message_${conversation_id}`;
    const processedKey = `nanobot_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;
      if (sessionStorage.getItem(processedKey)) return;
      sessionStorage.setItem(processedKey, 'true');

      try {
        setAiProcessing(true);
        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        const res = await ipcBridge.conversation.get.invoke({ id: conversation_id });
        const resolvedWorkspace = res?.extra?.workspace ?? '';
        setWorkspacePath(resolvedWorkspace);
        const msg_id = `initial_${conversation_id}_${Date.now()}`;
        const initialDisplayMessage = buildDisplayMessage(input, files, resolvedWorkspace);

        const userMessage: TMessage = {
          id: msg_id,
          msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: { content: initialDisplayMessage },
          createdAt: Date.now(),
        };
        // Reset AI reply for new turn
        // 重置 AI 回复用于新一轮
        addOrUpdateMessage(userMessage, true);

        void checkAndUpdateTitle(conversation_id, input);
        const result = await ipcBridge.conversation.sendMessage.invoke({
          input: initialDisplayMessage,
          msg_id,
          conversation_id,
          files,
        });
        assertBridgeSuccess(result, 'Failed to send initial message to Nanobot');
        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch {
        sessionStorage.removeItem(processedKey);
        setAiProcessing(false);
      }
    };
    processInitialMessage().catch(console.error);
  }, [conversation_id, addOrUpdateMessage]);

  const handleStop = async (): Promise<void> => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      setAiProcessing(false);
      setThought({ subject: '', description: '' });
      resetActiveExecution('stop');
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} running={aiProcessing} onStop={handleStop} />
      <CommandQueuePanel
        items={items}
        paused={isQueuePaused}
        interactionLocked={isQueueInteractionLocked}
        onPause={pause}
        onResume={resume}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onUpdate={(commandId, input) => update(commandId, { input })}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />

      <SendBox
        value={content}
        onChange={setContent}
        loading={aiProcessing}
        disabled={false}
        className='z-10'
        placeholder={
          aiProcessing
            ? t('conversation.chat.processing')
            : t('acp.sendbox.placeholder', {
                backend: 'Nanobot',
                defaultValue: `Send message to Nanobot...`,
              })
        }
        onStop={handleStop}
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        supportedExts={allSupportedExts}
        tools={<FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />}
        prefix={
          <>
            {(uploadFile.length > 0 || atPath.some((item) => (typeof item === 'string' ? true : item.isFile))) && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview
                    key={path}
                    path={path}
                    onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))}
                  />
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
                          const newAtPath = atPath.filter((v) =>
                            typeof v === 'string' ? v !== path : v.path !== path
                          );
                          emitter.emit('nanobot.selected.file', newAtPath);
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
                          emitter.emit('nanobot.selected.file', newAtPath);
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
        slashCommands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading
      ></SendBox>
    </div>
  );
};

export default NanobotSendBox;
