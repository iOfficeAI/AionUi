/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
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
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import { allSupportedExts } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/file/messageFiles';
import { Message, Tag } from '@arco-design/web-react';
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

  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  const executeCommand = useCallback(
    async (input: string, files: string[]) => {
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

  const handleSend = async (message: string) => {
    if (isBusy) {
      Message.warning(t('messages.conversationInProgress'));
      return;
    }

    const filesToSend = collectSelectedFiles(uploadFile, atPath);
    clearFiles();
    emitter.emit('codex.selected.file.clear');

    await executeCommand(message, filesToSend);
  };

  const handleStop = async (): Promise<void> => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      messageState.resetState();
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <div className='flex justify-end mb-8px'>
        <AcpModelSelector conversationId={conversation_id} backend='codex' />
      </div>
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
