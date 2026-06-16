/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isErrorTipMessage, transformMessage } from '@/common/chat/chatLib';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import SendBox from '@/renderer/components/chat/SendBox';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile } from '@/renderer/hooks/chat/useSendBoxFiles';
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
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  const teamPermission = useTeamPermission();
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  const [agent_name, setAgentName] = useState('Remote Agent');
  const [aiProcessing, setAiProcessing] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
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
        if (ref.timer) { clearTimeout(ref.timer); ref.timer = null; }
        setThought(data);
      } else {
        ref.pending = data;
        if (!ref.timer) {
          ref.timer = setTimeout(() => {
            ref.lastUpdate = Date.now();
            ref.timer = null;
            if (ref.pending) { setThought(ref.pending); ref.pending = null; }
          }, THROTTLE_MS - (now - ref.lastUpdate));
        }
      }
    };
  }, []);

  useEffect(() => () => {
    if (thoughtThrottleRef.current.timer) clearTimeout(thoughtThrottleRef.current.timer);
  }, []);

  const { data: draftData, mutate: mutateDraft } = useRemoteSendBoxDraft(conversation_id);
  const atPath = draftData?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = draftData?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = draftData?.content ?? '';

  const setAtPath = useCallback((val: Array<string | FileOrFolderItem>) => {
    mutateDraft((prev) => ({ ...(prev as RemoteDraftData), atPath: val }));
  }, [mutateDraft]);

  const setUploadFile = createSetUploadFile(mutateDraft, draftData);

  const setContent = useCallback((val: string) => {
    mutateDraft((prev) => ({ ...(prev as RemoteDraftData), content: val }));
  }, [mutateDraft]);

  const handleContentChange = useCallback((val: string) => {
    if (val && teamPermission) teamPermission.warmupSession();
    setContent(val);
  }, [teamPermission, setContent]);

  const setContentRef = useLatestRef(setContent);
  const contentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);

  useEffect(() => {
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    setHasHydratedRunningState(false);

    void getConversationOrNull(conversation_id).then((res) => {
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
  }, [conversation_id]);

  useEffect(() => {
    const handler = (text: string) => {
      const new_content = content ? `${content}\n${text}` : text;
      setContentRef.current(new_content);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  useAddEventListener('sendbox.fill', (text: string) => {
    const prev = contentRef.current;
    setContentRef.current(prev ? `${prev}${text}` : text);
  }, []);

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) return;

      if (isErrorTipMessage(message)) {
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        const transformedMessage = transformMessage(message);
        if (transformedMessage) addOrUpdateMessage(transformedMessage);
        return;
      }

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
          if (transformedMessage) addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'agent_status': {
          const transformedMessage = transformMessage(message);
          if (transformedMessage) addOrUpdateMessage(transformedMessage);
          break;
        }
        default: {
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) addOrUpdateMessage(transformedMessage);
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage]);

  useEffect(() => {
    void getConversationOrNull(conversation_id).then(async (res) => {
      if (res?.extra?.workspace) setWorkspacePath(res.extra.workspace);
      const extra = res?.extra as { remoteAgentId?: string } | undefined;
      if (extra?.remoteAgentId) {
        const agent = await ipcBridge.remoteAgent.get.invoke({ id: extra.remoteAgentId });
        if (agent?.name) setAgentName(agent.name);
      }
    });
  }, [conversation_id]);

  // ────────────── GESTIONE MESSAGGIO INIZIALE (bypass Infinity Mind) ──────────────
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

        // Aggiunge subito il messaggio utente
        addOrUpdateMessage({
          id: `user_init_${Date.now()}`,
          conversation_id,
          role: 'user',
          content: [{ type: 'text', text: input }],
          status: 'Success',
          create_at: Date.now(),
        });

        setAiProcessing(true);
        aiProcessingRef.current = true;
        void checkAndUpdateTitle(conversation_id, input);

        // Chiamata diretta al backend Python
        const response = await fetch('http://localhost:8080/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input }),
        });
        const data = await response.json();

        // Aggiunge la risposta dell'assistente
        addOrUpdateMessage({
          id: `assistant_init_${Date.now()}`,
          conversation_id,
          role: 'assistant',
          content: [{ type: 'text', text: data.message || data.response || JSON.stringify(data) }],
          status: 'Success',
          create_at: Date.now(),
        });

        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch (error) {
        sessionStorage.removeItem(processedKey);
        Message.error("❌ Errore di connessione a Infinity Mind (porta 8080).");
      } finally {
        setAiProcessing(false);
        aiProcessingRef.current = false;
      }
    };

    const timer = setTimeout(() => void processInitialMessage(), 300);
    return () => clearTimeout(timer);
  }, [conversation_id, workspacePath, addOrUpdateMessage, checkAndUpdateTitle]);

  const handleFilesAdded = useCallback((pastedFiles: FileMetadata[]) => {
    const file_paths = pastedFiles.map((file) => file.path);
    setUploadFile((prev) => [...prev, ...file_paths]);
  }, [setUploadFile]);

  useAddEventListener('remote.selected.file', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => setAtPath(items), 10);
  });

  useAddEventListener('remote.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      const merged = mergeFileSelectionItems(atPathRef.current, items);
      if (merged !== atPathRef.current) setAtPath(merged as Array<string | FileOrFolderItem>);
    }, 10);
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      if (teamPermission) await teamPermission.warmupSession();

      setAiProcessing(true);
      aiProcessingRef.current = true;

      try {
        void checkAndUpdateTitle(conversation_id, input);

        addOrUpdateMessage({
          id: 'msg_user_' + Date.now(),
          conversation_id: conversation_id,
          role: 'user',
          content: [{ type: 'text', text: input }],
          status: 'Success',
          create_at: Date.now()
        });

        const response = await fetch('http://localhost:8080/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input })
        });
        const data = await response.json();

        addOrUpdateMessage({
          id: 'msg_ai_' + Date.now(),
          conversation_id: conversation_id,
          role: 'assistant',
          content: [{ type: 'text', text: data.message || data.response || JSON.stringify(data) }],
          status: 'Success',
          create_at: Date.now()
        });

        emitter.emit('chat.history.refresh');
      } catch (error) {
        Message.error("❌ Errore di connessione alla porta 8080 di Infinity Mind.");
        throw error;
      } finally {
        setAiProcessing(false);
        aiProcessingRef.current = false;
      }
    },
    [checkAndUpdateTitle, conversation_id, workspacePath, addOrUpdateMessage, teamPermission]
  );

  const {
    items: queuedCommands,
    isPaused: isQueuePaused,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue, remove, clear, reorder, pause, resume,
    lockInteraction, unlockInteraction, resetActiveExecution,
  } = useConversationCommandQueue({
    conversation_id: conversation_id,
    enabled: true,
    isBusy: aiProcessing,
    isHydrated: hasHydratedRunningState,
    onExecute: executeCommand,
  });

  const onSendHandler = useCallback(async (message: string) => {
    emitter.emit('remote.selected.file.clear');
    const currentAtPath = [...atPath];
    const currentUploadFile = [...uploadFile];
    setAtPath([]);
    setUploadFile([]);
    const file_paths = [
      ...currentUploadFile,
      ...currentAtPath.map((item) => (typeof item === 'string' ? item : item.path)),
    ];

    // --- INIZIO BYPASS DIRETTO INFINITY MIND ---
    try {
      console.log("🚀 Inviando a Python (Porta 8080):", message);

      // 1. Disegna il TUO messaggio a schermo
      // @ts-ignore
      addOrUpdateMessage({
        id: 'msg_user_' + Date.now(),
        conversation_id: conversation_id,
        role: 'user',
        content: [{ type: 'text', text: message }],
        status: 'Success',
        create_at: Date.now()
      });

      // 2. Chiama il server Python tramite XHR (Il Tunnel)
      const data: any = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "http://localhost:8080/api/chat", true);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.onreadystatechange = function () {
              if (xhr.readyState === 4) {
                  if (xhr.status === 200) {
                      try {
                          resolve(JSON.parse(xhr.responseText));
                      } catch(e) {
                          resolve({ response: xhr.responseText });
                      }
                  } else {
                      reject("Errore HTTP: " + xhr.status);
                  }
              }
          };
          xhr.onerror = function () { reject("Errore di Rete"); };
          xhr.send(JSON.stringify({ message: message }));
      });
      
      // Estrai il testo dalla risposta Python
      const testoRisposta = data.message || data.response || JSON.stringify(data);

      // 3. Disegna la RISPOSTA a schermo
      // @ts-ignore
      addOrUpdateMessage({
        id: 'msg_ai_' + Date.now(),
        conversation_id: conversation_id,
        role: 'assistant',
        content: [{ type: 'text', text: testoRisposta }],
        status: 'Success',
        create_at: Date.now()
      });

      emitter.emit('chat.history.refresh');
      return; // 🛑 BLOCCA L'ESECUZIONE DEL VECCHIO MOTORE NATIVO
    } catch (error) {
      console.error("❌ Errore API Python:", error);
      return;
    }
    // --- FINE BYPASS DIRETTO INFINITY MIND ---

    if (shouldEnqueueConversationCommand({ enabled: true, isBusy: aiProcessing, hasPendingCommands })) {
      enqueue({ input: message, files: file_paths });
      return;
    }

    await executeCommand({ input: message, files: file_paths });
  }, [aiProcessing, atPath, enqueue, executeCommand, hasPendingCommands, setAtPath, setUploadFile, uploadFile]);

  const handleEditQueuedCommand = useCallback((item: ConversationCommandQueueItem) => {
    remove(item.id);
    setContent(item.input);
    setUploadFile(Array.from(new Set(item.files)));
    setAtPath([]);
    emitter.emit('remote.selected.file.clear');
  }, [remove, setAtPath, setContent, setUploadFile]);

  const appendSelectedFiles = useCallback((files: string[]) => {
    setUploadFile((prev) => [...prev, ...files]);
  }, [setUploadFile]);

  const { openFileSelector } = useOpenFileSelector({ onFilesSelected: appendSelectedFiles });

  const handleStop = async (): Promise<void> => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } catch (error) {
      console.warn('[RemoteSendBox] stop request failed', error);
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
        items={queuedCommands}
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
        onSelectedWorkspaceItemsChange={setAtPath}
        loading={aiProcessing}
        disabled={false}
        className='z-10'
        placeholder={
          aiProcessing
            ? t('conversation.chat.processing')
            : t('acp.sendbox.placeholder', {
                backend: agent_name,
                defaultValue: `Send message to ${agent_name}...`,
              })
        }
        onStop={handleStop}
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={<FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />}
        prefix={
          uploadFile.length > 0 ? (
            <HorizontalFileList>
              {uploadFile.map((path) => (
                <FilePreview
                  key={path}
                  path={path}
                  onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))}
                />
              ))}
            </HorizontalFileList>
          ) : undefined
        }
        onSend={onSendHandler}
        allowSendWhileLoading
      />
    </div>
  );
};

export default RemoteSendBox;