/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import AcpConfigSelector from '@/renderer/components/agent/AcpConfigSelector';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import SendBox from '@/renderer/components/chat/sendbox';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useCommandQueueEnabled } from '@/renderer/hooks/system/useCommandQueueEnabled';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/file/messageFiles';
import { Message, Tag } from '@arco-design/web-react';
import { Shield } from '@icon-park/react';
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCodexMessage, type UseCodexMessageReturn } from './useCodexMessage';

const useCodexSendBoxDraft = getSendBoxDraftHook('codex', {
  _type: 'codex',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

type CodexSendBoxBaseProps = {
  conversation_id: string;
  workspacePath?: string;
  sessionMode?: string;
  cachedConfigOptions?: unknown[];
};

type CodexSendBoxProps = CodexSendBoxBaseProps & {
  messageState?: UseCodexMessageReturn;
};

function useSendBoxDraft(conversationId: string) {
  const { data, mutate } = useCodexSendBoxDraft(conversationId);

  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (nextAtPath: Array<string | FileOrFolderItem>) => {
      mutate((prev) => ({ ...prev, atPath: nextAtPath }));
    },
    [mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (nextContent: string) => {
      mutate((prev) => ({ ...prev, content: nextContent }));
    },
    [mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
}

function formatActivityText(
  activity: UseCodexMessageReturn['activity'],
  t: ReturnType<typeof useTranslation>['t']
): string | undefined {
  if (!activity) return undefined;

  switch (activity.phase) {
    case 'waiting':
      return t('codex.runtime.activity.waiting');
    case 'thinking':
      return t('codex.runtime.activity.thinking');
    case 'streaming':
      return t('codex.runtime.activity.streaming');
    case 'permission':
      return t('codex.runtime.activity.permission');
    case 'tool':
      return activity.title
        ? t('codex.runtime.activity.toolWithName', { tool: activity.title })
        : t('codex.runtime.activity.tool');
  }
}

const CodexSendBoxInner: React.FC<CodexSendBoxBaseProps & { messageState: UseCodexMessageReturn }> = ({
  conversation_id,
  workspacePath,
  sessionMode,
  cachedConfigOptions,
  messageState,
}) => {
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const slashCommands = useSlashCommands(conversation_id);
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const { setSendBoxHandler } = usePreviewContext();
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });
  const isCommandQueueEnabled = useCommandQueueEnabled();

  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);
  const isBusy = messageState.running;
  const activityText = formatActivityText(messageState.activity, t);

  useEffect(() => {
    const handler = (text: string) => {
      const newContent = content ? `${content}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [content, setContentRef, setSendBoxHandler]);

  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

  useAddEventListener('codex.selected.file', setAtPath);
  useAddEventListener('codex.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );

  const { openFileSelector, openDirectorySelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const msg_id = uuid();
      const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

      addOrUpdateMessage(
        {
          id: msg_id,
          type: 'text',
          position: 'right',
          conversation_id,
          content: {
            content: displayMessage,
          },
          createdAt: Date.now(),
        },
        true
      );

      try {
        void checkAndUpdateTitle(conversation_id, input);
        const result = await ipcBridge.conversation.sendMessage.invoke({
          input: displayMessage,
          msg_id,
          conversation_id,
          files,
        });
        assertBridgeSuccess(result, 'Failed to send message to Codex');
        emitter.emit('chat.history.refresh');
        if (files.length > 0) {
          emitter.emit('codex.workspace.refresh');
        }
      } catch (error) {
        removeMessageByMsgId(msg_id);
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
    conversationId: conversation_id,
    enabled: isCommandQueueEnabled,
    isBusy,
    isHydrated: messageState.hasHydratedRunningState,
    onExecute: executeCommand,
  });

  useEffect(() => {
    if (!conversation_id) return;

    const storageKey = `codex_initial_message_${conversation_id}`;
    const processedKey = `codex_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      if (sessionStorage.getItem(processedKey)) return;

      const storedMessage = sessionStorage.getItem(storageKey);
      if (!storedMessage) return;

      sessionStorage.setItem(processedKey, '1');
      sessionStorage.removeItem(storageKey);

      try {
        const { input, files: initialFiles } = JSON.parse(storedMessage) as { input: string; files?: string[] };
        await executeCommand({
          input,
          files: Array.isArray(initialFiles) ? initialFiles : [],
        });
      } catch (error) {
        console.error('[CodexSendBox] Failed to send initial message:', error);
        sessionStorage.removeItem(processedKey);
      }
    };

    void processInitialMessage();
  }, [conversation_id, executeCommand]);

  const handleSend = async (message: string) => {
    if (!isCommandQueueEnabled && isBusy) {
      Message.warning(t('messages.conversationInProgress'));
      return;
    }

    const filesToSend = collectSelectedFiles(uploadFile, atPath);
    clearFiles();
    emitter.emit('codex.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: isCommandQueueEnabled,
        isBusy,
        hasPendingCommands,
      })
    ) {
      enqueue({ input: message, files: filesToSend });
      return;
    }

    await executeCommand({ input: message, files: filesToSend });
  };

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      setUploadFile(Array.from(new Set(item.files)));
      setAtPath([]);
      emitter.emit('codex.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  const handleStop = async (): Promise<void> => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      messageState.resetState();
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
      <ThoughtDisplay running={isBusy} thought={messageState.thought} statusText={activityText} />
      <SendBox
        value={content}
        onChange={setContent}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('codex.selected.file', items);
          setAtPath(items);
        }}
        loading={isBusy}
        disabled={false}
        placeholder={t('codex.sendbox.placeholder')}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        supportedExts={allSupportedExts}
        allowSendWhileLoading={isCommandQueueEnabled}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={
          <div className='flex items-center gap-4px'>
            <FileAttachButton
              openFileSelector={openFileSelector}
              openDirectorySelector={openDirectorySelector}
              onLocalFilesAdded={handleFilesAdded}
            />
            <AgentModeSelector
              backend='codex'
              conversationId={conversation_id}
              compact
              initialMode={sessionMode}
              compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
              modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
              compactLabelPrefix={t('agentMode.permission')}
              hideCompactLabelPrefixOnMobile
            />
            <AcpConfigSelector
              backend='codex'
              conversationId={conversation_id}
              initialConfigOptions={cachedConfigOptions}
            />
          </div>
        }
        prefix={
          <>
            {uploadFile.length > 0 && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview
                    key={path}
                    path={path}
                    onRemove={() => setUploadFile(uploadFile.filter((value) => value !== path))}
                  />
                ))}
              </HorizontalFileList>
            )}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string' || item.isFile) return null;

                  return (
                    <Tag
                      key={item.path}
                      color='blue'
                      closable
                      onClose={() => {
                        const nextAtPath = atPath.filter((value) =>
                          typeof value === 'string' ? true : value.path !== item.path
                        );
                        emitter.emit('codex.selected.file', nextAtPath);
                        setAtPath(nextAtPath);
                      }}
                    >
                      {item.name}
                    </Tag>
                  );
                })}
              </div>
            )}
          </>
        }
        onSend={handleSend}
        slashCommands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        sendButtonPrefix={
          messageState.tokenUsage ? (
            <ContextUsageIndicator
              tokenUsage={messageState.tokenUsage}
              contextLimit={messageState.contextLimit > 0 ? messageState.contextLimit : undefined}
              size={24}
            />
          ) : undefined
        }
      />
    </div>
  );
};

const CodexSendBoxWithHook: React.FC<CodexSendBoxBaseProps> = (props) => {
  const messageState = useCodexMessage(props.conversation_id);
  return <CodexSendBoxInner {...props} messageState={messageState} />;
};

const CodexSendBox: React.FC<CodexSendBoxProps> = ({ messageState, ...props }) => {
  if (messageState) {
    return <CodexSendBoxInner {...props} messageState={messageState} />;
  }

  return <CodexSendBoxWithHook {...props} />;
};

export default CodexSendBox;
