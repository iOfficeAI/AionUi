/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import SendBox from '@/renderer/components/chat/sendbox';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { iconColors } from '@/renderer/styles/colors';
import { Shield } from '@icon-park/react';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRemoteMessage } from './useRemoteMessage';

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

const RemoteSendBox: React.FC<{ conversation_id: string; session_mode?: string }> = ({
  conversation_id,
  session_mode,
}) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const { setSendBoxHandler } = usePreviewContext();

  const [agent_name, setAgentName] = useState('Remote Agent');
  // Remote agents support multiple protocols (opencode, openclaw, ...). Only
  // OpenCode exposes per-prompt mode switching (build/plan) and a slash-
  // command catalog (GET /command), so we gate both on the protocol
  // resolved from the remote-agent row.
  const [protocol, setProtocol] = useState<string | undefined>(undefined);

  // Slash commands. Pass the synthetic `conversation_type: 'opencode'` only
  // when the remote agent's protocol is OpenCode — that's what the
  // `availability.ts` whitelist matches. `agentStatus` is gated on the
  // protocol load itself: until we know we're on opencode the hook stays
  // dormant, then flips to `'active'` to trigger the catalog fetch.
  const slashConversationType = protocol === 'opencode' ? 'opencode' : undefined;
  const slash_commands = useSlashCommands(conversation_id, {
    conversation_type: slashConversationType,
    agentStatus: protocol === 'opencode' ? 'active' : null,
  });
  // Stream-state machine (event handling, hydration, thought/processing state)
  // lives in the hook; the send box only consumes the parts it renders.
  const {
    thought,
    aiProcessing,
    setAiProcessing,
    hasHydratedRunningState,
    hasThinkingMessage,
    tokenUsage,
    context_limit,
    resetState,
  } = useRemoteMessage(conversation_id);

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
    void getConversationOrNull(conversation_id).then(async (res) => {
      if (res?.extra?.workspace) setWorkspacePath(res.extra.workspace);
      // The Rust backend persists the FK as `remote_agent_id` (snake_case),
      // while older paths used the camelCase variant. Read both so the
      // lookup survives either spelling.
      const extra = res?.extra as { remoteAgentId?: string; remote_agent_id?: string } | undefined;
      const remoteAgentId = extra?.remoteAgentId || extra?.remote_agent_id;
      if (remoteAgentId) {
        const agent = await ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId });
        if (agent?.name) setAgentName(agent.name);
        if (agent?.protocol) setProtocol(agent.protocol);
      }
    });
  }, [conversation_id]);

  // Handle initial message from Guid page.
  // Key matches the writer in `useGuidSend.ts` (`acp_initial_message_*`) —
  // the "acp" prefix is a historical name shared by all platforms, not an
  // ACP-only marker.  Without this, the first message stashed on the Guid
  // page never reaches the chat thread for remote agents.
  useEffect(() => {
    const storageKey = `acp_initial_message_${conversation_id}`;
    const processedKey = `acp_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;
      if (sessionStorage.getItem(processedKey)) return;

      try {
        sessionStorage.setItem(processedKey, 'true');
        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        const initialDisplayMessage = buildDisplayMessage(input, files, workspacePath);

        setAiProcessing(true);

        void checkAndUpdateTitle(conversation_id, input);
        // Fetch the server-assigned msg_id before rendering the optimistic
        // bubble so the local row uses the same id as the persisted DB row.
        const sendResult = await ipcBridge.conversation.sendMessage.invoke({
          input: initialDisplayMessage,
          conversation_id,
          files,
        });
        const { msg_id } = sendResult;

        const userMessage: TMessage = {
          id: msg_id,
          msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: { content: initialDisplayMessage },
          created_at: Date.now(),
        };
        // Use add=false (compose mode) so composeMessageWithIndex can de-dup
        // by msg_id against the DB row that useMessageLstCache may insert.
        addOrUpdateMessage(userMessage);

        emitter.emit('chat.history.refresh');
        sessionStorage.removeItem(storageKey);
      } catch {
        sessionStorage.removeItem(processedKey);
        setAiProcessing(false);
      }
    };

    // Small delay to let the component mount and response stream listener attach
    const timer = setTimeout(() => void processInitialMessage(), 300);
    return () => clearTimeout(timer);
  }, [conversation_id, workspacePath, addOrUpdateMessage, checkAndUpdateTitle]);

  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      const file_paths = pastedFiles.map((file) => file.path);
      setUploadFile((prev) => [...prev, ...file_paths]);
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

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      if (teamPermission) await teamPermission.warmupSession();
      const displayMessage = buildDisplayMessage(input, files, workspacePath);

      setAiProcessing(true);

      let msg_id: string | null = null;
      try {
        void checkAndUpdateTitle(conversation_id, input);
        // Wait for the server-assigned msg_id before rendering the optimistic
        // user bubble so the local row uses the same id as the DB row and
        // subsequent WebSocket stream events — avoids duplicate bubbles when
        // useMessageLstCache reloads.
        const res = await ipcBridge.conversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id,
          files,
        });
        msg_id = res.msg_id;
        const userMessage: TMessage = {
          id: msg_id,
          msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: { content: displayMessage },
          created_at: Date.now(),
        };
        // Use add=false (compose mode) so composeMessageWithIndex can de-dup
        // by msg_id against the DB row that useMessageLstCache may insert.
        addOrUpdateMessage(userMessage);
        emitter.emit('chat.history.refresh');
      } catch (error) {
        if (msg_id) removeMessageByMsgId(msg_id);
        setAiProcessing(false);
        throw error;
      }
    },
    [addOrUpdateMessage, checkAndUpdateTitle, conversation_id, removeMessageByMsgId, workspacePath]
  );

  const {
    items: queuedCommands,
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

  const onSendHandler = useCallback(
    async (message: string) => {
      emitter.emit('remote.selected.file.clear');
      const currentAtPath = [...atPath];
      const currentUploadFile = [...uploadFile];
      setAtPath([]);
      setUploadFile([]);
      const file_paths = [
        ...currentUploadFile,
        ...currentAtPath.map((item) => (typeof item === 'string' ? item : item.path)),
      ];

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
    },
    [aiProcessing, atPath, enqueue, executeCommand, hasPendingCommands, setAtPath, setUploadFile, uploadFile]
  );

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      setUploadFile(Array.from(new Set(item.files)));
      setAtPath([]);
      emitter.emit('remote.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
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
    // Best-effort cancel: swallow rejections (e.g. backend returns 409 when
    // the WS session is not yet connected) so they don't surface as unhandled
    // rejections. UI state is still reset via finally.
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } catch (error) {
      console.warn('[RemoteSendBox] stop request failed', error);
    } finally {
      resetState();
      resetActiveExecution('stop');
    }
  };

  return (
    <div className='max-w-1100px w-full mx-auto flex flex-col mt-auto'>
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
      <ThoughtDisplay thought={thought} running={aiProcessing && !hasThinkingMessage} onStop={handleStop} />

      <SendBox
        value={content}
        onChange={handleContentChange}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={setAtPath}
        slash_commands={slash_commands}
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
        rightTools={
          <div className='flex items-center gap-8px'>
            {/* Self-hides until the backend reports usage (OpenCode emits it on
                turn finish; other remote protocols may not — then it stays hidden). */}
            <ContextUsageIndicator
              tokenUsage={tokenUsage}
              context_limit={context_limit > 0 ? context_limit : undefined}
            />
            {protocol === 'opencode' ? (
              <AgentModeSelector
                backend='opencode'
                conversation_id={conversation_id}
                compact
                initialMode={session_mode}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
              />
            ) : null}
          </div>
        }
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
