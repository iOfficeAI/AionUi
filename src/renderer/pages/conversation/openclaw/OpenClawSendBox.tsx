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
import { Button, Tag } from '@arco-design/web-react';
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

  useEffect(() => {
    setAiProcessing(false);
    setOpenClawStatus(null);
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
    return ipcBridge.openclawConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      switch (message.type) {
        case 'thought':
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'finish':
          setThought({ subject: '', description: '' });
          setAiProcessing(false);
          break;
        case 'content':
        case 'acp_permission': {
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        case 'agent_status': {
          const statusData = message.data as { status: string; message: string };
          setOpenClawStatus(statusData.status);
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
    } finally {
      setAiProcessing(false);
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
      sessionStorage.setItem(processedKey, 'true');

      try {
        setAiProcessing(true);
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
      } finally {
        setAiProcessing(false);
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
      setAiProcessing(false);
      setThought({ subject: '', description: '' });
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
