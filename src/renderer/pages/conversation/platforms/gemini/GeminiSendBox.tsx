import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import AgentSetupCard from '@/renderer/components/agent/AgentSetupCard';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import SendBox from '@/renderer/components/chat/sendbox';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import { useAgentReadinessCheck } from '@/renderer/hooks/agent/useAgentReadinessCheck';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { allSupportedExts } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/file/messageFiles';
import { getModelContextLimit } from '@/renderer/utils/model/modelContextLimits';
import { Message, Tag } from '@arco-design/web-react';
import { Shield } from '@icon-park/react';
import { iconColors } from '@/renderer/styles/colors';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import { useCommandQueueEnabled } from '@/renderer/hooks/system/useCommandQueueEnabled';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GeminiModelSelection } from './useGeminiModelSelection';
import { useGeminiMessage } from './useGeminiMessage';
import { useGeminiQuotaFallback } from './useGeminiQuotaFallback';
import { useGeminiInitialMessage } from './useGeminiInitialMessage';

const useGeminiSendBoxDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useGeminiSendBoxDraft(conversation_id);

  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (nextAtPath: Array<string | FileOrFolderItem>) => {
      mutate((prev) => ({ ...prev, atPath: nextAtPath }));
    },
    [data, mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (nextContent: string) => {
      mutate((prev) => ({ ...prev, content: nextContent }));
    },
    [data, mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
};

const GeminiSendBox: React.FC<{
  conversation_id: string;
  modelSelection: GeminiModelSelection;
  teamId?: string;
  agentSlotId?: string;
}> = ({ conversation_id, modelSelection, teamId, agentSlotId }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  const isCommandQueueEnabled = useCommandQueueEnabled();
  const showModeSelector = !teamPermission || teamPermission.isLeadAgent;
  const { checkAndUpdateTitle } = useAutoTitle();

  // Agent auto-detection state - only for new conversation + no auth scenario
  const [showSetupCard, setShowSetupCard] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(true);
  const autoSwitchTriggeredRef = useRef(false);

  const { currentModel, getDisplayModelName, providers, geminiModeLookup, getAvailableModels, handleSelectModel } =
    modelSelection;

  // Check if no auth (no Google login AND no API key configured)
  const hasNoAuth = providers.length === 0;

  // Agent readiness check - only used when no auth
  const {
    isChecking: agentIsChecking,
    error: agentError,
    availableAgents,
    bestAgent,
    progress: checkProgress,
    currentAgent,
    performFullCheck,
    reset: resetAgentCheck,
  } = useAgentReadinessCheck({
    conversationType: 'gemini',
    autoCheck: false,
  });

  const { handleGeminiError } = useGeminiQuotaFallback({
    currentModel,
    providers,
    geminiModeLookup,
    getAvailableModels,
    handleSelectModel,
  });

  const {
    thought,
    running,
    hasHydratedRunningState,
    tokenUsage,
    setActiveMsgId,
    setWaitingResponse,
    resetState,
    hasThinkingMessage,
  } = useGeminiMessage(conversation_id, handleGeminiError);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  useGeminiInitialMessage({
    conversationId: conversation_id,
    currentModelId: currentModel?.useModel,
    hasNoAuth,
    setContent,
    setActiveMsgId,
    setWaitingResponse,
    autoSwitchTriggeredRef,
    setShowSetupCard,
    performFullCheck,
  });

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  // Reset conversation state (detection only triggers on new message, not on mount/tab-switch)
  useEffect(() => {
    setShowSetupCard(false);
    setIsNewConversation(true);
    autoSwitchTriggeredRef.current = false;
    resetAgentCheck();

    void ipcBridge.database.getConversationMessages
      .invoke({ conversation_id, page: 0, pageSize: 1 })
      .then((messages) => {
        const hasMessages = messages && messages.length > 0;
        setIsNewConversation(!hasMessages);
      });
  }, [conversation_id, resetAgentCheck]);

  // Dismiss the setup card
  const handleDismissSetupCard = useCallback(() => {
    setShowSetupCard(false);
  }, []);

  // Retry agent check
  const handleRetryCheck = useCallback(() => {
    void performFullCheck();
  }, [performFullCheck]);

  const slashCommands = useSlashCommands(conversation_id);

  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const { setSendBoxHandler } = usePreviewContext();
  const isBusy = running;

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      const newContent = content ? `${content}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  // Listen for sendbox.fill event to populate input from external sources
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      if (!currentModel?.useModel) {
        Message.warning(t('conversation.chat.noModelSelected'));
        throw new Error('No model selected');
      }

      const msg_id = uuid();
      setActiveMsgId(msg_id);
      setWaitingResponse(true);

      const displayMessage = buildDisplayMessage(input, files, workspacePath);

      // In team mode, the backend writes the user message via IPC stream.
      // Adding it here too would produce a duplicate bubble.
      if (!teamId) {
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
      }

      try {
        void checkAndUpdateTitle(conversation_id, input);
        if (teamId) {
          if (agentSlotId) {
            const result = await ipcBridge.team.sendMessageToAgent.invoke({
              teamId,
              slotId: agentSlotId,
              content: displayMessage,
            });
            const maybeError = result as unknown as { __bridgeError?: boolean; message?: string };
            if (maybeError.__bridgeError) {
              throw new Error(maybeError.message || 'Failed to send message to agent');
            }
          } else {
            const result = await ipcBridge.team.sendMessage.invoke({ teamId, content: displayMessage });
            const maybeError = result as unknown as { __bridgeError?: boolean; message?: string };
            if (maybeError.__bridgeError) {
              throw new Error(maybeError.message || 'Failed to send message to team');
            }
          }
        } else {
          const result = await ipcBridge.geminiConversation.sendMessage.invoke({
            input: displayMessage,
            msg_id,
            conversation_id,
            files,
          });
          assertBridgeSuccess(result, 'Failed to send message to Gemini');
        }
        emitter.emit('chat.history.refresh');
        if (files.length > 0) {
          emitter.emit('gemini.workspace.refresh');
        }
      } catch (error) {
        removeMessageByMsgId(msg_id);
        throw error;
      }
    },
    [
      addOrUpdateMessage,
      agentSlotId,
      checkAndUpdateTitle,
      conversation_id,
      currentModel?.useModel,
      setActiveMsgId,
      removeMessageByMsgId,
      setWaitingResponse,
      teamId,
      workspacePath,
    ]
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
    isHydrated: hasHydratedRunningState,
    onExecute: executeCommand,
  });

  const onSendHandler = async (message: string) => {
    if (!teamId && !isCommandQueueEnabled && isBusy) {
      Message.warning(t('messages.conversationInProgress'));
      return;
    }

    const filesToSend = collectSelectedFiles(uploadFile, atPath);
    clearFiles();
    emitter.emit('gemini.selected.file.clear');

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
      emitter.emit('gemini.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  useAddEventListener('gemini.selected.file', setAtPath);
  useAddEventListener('gemini.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    // Use finally to ensure UI state is reset even if backend stop fails
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      resetState();
      resetActiveExecution('stop');
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      {/* Agent Setup Card - only show for new conversation + no auth, auto-switch to available agent */}
      {showSetupCard && isNewConversation && hasNoAuth && (
        <AgentSetupCard
          conversationId={conversation_id}
          currentAgent={currentAgent}
          error={agentError}
          isChecking={agentIsChecking}
          progress={checkProgress}
          availableAgents={availableAgents}
          bestAgent={bestAgent}
          onDismiss={handleDismissSetupCard}
          onRetry={handleRetryCheck}
          autoSwitch={true}
          initialMessage={content}
        />
      )}

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
      <ThoughtDisplay
        thought={hasThinkingMessage ? undefined : thought}
        running={running && !hasThinkingMessage}
        onStop={handleStop}
      />

      <SendBox
        value={content}
        onChange={setContent}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('gemini.selected.file', items);
          setAtPath(items);
        }}
        loading={isBusy}
        disabled={!currentModel?.useModel}
        placeholder={
          currentModel?.useModel
            ? t('conversation.chat.sendMessageTo', { model: getDisplayModelName(currentModel.useModel) })
            : t('conversation.chat.noModelSelected')
        }
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={
          <div className='flex items-center gap-4px'>
            <FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />
            {showModeSelector && (
              <AgentModeSelector
                backend='gemini'
                conversationId={conversation_id}
                compact
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
                onModeChanged={teamPermission?.propagateMode}
              />
            )}
          </div>
        }
        sendButtonPrefix={
          <ContextUsageIndicator
            tokenUsage={tokenUsage}
            contextLimit={getModelContextLimit(currentModel?.useModel)}
            size={24}
          />
        }
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
                          emitter.emit('gemini.selected.file', newAtPath);
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
        allowSendWhileLoading={isCommandQueueEnabled}
      ></SendBox>
    </div>
  );
};

export default GeminiSendBox;
