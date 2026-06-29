import { ipcBridge } from '@/common';
import type { IConversationMcpStatus } from '@/common/config/storage';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import { parseError, uuid } from '@/common/utils';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import MobileActionSheet, {
  type MobileActionSheetEntry,
  type MobileActionSheetOption,
  useAttachEntry,
} from '@/renderer/components/chat/MobileActionSheet';
import SendBox from '@/renderer/components/chat/SendBox';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import { classifyConfigSetError, useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationRuntimeWorkspaceErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { getChatSurfaceWidthClass } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { Message, Tag } from '@arco-design/web-react';
import { Brain, MagicHat, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildSendFailureError } from './buildSendFailureError';
import { useAcpInitialMessage } from './useAcpInitialMessage';
import type { UseAcpMessageReturn } from './useAcpMessage';

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

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
  backend: string;
  session_mode?: string;
  agent_name?: string;
  workspacePath?: string;
  messageState: UseAcpMessageReturn;
  teamSendMessage?: (payload: { input: string; files: string[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
}> = ({
  conversation_id,
  backend,
  session_mode,
  agent_name,
  workspacePath,
  messageState,
  teamSendMessage,
  teamRuntime,
}) => {
  const { aiProcessing, setAiProcessing, resetState, hasThinkingMessage, slashCommands, fetchSlashCommands } =
    messageState;
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  // In team mode, all agents show the permission mode selector (members don't propagate)
  const showModeSelector = true;
  const isLeaderInTeam = teamPermission && conversation_id === teamPermission.leaderConversationId;
  const { checkAndUpdateTitle } = useAutoTitle();
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const conversationContext = useConversationContextSafe();
  const loadedSkills = conversationContext?.loadedSkills ?? [];
  const loadedMcpStatuses =
    conversationContext?.loadedMcpStatuses ??
    (conversationContext?.loadedMcpServers ?? []).map<IConversationMcpStatus>((name) => ({
      id: name,
      name,
      status: 'loaded',
    }));
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<string | undefined>(session_mode);
  const prepareRuntimeSync = useCallback(async () => {
    if (teamPermission) {
      await teamPermission.warmupSession();
    }
    await warmupConversation(conversation_id);
  }, [conversation_id, teamPermission]);
  const runtimeConfig = useAcpConfigOptions({
    conversation_id,
    prepareRuntime: prepareRuntimeSync,
    enabled: true,
  });
  const runtimeMode = runtimeConfig.mode;
  const runtimeThoughtLevel = runtimeConfig.thoughtLevel;
  const handleThoughtLevelSetOption = useCallback(
    async (optionId: string, value: string) => runtimeConfig.setConfigOption(optionId, value),
    [runtimeConfig]
  );

  // Drive the mobile sheet's model entry off the same source AcpModelSelector uses
  const {
    model_info,
    canSwitch: canSwitchModel,
    selectModel,
  } = useAcpModelInfo({
    conversation_id,
    backend,
    prepareRuntime: prepareRuntimeSync,
    enabled: isMobile,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: (_modelId, error) => Message.error(t(configErrorMessageKey(error))),
  });
  useEffect(() => {
    if (!runtimeMode?.currentValue) return;
    setCurrentMode(runtimeMode.currentValue);
  }, [runtimeMode?.currentValue]);

  const handleSheetModeChange = useCallback(
    async (mode: string) => {
      if (!runtimeMode || mode === runtimeMode.currentValue) return;
      try {
        await runtimeConfig.setConfigOption(runtimeMode.id, mode);
        setCurrentMode(mode);
        if (isLeaderInTeam) teamPermission?.propagateMode?.(mode);
        Message.success(t('agentMode.switchSuccess'));
      } catch (error) {
        console.error('[AcpSendBox] Failed to switch mode via sheet:', error);
        Message.error(t(configErrorMessageKey(error)));
      }
    },
    [isLeaderInTeam, runtimeConfig, runtimeMode, t, teamPermission]
  );

  // In team mode, warmup the agent then fetch slash commands
  useEffect(() => {
    if (!teamPermission) return;
    void teamPermission
      .warmupSession()
      .then(() => warmupConversation(conversation_id))
      .then(() => {
        fetchSlashCommands();
      })
      .catch((error) => {
        Message.error(getConversationRuntimeWorkspaceErrorMessage(error, t));
      });
  }, [teamPermission, conversation_id, fetchSlashCommands, t]);

  const handleContentChange = useCallback(
    (val: string) => {
      if (val && teamPermission) teamPermission.warmupSession();
      setContent(val);
    },
    [teamPermission, setContent]
  );
  const { setSendBoxHandler } = usePreviewContext();

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const contentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);

  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);
  const runtimeView = useConversationRuntimeView(conversation_id);

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });
  const commandQueueRuntimeGate = teamRuntime?.runtimeGate ?? {
    hydrated: runtimeView.hydrated,
    canSendMessage: runtimeView.canSendMessage,
    isProcessing: runtimeView.isProcessing,
  };
  const isCancelling = runtimeView.state === 'cancelling';
  const isBusy = isCancelling || commandQueueRuntimeGate.isProcessing || !commandQueueRuntimeGate.canSendMessage;

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // If there's existing content, add newline and new text; otherwise just set the text
      const new_content = content ? `${content}\n${text}` : text;
      setContentRef.current(new_content);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  // Listen for sendbox.fill event to append text to sendbox
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      const prev = contentRef.current;
      setContentRef.current(prev ? `${prev}${text}` : text);
    },
    []
  );

  // Check for and send initial message from guid page
  useAcpInitialMessage({
    conversation_id: conversation_id,
    backend,
    workspacePath,
    setAiProcessing,
    resetState,
    markSendStarted: runtimeView.markSendStarted,
    markSendAccepted: runtimeView.markSendAccepted,
    markSendFailed: runtimeView.markSendFailed,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessageRef.current,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

      try {
        if (teamPermission) await teamPermission.warmupSession();
        void checkAndUpdateTitle(conversation_id, input);
        if (teamSendMessage) {
          await teamSendMessage({ input: displayMessage, files });
          emitter.emit('chat.history.refresh');
          if (files.length > 0) {
            emitter.emit('acp.workspace.refresh');
          }
          return;
        }

        runtimeView.markSendStarted();
        setAiProcessing(true);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id,
          files,
        });
        runtimeView.markSendAccepted(result.turn_id, result.runtime, result.msg_id);
        emitter.emit('chat.history.refresh');
      } catch (error: unknown) {
        const errorMsg =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        runtimeView.markSendFailed(errorMsg);

        // Archived conversation (e.g. legacy Gemini). Backend signals this
        // via HTTP 410 + code='CONVERSATION_ARCHIVED' — identified by code,
        // not by substring matching.
        if (isBackendHttpError(error) && error.code === 'CONVERSATION_ARCHIVED') {
          Message.error({
            content: error.backendMessage || errorMsg,
            duration: 6000,
          });
          setAiProcessing(false);
          throw error;
        }

        const isAuthError =
          errorMsg.includes('[ACP-AUTH-') ||
          errorMsg.includes('authentication failed') ||
          errorMsg.includes('认证失败');
        if (isAuthError) {
          const errorMessage = {
            id: uuid(),
            msg_id: uuid(),
            turn_id: '',
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
        } else {
          addOrUpdateMessageRef.current(
            {
              id: uuid(),
              msg_id: uuid(),
              type: 'tips',
              position: 'center',
              conversation_id,
              created_at: Date.now(),
              content: {
                content: errorMsg,
                type: 'error',
                error: buildSendFailureError(error, errorMsg),
              },
            },
            true
          );
        }

        resetState();
        setAiProcessing(false);
        throw error;
      }

      if (files.length > 0) {
        emitter.emit('acp.workspace.refresh');
      }
    },
    [
      backend,
      checkAndUpdateTitle,
      conversation_id,
      resetState,
      runtimeView,
      setAiProcessing,
      t,
      teamPermission,
      teamSendMessage,
      workspacePath,
    ]
  );

  const {
    items: queuedCommands,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue,
    remove,
    clear,
    reorder,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversation_id: conversation_id,
    enabled: true,
    isBusy,
    runtimeGate: commandQueueRuntimeGate,
    onExecute: executeCommand,
  });

  const onSendHandler = async (message: string) => {
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

  const { entries: attachEntries, hiddenFileInput: attachHiddenInput } = useAttachEntry({
    openFileSelector,
    onLocalFilesAdded: handleFilesAdded,
  });

  const sheetEntries = useMemo<MobileActionSheetEntry[]>(() => {
    if (!isMobile) return [];

    const availableModes =
      runtimeMode?.options.map((item) => ({
        value: item.value,
        label: item.label,
        description: item.description ?? undefined,
      })) ?? [];
    const modeOptions: MobileActionSheetOption[] = availableModes.map((mode) => ({
      key: mode.value,
      label: t(`agentMode.${mode.value}`, { defaultValue: mode.label }),
      description: mode.description,
      active: (runtimeMode?.currentValue ?? currentMode) === mode.value,
    }));

    const modelOptions: MobileActionSheetOption[] = canSwitchModel
      ? (model_info?.available_models ?? []).map((model) => ({
          key: model.id,
          label: model.label || model.id,
          description: model.description,
          active: model_info?.current_model_id === model.id,
        }))
      : [];

    const currentModelLabel =
      model_info?.current_model_label || model_info?.current_model_id || t('conversation.welcome.useCliModel');
    const currentModeLabel =
      modeOptions.find((opt) => opt.active)?.label ?? t('agentMode.default', { defaultValue: 'Default' });

    const entries: MobileActionSheetEntry[] = [];

    // Model entry: only when the agent exposes a switchable list. Otherwise
    // (Codex with no list, no info) skip — exposing a no-op row would be noise.
    if (modelOptions.length > 0) {
      entries.push({
        key: 'model',
        icon: <Brain theme='outline' size='16' />,
        label: t('common.model', { defaultValue: 'Model' }),
        meta: currentModelLabel,
        submenu: {
          title: t('common.model', { defaultValue: 'Model' }),
          options: modelOptions,
          onSelect: (id) => selectModel(id),
        },
      });
    }

    if (runtimeThoughtLevel) {
      entries.push({
        key: 'thought-level',
        icon: <Brain theme='outline' size='16' />,
        label: t('agent.thoughtLevel.label'),
        meta:
          runtimeThoughtLevel.options.find((item) => item.value === runtimeThoughtLevel.currentValue)?.label ||
          runtimeThoughtLevel.currentValue ||
          '',
        submenu: {
          title: t('agent.thoughtLevel.label'),
          options: runtimeThoughtLevel.options.map((item) => ({
            key: item.value,
            label: item.label,
            description: item.description ?? undefined,
            active: runtimeThoughtLevel.currentValue === item.value,
          })),
          onSelect: (value) => {
            void handleThoughtLevelSetOption(runtimeThoughtLevel.id, value)
              .then(() => Message.success(t('agent.thoughtLevel.switchSuccess')))
              .catch((error) => Message.error(t(configErrorMessageKey(error))));
          },
        },
      });
    }

    if (modeOptions.length > 0) {
      entries.push({
        key: 'permission',
        icon: <Shield theme='outline' size='16' />,
        label: t('agentMode.permission', { defaultValue: 'Permission' }),
        meta: currentModeLabel,
        submenu: {
          title: t('agentMode.permission', { defaultValue: 'Permission' }),
          options: modeOptions,
          onSelect: (key) => void handleSheetModeChange(key),
        },
      });
    }

    attachEntries.forEach((entry, idx) => {
      entries.push({
        ...entry,
        dividerBefore: idx === 0 ? entries.length > 0 : false,
      });
    });

    if (loadedSkills.length > 0) {
      const skillOptions: MobileActionSheetOption[] = loadedSkills.map((name) => ({
        key: name,
        label: `/${name}`,
      }));
      entries.push({
        key: 'skills',
        icon: <MagicHat theme='outline' size='16' />,
        label: t('common.skills', { defaultValue: 'Skills' }),
        variant: 'muted',
        submenu: {
          title: t('common.skills', { defaultValue: 'Skills' }),
          selectable: false,
          options: skillOptions,
          onSelect: (name) => {
            setContent(`/${name} `);
          },
        },
      });
    }

    if (loadedMcpStatuses.length > 0) {
      const mcpOptions: MobileActionSheetOption[] = loadedMcpStatuses.map((item) => ({
        key: item.id,
        label: item.name,
        description:
          item.status === 'loaded'
            ? undefined
            : item.reason
              ? `${t(`conversation.mcp.status.${item.status}` as const)} · ${item.reason}`
              : t(`conversation.mcp.status.${item.status}` as const),
      }));
      entries.push({
        key: 'mcp',
        icon: <Shield theme='outline' size='16' />,
        label: t('conversation.mcp.loaded', { defaultValue: 'Loaded MCP' }),
        variant: 'muted',
        submenu: {
          title: t('conversation.mcp.loaded', { defaultValue: 'Loaded MCP' }),
          selectable: false,
          options: mcpOptions,
          onSelect: () => undefined,
        },
      });
    }

    return entries;
  }, [
    attachEntries,
    canSwitchModel,
    currentMode,
    handleSheetModeChange,
    handleThoughtLevelSetOption,
    isMobile,
    loadedMcpStatuses,
    loadedSkills,
    model_info,
    runtimeMode,
    runtimeThoughtLevel,
    selectModel,
    setContent,
    t,
  ]);

  useAddEventListener('acp.selected.file', setAtPath);
  useAddEventListener('acp.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    // Cancelling is best-effort: swallow errors (e.g. backend WS not yet
    // connected → 409) so they don't bubble up as unhandled rejections.
    // UI state is still reset via finally.
    const turnId = runtimeView.activeTurnId;
    if (!turnId) {
      resetState();
      resetActiveExecution('stop');
      return;
    }
    runtimeView.markStopRequested(turnId);
    try {
      const result = await ipcBridge.conversation.stop.invoke({ conversation_id, turn_id: turnId });
      runtimeView.markStopAcknowledged(turnId, result.runtime);
    } catch (error) {
      console.warn('[AcpSendBox] stop request failed', error);
      runtimeView.resetLocalGate('stop_failed');
    } finally {
      resetState();
      resetActiveExecution('stop');
    }
  };
  const effectiveHandleStop = teamRuntime?.onStop ?? handleStop;
  const sendBoxWidthClass = getChatSurfaceWidthClass(Boolean(teamPermission));

  return (
    <div className={`${sendBoxWidthClass} flex flex-col mt-auto mb-16px`}>
      <CommandQueuePanel
        items={queuedCommands}
        interactionLocked={isQueueInteractionLocked}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onEdit={handleEditQueuedCommand}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />
      <ThoughtDisplay
        running={teamRuntime?.loading ?? (aiProcessing && !hasThinkingMessage)}
        onStop={effectiveHandleStop}
      />

      <SendBox
        onMobilePlusClick={isMobile ? () => setIsMobileSheetOpen(true) : undefined}
        value={content}
        onChange={handleContentChange}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('acp.selected.file', items);
          setAtPath(items);
        }}
        loading={teamRuntime?.loading ?? isBusy}
        disabled={false}
        placeholder={t('acp.sendbox.placeholder', {
          backend: agent_name || backend,
          defaultValue: `Send message to {{backend}}...`,
        })}
        onStop={effectiveHandleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        enableBtw={isSideQuestionSupported({ type: 'acp', backend })}
        supportedExts={allSupportedExts}
        defaultMultiLine={!isMobile}
        lockMultiLine={!isMobile}
        tools={
          <FileAttachButton
            openFileSelector={openFileSelector}
            onLocalFilesAdded={handleFilesAdded}
            loadedMcpStatuses={loadedMcpStatuses}
          />
        }
        rightTools={
          <div className='flex items-center gap-8px min-w-0'>
            {showModeSelector && (
              <AgentModeSelector
                backend={backend}
                conversation_id={conversation_id}
                compact
                initialMode={session_mode}
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
                onModeChanged={isLeaderInTeam ? teamPermission?.propagateMode : undefined}
                beforeRuntimeSync={prepareRuntimeSync}
              />
            )}
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
        slash_commands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading
        compactActions={false}
      ></SendBox>
      {isMobile && (
        <>
          <MobileActionSheet
            open={isMobileSheetOpen}
            onClose={() => setIsMobileSheetOpen(false)}
            title={t('common.more', { defaultValue: 'More' })}
            entries={sheetEntries}
          />
          {attachHiddenInput}
        </>
      )}
    </div>
  );
};

export default AcpSendBox;
