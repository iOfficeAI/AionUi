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

interface RemoteDraftData {
  _type: 'remote';
  atPath: Array<string | FileOrFolderItem>;
  content: string;
  uploadFile: string[];
}

const useRemoteSendBoxDraft = getSendBoxDraftHook('remote', {
  _type: 'remote',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const RemoteSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  const [agentName, setAgentName] = useState('Remote Agent');
  const [aiProcessing, setAiProcessing] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({ description: '', subject: '' });

  const aiProcessingRef = useRef(aiProcessing);
  const hasContentInTurnRef = useRef(false);

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

  const { data: draftData, mutate: mutateDraft } = useRemoteSendBoxDraft(conversation_id);
  const atPath = draftData?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = draftData?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = draftData?.content ?? '';

  const setAtPath = useCallback(
    (val: Array<string | FileOrFolderItem>) => {
      mutateDraft((prev) => ({ ...(prev as RemoteDraftData), atPath: val }));
    },
    [mutateDraft]
  );

  const setUploadFile = createSetUploadFile(mutateDraft, draftData);

  const setContent = useCallback(
    (val: string) => {
      mutateDraft((prev) => ({ ...(prev as RemoteDraftData), content: val }));
    },
    [mutateDraft]
  );

  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  useEffect(() => {
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;

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
      if (conversation_id !== message.conversation_id) return;

      switch (message.type) {
        case 'thought':
          if (!aiProcessingRef.current) {
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'finish':
          setAiProcessing(false);
          aiProcessingRef.current = false;
          setThought({ subject: '', description: '' });
          hasContentInTurnRef.current = false;
          break;
        case 'content':
        case 'acp_permission': {
          hasContentInTurnRef.current = true;
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
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then(async (res) => {
      if (res?.extra?.workspace) setWorkspacePath(res.extra.workspace);
      const extra = res?.extra as { remoteAgentId?: string } | undefined;
      if (extra?.remoteAgentId) {
        const agent = await ipcBridge.remoteAgent.get.invoke({ id: extra.remoteAgentId });
        if (agent?.name) setAgentName(agent.name);
      }
    });
  }, [conversation_id]);

  // Handle initial message from Guid page
  useEffect(() => {
    const storageKey = `remote_initial_message_${conversation_id}`;
    const processedKey = `remote_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;
      if (sessionStorage.getItem(processedKey)) return;

      try {
        sessionStorage.setItem(processedKey, 'true');
        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        const msg_id = `initial_${conversation_id}_${Date.now()}`;
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
        setAiProcessing(true);
        aiProcessingRef.current = true;

        void checkAndUpdateTitle(conversation_id, input);
        await ipcBridge.conversation.sendMessage.invoke({
          input: initialDisplayMessage,
          msg_id,
          conversation_id,
          files,
        });
        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch {
        sessionStorage.removeItem(processedKey);
        setAiProcessing(false);
        aiProcessingRef.current = false;
      }
    };

    // Small delay to let the component mount and response stream listener attach
    const timer = setTimeout(() => void processInitialMessage(), 300);
    return () => clearTimeout(timer);
  }, [conversation_id, workspacePath, addOrUpdateMessage, checkAndUpdateTitle]);

  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      const filePaths = pastedFiles.map((file) => file.path);
      setUploadFile((prev) => [...prev, ...filePaths]);
    },
    [setUploadFile]
  );

  useAddEventListener('remote.selected.file', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      setAtPath(items);
    }, 10);
  });

  useAddEventListener('remote.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      const merged = mergeFileSelectionItems(atPathRef.current, items);
      if (merged !== atPathRef.current) {
        setAtPath(merged as Array<string | FileOrFolderItem>);
      }
    }, 10);
  });

  const sendRemoteMessage = useCallback(
    async (message: string) => {
      const msg_id = uuid();
      emitter.emit('remote.selected.file.clear');
      const currentAtPath = [...atPath];
      const currentUploadFile = [...uploadFile];
      setAtPath([]);
      setUploadFile([]);

      const filePaths = [
        ...currentUploadFile,
        ...currentAtPath.map((item) => (typeof item === 'string' ? item : item.path)),
      ];
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
        void checkAndUpdateTitle(conversation_id, message);
        const atPathStrings = currentAtPath.map((item) => (typeof item === 'string' ? item : item.path));
        await ipcBridge.conversation.sendMessage.invoke({
          input: displayMessage,
          msg_id,
          conversation_id,
          files: [...currentUploadFile, ...atPathStrings],
        });
        emitter.emit('chat.history.refresh');
      } catch {
        setAiProcessing(false);
        aiProcessingRef.current = false;
      }
    },
    [
      conversation_id,
      atPath,
      uploadFile,
      workspacePath,
      addOrUpdateMessage,
      checkAndUpdateTitle,
      setAtPath,
      setUploadFile,
    ]
  );

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  const handleStop = async (): Promise<void> => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
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
        onChange={setContent}
        loading={aiProcessing}
        disabled={false}
        className='z-10'
        placeholder={
          aiProcessing
            ? t('conversation.chat.processing')
            : t('acp.sendbox.placeholder', {
                backend: agentName,
                defaultValue: `Send message to ${agentName}...`,
              })
        }
        onStop={handleStop}
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={<FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />}
        prefix={
          uploadFile.length > 0 || atPath.some((item) => (typeof item === 'string' ? true : item.isFile)) ? (
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
                        const newAtPath = atPath.filter((v) => (typeof v === 'string' ? v !== path : v.path !== path));
                        setAtPath(newAtPath);
                      }}
                    />
                  );
                }
                return null;
              })}
            </HorizontalFileList>
          ) : undefined
        }
        onSend={sendRemoteMessage}
      />
    </div>
  );
};

export default RemoteSendBox;
