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
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
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
  const { setSendBoxHandler } = usePreviewContext();

  const [aiProcessing, setAiProcessing] = useState(false);
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
    setAiProcessing(false);
    setThought({ subject: '', description: '' });
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

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
    // Content is already cleared by the shared SendBox component (setInput(''))
    // before calling onSend — no need to clear again here.
    emitter.emit('nanobot.selected.file.clear');
    const currentAtPath = [...atPath];
    const currentUploadFile = [...uploadFile];
    setAtPath([]);
    setUploadFile([]);

    const filePaths = [
      ...currentUploadFile,
      ...currentAtPath.map((item) => (typeof item === 'string' ? item : item.path)),
    ];
    const displayMessage = buildDisplayMessage(message, filePaths, workspacePath);

    // Frontend adds user message directly — no reliance on backend user_content emission
    const userMessage: TMessage = {
      id: msg_id,
      msg_id,
      conversation_id,
      type: 'text',
      position: 'right',
      content: { content: displayMessage },
      createdAt: Date.now(),
    };
    // Reset AI reply for new turn
    // 重置 AI 回复用于新一轮
    addOrUpdateMessage(userMessage, true);
    setAiProcessing(true);
    try {
      const atPathStrings = currentAtPath.map((item) => (typeof item === 'string' ? item : item.path));
      await ipcBridge.conversation.sendMessage.invoke({
        input: displayMessage,
        msg_id,
        conversation_id,
        files: [...currentUploadFile, ...atPathStrings],
      });
      void checkAndUpdateTitle(conversation_id, message);
      emitter.emit('chat.history.refresh');
    } catch {
      // Only reset on invoke failure; normal completion is handled by the 'finish' stream event
      setAiProcessing(false);
    }
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

        await ipcBridge.conversation.sendMessage.invoke({
          input: initialDisplayMessage,
          msg_id,
          conversation_id,
          files,
        });
        void checkAndUpdateTitle(conversation_id, input);
        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch (err) {
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
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} running={aiProcessing} onStop={handleStop} />

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
      ></SendBox>
    </div>
  );
};

export default NanobotSendBox;
