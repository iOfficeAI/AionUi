import { ipcBridge } from '@/common';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import type { AcpBackend } from '@/common/types/acpTypes';
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
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import {
  useAddOrUpdateMessage,
  useMessageList,
  useReloadMessageListFromDatabase,
} from '@/renderer/pages/conversation/Messages/hooks';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { Button, Message, Tag } from '@arco-design/web-react';
import { Shield } from '@icon-park/react';
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAcpInitialMessage } from './useAcpInitialMessage';
import { useAcpMessage } from './useAcpMessage';

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const assertTeamBridgeSuccess = (
  result: void | { __bridgeError?: boolean; message?: string },
  fallbackMessage: string
): void => {
  if (result && typeof result === 'object' && '__bridgeError' in result && result.__bridgeError) {
    throw new Error(result.message || fallbackMessage);
  }
};

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAcpSendBoxDraft(conversation_id);
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

const AcpSendBox: React.FC<{
  conversation_id: string;
  backend: AcpBackend;
  sessionMode?: string;
  cachedConfigOptions?: import('@/common/types/acpTypes').AcpSessionConfigOption[];
  agentName?: string;
  workspacePath?: string;
  teamId?: string;
  agentSlotId?: string;
}> = ({
  conversation_id,
  backend,
  sessionMode,
  cachedConfigOptions,
  agentName,
  workspacePath,
  teamId,
  agentSlotId,
}) => {
  const {
    running,
    hasHydratedRunningState,
    acpStatus,
    aiProcessing,
    setAiProcessing,
    resetState,
    resetConversationState,
    tokenUsage,
    contextLimit,
    hasThinkingMessage,
  } = useAcpMessage(conversation_id);
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  // In team mode, all agents show the permission mode selector (members don't propagate)
  const showModeSelector = true;
  const isLeaderInTeam = teamPermission && conversation_id === teamPermission.leaderConversationId;
  const { checkAndUpdateTitle } = useAutoTitle();
  const slashCommands = useSlashCommands(conversation_id, { agentStatus: acpStatus });
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const { setSendBoxHandler } = usePreviewContext();

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);
  const messageList = useMessageList();
  const reloadMessageListFromDatabase = useReloadMessageListFromDatabase(conversation_id);
  const [rewindSelectionOpen, setRewindSelectionOpen] = React.useState(false);
  const [rewindPending, setRewindPending] = React.useState(false);
  const [rewindActiveIndex, setRewindActiveIndex] = React.useState(0);
  const rewindRowRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });
  const isBusy = running || aiProcessing;
  // Rewind candidates are ordered oldest -> newest (top to bottom), matching
  // the Claude Code CLI's /rewind picker. The most recent turn lives at the
  // bottom of the list and is the default selection (rewinding to "before
  // this prompt" mirrors CLI muscle memory: Enter without arrow keys
  // == undo last turn).
  const rewindCandidates = React.useMemo(() => {
    const userTextMessages = messageList.filter(
      (message): message is Extract<(typeof messageList)[number], { type: 'text' }> =>
        message.conversation_id === conversation_id &&
        message.type === 'text' &&
        message.position === 'right' &&
        !message.hidden &&
        typeof message.content.content === 'string' &&
        message.content.content.trim().length > 0
    );
    const totalTurns = userTextMessages.length;
    return userTextMessages.map((message, index) => {
      const turnsAfter = totalTurns - 1 - index;
      const turnsBefore = index;
      return {
        id: message.id,
        input: message.content.content,
        title:
          turnsAfter === 0
            ? t('chat.rewind.mostRecentTurn', { defaultValue: 'Most recent turn' })
            : t('chat.rewind.turnOffset', {
                defaultValue: `${turnsAfter} turns ago`,
              }),
        description: message.content.content.replace(/\s+/g, ' ').trim().slice(0, 160),
        discardCount: turnsAfter + 1,
        keepCount: turnsBefore,
      };
    });
  }, [conversation_id, messageList, t]);
  const rewindCandidatesRef = useLatestRef(rewindCandidates);
  const rewindActiveIndexRef = useLatestRef(rewindActiveIndex);
  const rewindPendingRef = useLatestRef(rewindPending);

  // Default the active row to the most recent turn (bottom of the picker)
  // every time the picker opens or the candidate list changes shape. This
  // mirrors Claude Code CLI: pressing Enter without arrows = undo last turn.
  useEffect(() => {
    if (!rewindSelectionOpen) return;
    setRewindActiveIndex(Math.max(0, rewindCandidates.length - 1));
  }, [rewindSelectionOpen, rewindCandidates.length]);

  // Keep the active row in view while the user navigates with the keyboard
  // — without this the highlight scrolls off the top/bottom on long lists.
  useEffect(() => {
    if (!rewindSelectionOpen) return;
    const activeRow = rewindRowRefs.current[rewindActiveIndex];
    activeRow?.scrollIntoView({ block: 'nearest' });
  }, [rewindActiveIndex, rewindSelectionOpen]);

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // If there's existing content, add newline and new text; otherwise just set the text
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

  // Check for and send initial message from guid page
  useAcpInitialMessage({
    conversationId: conversation_id,
    backend,
    workspacePath,
    setAiProcessing,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessageRef.current,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const msg_id = uuid();
      const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

      setAiProcessing(true);

      try {
        void checkAndUpdateTitle(conversation_id, input);
        if (teamId) {
          if (agentSlotId) {
            const result = await ipcBridge.team.sendMessageToAgent.invoke({
              teamId,
              slotId: agentSlotId,
              content: displayMessage,
              files,
            });
            assertTeamBridgeSuccess(result, 'Failed to send message to agent');
          } else {
            const result = await ipcBridge.team.sendMessage.invoke({ teamId, content: displayMessage, files });
            assertTeamBridgeSuccess(result, 'Failed to send message to team');
          }
        } else {
          const result = await ipcBridge.acpConversation.sendMessage.invoke({
            input: displayMessage,
            msg_id,
            conversation_id,
            files,
          });
          assertBridgeSuccess(result, `Failed to send message to ${backend}`);
        }
        emitter.emit('chat.history.refresh');
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isAuthError =
          errorMsg.includes('[ACP-AUTH-') ||
          errorMsg.includes('authentication failed') ||
          errorMsg.includes('认证失败');
        if (isAuthError) {
          const errorMessage = {
            id: uuid(),
            msg_id: uuid(),
            conversation_id,
            type: 'error',
            data: t('acp.auth.failed', {
              backend,
              error: errorMsg,
              defaultValue: `${backend} authentication failed:

{{error}}

Please check your local CLI tool authentication status`,
            }),
          };

          ipcBridge.acpConversation.responseStream.emit(errorMessage);
        }

        setAiProcessing(false);
        throw error;
      }

      if (files.length > 0) {
        emitter.emit('acp.workspace.refresh');
      }
    },
    [agentSlotId, backend, checkAndUpdateTitle, conversation_id, setAiProcessing, t, teamId, workspacePath]
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
    enabled: true,
    isBusy,
    isHydrated: hasHydratedRunningState,
    onExecute: executeCommand,
  });

  const executeRollback = useCallback(
    async (targetMessageId: string) => {
      setRewindPending(true);
      try {
        const result = await ipcBridge.conversation.rollbackToMessage.invoke({
          conversation_id,
          target_message_id: targetMessageId,
        });
        assertBridgeSuccess(result, 'Failed to rewind conversation');

        clearFiles();
        emitter.emit('acp.selected.file.clear');
        clear();
        resetConversationState();
        resetActiveExecution('external-reset');
        await reloadMessageListFromDatabase();
        // Repopulate the composer with the rewound prompt so the user can
        // edit and resend (matches the Claude Code CLI flow where /rewind
        // clears the turn and surfaces its text for re-editing).
        const restoredInput = result.data?.restoredInput ?? '';
        setContent(restoredInput);
        emitter.emit('sendbox.focus');
        emitter.emit('chat.history.refresh');
      } finally {
        setRewindPending(false);
      }
    },
    [
      clear,
      clearFiles,
      conversation_id,
      reloadMessageListFromDatabase,
      resetActiveExecution,
      resetConversationState,
      setContent,
    ]
  );

  const onSendHandler = async (message: string) => {
    const trimmedMessage = message.trim();

    // /undo is a pure alias of /rewind. Both open the multi-turn picker
    // regardless of which agent is running so users keep one mental model
    // when switching between Claude Code and Codex.
    if (trimmedMessage === '/undo' || trimmedMessage === '/rewind') {
      if (rewindCandidates.length === 0) {
        Message.warning(t('chat.rewind.noTurn', { defaultValue: 'There is no previous turn to rewind.' }));
        return;
      }
      setRewindActiveIndex(0);
      setRewindSelectionOpen(true);
      return;
    }

    const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path));
    const allFiles = [...uploadFile, ...atPathFiles];

    clearFiles();
    emitter.emit('acp.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: true,
        isBusy,
        hasPendingCommands,
      })
    ) {
      enqueue({ input: message, files: allFiles });
      return;
    }

    await executeCommand({ input: message, files: allFiles });
  };

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      setUploadFile(Array.from(new Set(item.files)));
      setAtPath([]);
      emitter.emit('acp.selected.file.clear');
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

  const executeClear = useCallback(async () => {
    const result = await ipcBridge.conversation.clearMessages.invoke({ conversation_id });
    assertBridgeSuccess(result, 'Failed to clear conversation');

    clearFiles();
    emitter.emit('acp.selected.file.clear');
    clear();
    resetConversationState();
    resetActiveExecution('external-reset');
    await reloadMessageListFromDatabase();
    setContent('');
    emitter.emit('sendbox.focus');
    emitter.emit('chat.history.refresh');
    Message.success(
      t('chat.clear.success', {
        defaultValue: 'Conversation cleared',
      })
    );
  }, [
    clear,
    clearFiles,
    conversation_id,
    reloadMessageListFromDatabase,
    resetActiveExecution,
    resetConversationState,
    setContent,
    t,
  ]);

  const handleBuiltinSlashCommand = useCallback(
    (name: string) => {
      if (name === 'rewind' || name === 'undo') {
        if (rewindCandidates.length === 0) {
          Message.warning(t('chat.rewind.noTurn', { defaultValue: 'There is no previous turn to rewind.' }));
          return;
        }
        setRewindActiveIndex(0);
        setRewindSelectionOpen(true);
        return;
      }

      if (name === 'clear') {
        void executeClear();
        return;
      }

      onSlashBuiltinCommand?.(name);
    },
    [executeClear, onSlashBuiltinCommand, rewindCandidates, t]
  );

  useAddEventListener('acp.selected.file', setAtPath);
  useAddEventListener('acp.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  useEffect(() => {
    if (!rewindSelectionOpen) {
      return;
    }

    // Read the latest state via refs so this listener is registered exactly
    // once per "picker open" cycle instead of being torn down and rebound on
    // every active-index/candidate change. Avoids closure staleness in the
    // race window right after the slash menu hands off Enter to the picker.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (rewindPendingRef.current) {
        return;
      }
      const candidates = rewindCandidatesRef.current;
      if (!candidates || candidates.length === 0) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setRewindSelectionOpen(false);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setRewindActiveIndex((prev) => (prev + 1) % candidates.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setRewindActiveIndex((prev) => (prev - 1 + candidates.length) % candidates.length);
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        // 0 == newest turn (last in list), 1..9 == 1..9 turns ago.
        const turnsAgo = Number(event.key);
        const selectedIndex = candidates.length - 1 - turnsAgo;
        if (selectedIndex < 0 || selectedIndex >= candidates.length) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const selectedCandidate = candidates[selectedIndex];
        setRewindSelectionOpen(false);
        void executeRollback(selectedCandidate.id);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        const activeCandidate = candidates[rewindActiveIndexRef.current];
        if (!activeCandidate) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        setRewindSelectionOpen(false);
        void executeRollback(activeCandidate.id);
      }
    };

    // Capture phase so the picker's keys win over the textarea / slash menu
    // handlers — once the picker is open, ↑↓Enter must talk to the picker.
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true } as AddEventListenerOptions);
    };
  }, [executeRollback, rewindCandidatesRef, rewindActiveIndexRef, rewindPendingRef, rewindSelectionOpen]);

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
      <ThoughtDisplay running={aiProcessing && !hasThinkingMessage} onStop={handleStop} />
      {rewindSelectionOpen && (
        <div className='mb-8px rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-1)] p-6px shadow-sm'>
          <div className='flex items-start justify-between gap-8px px-10px pt-8px pb-4px'>
            <div className='min-w-0'>
              <div className='text-13px font-semibold text-t-primary'>
                {t('chat.rewind.title', { defaultValue: 'Rewind' })}
              </div>
              <div className='text-12px text-t-secondary'>
                {t('chat.rewind.pickTurn', {
                  defaultValue: 'Restore the conversation to the point before…',
                })}
              </div>
            </div>
            <Button
              size='mini'
              type='text'
              disabled={rewindPending}
              onClick={() => {
                setRewindSelectionOpen(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
          <div className='max-h-260px overflow-y-auto py-2px'>
            {rewindCandidates.map((candidate, index) => {
              const turnsAgo = rewindCandidates.length - 1 - index;
              const numericShortcut = turnsAgo <= 9 ? String(turnsAgo) : null;
              const isActive = index === rewindActiveIndex;
              return (
                <button
                  key={candidate.id}
                  ref={(el) => {
                    rewindRowRefs.current[index] = el;
                  }}
                  type='button'
                  disabled={rewindPending}
                  className='w-full text-left px-10px py-8px rounded-8px transition-colors disabled:cursor-not-allowed disabled:opacity-60'
                  style={{
                    background: isActive ? 'var(--color-fill-2)' : 'transparent',
                  }}
                  onMouseEnter={() => {
                    setRewindActiveIndex(index);
                  }}
                  onClick={() => {
                    setRewindSelectionOpen(false);
                    void executeRollback(candidate.id);
                  }}
                >
                  <div className='flex items-baseline gap-8px text-12px text-t-secondary'>
                    <span className='shrink-0' style={{ visibility: isActive ? 'visible' : 'hidden' }}>
                      ›
                    </span>
                    <span className='shrink-0 font-mono opacity-70'>{numericShortcut ?? ' '}</span>
                    <span className='shrink-0'>{candidate.title}</span>
                  </div>
                  <div className='ml-22px text-13px text-t-primary truncate'>
                    {candidate.description || candidate.input}
                  </div>
                  <div className='ml-22px text-11px text-t-tertiary'>
                    {candidate.keepCount > 0
                      ? `${candidate.keepCount} earlier turn${candidate.keepCount > 1 ? 's' : ''} kept · ${candidate.discardCount} turn${candidate.discardCount > 1 ? 's' : ''} removed`
                      : `Removes all ${candidate.discardCount} turn${candidate.discardCount > 1 ? 's' : ''} (rewinds to start)`}
                  </div>
                </button>
              );
            })}
          </div>
          <div className='px-10px pt-4px pb-6px text-11px text-t-tertiary'>
            {t('chat.rewind.footer', {
              defaultValue: 'Enter to rewind · Esc to cancel · 0–9 jump · ↑↓ navigate',
            })}
          </div>
        </div>
      )}

      <SendBox
        value={content}
        onChange={setContent}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('acp.selected.file', items);
          setAtPath(items);
        }}
        loading={isBusy}
        disabled={false}
        placeholder={t('acp.sendbox.placeholder', {
          backend: agentName || backend,
          defaultValue: `Send message to {{backend}}...`,
        })}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        enableBtw={isSideQuestionSupported({ type: 'acp', backend })}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={
          <div className='flex items-center gap-4px'>
            <FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />
            {showModeSelector && (
              <AgentModeSelector
                backend={backend}
                conversationId={conversation_id}
                compact
                initialMode={sessionMode}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
                onModeChanged={isLeaderInTeam ? teamPermission?.propagateMode : undefined}
              />
            )}
            <AcpConfigSelector
              conversationId={conversation_id}
              backend={backend}
              compact={!!teamId}
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
                          emitter.emit('acp.selected.file', newAtPath);
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
        slashCommands={[
          // /rewind and /undo are universal aliases that always open the
          // turn picker regardless of which ACP agent is running.
          {
            name: 'rewind',
            description: t('chat.rewind.commandDescription', {
              defaultValue: 'Pick a previous turn and rewind the conversation',
            }),
            kind: 'builtin' as const,
            source: 'builtin' as const,
          },
          {
            name: 'undo',
            description: t('chat.rewind.undoAliasDescription', {
              defaultValue: 'Alias of /rewind — pick a previous turn to undo',
            }),
            kind: 'builtin' as const,
            source: 'builtin' as const,
          },
          ...slashCommands,
        ]}
        onSlashBuiltinCommand={handleBuiltinSlashCommand}
        allowSendWhileLoading
        compactActions={!!teamId}
        sendButtonPrefix={
          tokenUsage ? (
            <ContextUsageIndicator
              tokenUsage={tokenUsage}
              contextLimit={contextLimit > 0 ? contextLimit : undefined}
              size={24}
            />
          ) : undefined
        }
      ></SendBox>
    </div>
  );
};

export default AcpSendBox;
