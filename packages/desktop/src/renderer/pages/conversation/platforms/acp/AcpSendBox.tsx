import { ipcBridge } from '@/common';
import type { IConversationMcpStatus } from '@/common/config/storage';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { isSideQuestionSupported } from '@/common/chat/sideQuestion';
import { parseError, uuid } from '@/common/utils';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import MobileActionSheet, {
  type MobileActionSheetEntry,
  type MobileActionSheetOption,
  useAttachEntry,
} from '@/renderer/components/chat/MobileActionSheet';
import SendBox from '@/renderer/components/chat/SendBox';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import { audioExts, getFileExtension, imageExts } from '@/renderer/services/FileService';
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
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationRuntimeWorkspaceErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { getChatSurfaceWidthClass } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/styles/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { localSelectionItems, mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { collectChatFileRefs, splitChatFileRefs } from '@/renderer/utils/file/messageFiles';
import type { ChatFileRef } from '@/common/types/chatFile';
import { Button, Message, Tag } from '@arco-design/web-react';
import { Brain, Lightning, MagicHat, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { classifyConversationBusyError } from '../conversationBusyError';
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
  messageState: UseAcpMessageReturn;
  teamSendMessage?: (payload: { input: string; files: ChatFileRef[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
}> = ({ conversation_id, backend, session_mode, agent_name, messageState, teamSendMessage, teamRuntime }) => {
  const {
    aiProcessing,
    setAiProcessing,
    turnStartedAtMs,
    resetState,
    hasThinkingMessage,
    slashCommands,
    tokenUsage,
    context_limit,
  } = messageState;
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
  const promptCapability = conversationContext?.promptCapability;
  // Hint shown on a media chip when the agent takes no native image/audio
  // blocks — the attachment then reaches it as a file path. SVG is never
  // sent natively (vision APIs reject it), so it always hints like a path.
  const mediaPathHintFor = useCallback(
    (path: string): string | undefined => {
      const ext = getFileExtension(path).toLowerCase();
      const isNativeImage = ext !== '.svg' && imageExts.includes(ext);
      const isNativeAudio = audioExts.includes(ext);
      if (!isNativeImage && !isNativeAudio) return undefined;
      const supported = isNativeImage ? promptCapability?.image : promptCapability?.audio;
      if (supported) return undefined;
      return t('conversation.sendbox.mediaPathFallback', {
        defaultValue: 'This agent has no native support for this file type; it will be sent as a file path.',
      });
    },
    [promptCapability, t]
  );
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<string | undefined>(session_mode);
  const prepareRuntimeConfig = useCallback(async () => {
    if (teamPermission) return;
  }, [teamPermission]);
  const runtimeConfig = useAcpConfigOptions({
    conversation_id,
    prepareRuntime: prepareRuntimeConfig,
    prepareSetRuntime: teamPermission?.warmupSession,
    configOptionsPort: teamPermission?.configOptionsPort,
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
    prepareRuntime: prepareRuntimeConfig,
    prepareSetRuntime: teamPermission?.warmupSession,
    configOptionsPort: teamPermission?.configOptionsPort,
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

  const handleContentChange = useCallback(
    (val: string) => {
      setContent(val);
    },
    [setContent]
  );
  const { setSendBoxHandler } = usePreviewContext();

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const contentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);

  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);
  const runtimeView = useConversationRuntimeView(conversation_id);
  const { markSendStarted, markSendAccepted, markSendFailed, supportsMidturnDelivery } = runtimeView;

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
    setAiProcessing,
    resetState,
    markSendStarted,
    markSendAccepted,
    markSendFailed,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessageRef.current,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      // Plain user text; the backend resolves each ChatFileRef and injects the
      // [[AION_FILES]] marker at the send edge (no front-end path/marker building).
      try {
        if (teamPermission) await teamPermission.warmupSession();
        void checkAndUpdateTitle(conversation_id, input);
        if (teamSendMessage) {
          await teamSendMessage({ input, files });
          emitter.emit('chat.history.refresh');
          if (files.length > 0) {
            emitter.emit('acp.workspace.refresh');
          }
          return;
        }

        markSendStarted();
        setAiProcessing(true);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input,
          conversation_id,
          files,
        });
        markSendAccepted(result.turn_id, result.runtime, result.msg_id);
        emitter.emit('chat.history.refresh');
      } catch (error: unknown) {
        const errorMsg =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        const busyError = classifyConversationBusyError(error);
        if (busyError) {
          markSendFailed({
            kind: 'busy_conflict',
            reason: errorMsg,
            busyKind: busyError.kind,
            status: busyError.status,
            code: busyError.code,
          });
          throw error;
        }

        markSendFailed({ kind: 'ordinary', reason: errorMsg });

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
      markSendAccepted,
      markSendFailed,
      markSendStarted,
      resetState,
      setAiProcessing,
      t,
      teamPermission,
      teamSendMessage,
    ]
  );

  const {
    items: queuedCommands,
    mode: queueMode,
    isInteractionLocked: isQueueInteractionLocked,
    enqueue,
    remove,
    prioritize,
    sendNow,
    clear,
    reorder,
    toggleMode,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversation_id: conversation_id,
    // The queue (panel, runner, auto-send) is always live: backends that can
    // deliver mid-turn (supports_midturn_delivery) still need a working
    // enqueue for the explicit "add to queue" entry, and queued items must
    // keep auto-sending once their turn arrives, same as non-supporting
    // backends. What changed is who can trigger enqueue implicitly — see
    // onSendHandler below.
    enabled: true,
    isBusy,
    runtimeGate: commandQueueRuntimeGate,
    onExecute: executeCommand,
  });

  // Supporting agents (mid-turn delivery) send immediately, busy or not.
  // Non-supporting agents can no longer send while the agent is replying —
  // that path is hard-blocked with a toast; the only way to queue a message
  // while busy is the explicit "add to queue" entry (handleAddToQueue below).
  const onSendHandler = async (message: string): Promise<void | false> => {
    if (!supportsMidturnDelivery && isBusy) {
      Message.warning(
        t('conversation.commandQueue.midturnBlocked', {
          defaultValue:
            'This agent is still working, so the message can’t be sent directly. Save it to Draft box and send it later.',
        })
      );
      return false;
    }

    const allFiles = collectChatFileRefs(uploadFile, atPath);
    clearFiles();
    emitter.emit('acp.selected.file.clear');
    await executeCommand({ input: message, files: allFiles });
  };

  const [interrupting, setInterrupting] = useState(false);
  const handleInterruptSend = async () => {
    if (!teamRuntime?.onInterruptSend || !content.trim() || interrupting) return;
    const files = collectChatFileRefs(uploadFile, atPath);
    const input = content;
    setContent('');
    clearFiles();
    emitter.emit('acp.selected.file.clear');
    setInterrupting(true);
    try {
      await teamRuntime.onInterruptSend({ input, files });
    } finally {
      setInterrupting(false);
    }
  };

  // Explicit "add to queue" entry — visibility is keyed only to the user's
  // own input (non-empty draft), never to the agent's busy/replying state:
  // tying it to that racy, async signal made the entry appear/disappear
  // unpredictably. Clicking while idle is semantically fine — the queue's own
  // mode governs (auto drains immediately, manual holds). Shown for both
  // supporting and non-supporting backends. Clears the draft the same way a
  // send would.
  const canQueueCurrentDraft = content.trim().length > 0;
  const handleAddToQueue = useCallback(() => {
    const allFiles = collectChatFileRefs(uploadFile, atPath);
    enqueue({ input: content, files: allFiles });
    setContent('');
    clearFiles();
    emitter.emit('acp.selected.file.clear');
  }, [atPath, clearFiles, content, enqueue, setContent, uploadFile]);

  const handleEditQueuedCommand = useCallback(
    (item: ConversationCommandQueueItem) => {
      remove(item.id);
      setContent(item.input);
      // Restore upload refs → uploadFile paths, project refs → atPath items.
      const { uploadFiles, atPath: restoredAtPath } = splitChatFileRefs(item.files);
      setUploadFile(uploadFiles);
      setAtPath(restoredAtPath);
      emitter.emit('acp.selected.file.clear');
    },
    [remove, setAtPath, setContent, setUploadFile]
  );

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      // "Add files" picks a file from the backend machine's own filesystem
      // (native dialog / server-fs browse) — an absolute backend path. Send it
      // as a `local` ref (via the atPath lane, external-owned), NOT an `upload`
      // ref: the raw path is not under the managed upload dir and would be
      // rejected. Merge into this box's atPath only (no cross-column emit).
      const merged = mergeFileSelectionItems(atPathRef.current, localSelectionItems(files));
      if (merged !== atPathRef.current) setAtPath(merged as Array<string | FileOrFolderItem>);
    },
    [setAtPath]
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
        label: t('common.selectedSkills', { defaultValue: 'Selected skills' }),
        variant: 'muted',
        submenu: {
          title: t('common.selectedSkills', { defaultValue: 'Selected skills' }),
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
        label: t('conversation.mcp.selected', { defaultValue: 'Selected MCP' }),
        variant: 'muted',
        submenu: {
          title: t('conversation.mcp.selected', { defaultValue: 'Selected MCP' }),
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

  // Accept file-selection events only when targeted at this conversation (or
  // untargeted); on the multi-column team route this stops same-type peers from
  // receiving each other's selections. See emitter EventTypes comment.
  useAddEventListener(
    'acp.selected.file',
    (items: Array<string | FileOrFolderItem>, targetConversationId: string | undefined) => {
      if (targetConversationId === undefined || targetConversationId === conversation_id) setAtPath(items);
    },
    [conversation_id, setAtPath]
  );
  useAddEventListener(
    'acp.selected.file.append',
    (selectedItems: Array<string | FileOrFolderItem>, targetConversationId: string | undefined) => {
      if (targetConversationId !== undefined && targetConversationId !== conversation_id) return;
      const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
      if (merged !== atPathRef.current) {
        setAtPath(merged as Array<string | FileOrFolderItem>);
      }
    },
    [conversation_id, setAtPath]
  );

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
  const handleSendNowQueued = useCallback(
    async (item: ConversationCommandQueueItem) => {
      if (supportsMidturnDelivery) {
        // Supporting agents can deliver directly into the running turn — no
        // need to stop/restart. Remove the item BEFORE executing (rather than
        // after success) so the queue's own auto-drain effect can never
        // double-pick it: send-now can be clicked while the turn is still
        // busy (isProcessing → canExecute stays false, drain naturally
        // skips) or while idle (canExecute true, drain WOULD race to dequeue
        // the same front-of-queue item concurrently with this manual send).
        // Removing first closes that race in both cases.
        remove(item.id);
        try {
          await executeCommand({ input: item.input, files: item.files });
        } catch {
          // executeCommand already surfaces the failure (busy-conflict toast,
          // error message card, etc.) via its own catch path — don't show a
          // second one. Restore the user's content instead of dropping it:
          // enqueue appends to the end, so promote it back to the front to
          // match "send now" intent (it was already next in line).
          const restored = enqueue({ input: item.input, files: item.files });
          if (restored) prioritize(restored.id);
        }
        return;
      }

      // Stop the current reply (best-effort), then promote the chosen command
      // to the front of the queue in auto mode.  The drain effect will fire it
      // once the execution gate shows canExecute — avoiding the 409 race that
      // occurs when sendNow() calls onExecute() directly before the backend
      // has finished processing the stop.
      await effectiveHandleStop();
      prioritize(item.id);
    },
    [effectiveHandleStop, enqueue, executeCommand, prioritize, remove, supportsMidturnDelivery]
  );
  const sendBoxWidthClass = getChatSurfaceWidthClass();

  return (
    <div className={`${sendBoxWidthClass} flex flex-col mt-auto mb-16px`}>
      <CommandQueuePanel
        items={queuedCommands}
        mode={queueMode}
        isMobile={isMobile}
        interactionLocked={isQueueInteractionLocked}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onEdit={handleEditQueuedCommand}
        onSendNow={handleSendNowQueued}
        onToggleMode={toggleMode}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />
      <ThoughtDisplay
        running={teamRuntime?.loading ?? (aiProcessing && !hasThinkingMessage)}
        statusText={teamRuntime?.statusText}
        externalElapsedSource={Boolean(teamRuntime) || turnStartedAtMs != null}
        startedAtMs={teamRuntime ? (teamRuntime.startedAtMs ?? null) : turnStartedAtMs}
        onStop={effectiveHandleStop}
        onRetryStart={teamRuntime?.onRetryStart ? () => void teamRuntime.onRetryStart?.() : undefined}
      />
      <SendBox
        onMobilePlusClick={isMobile ? () => setIsMobileSheetOpen(true) : undefined}
        value={content}
        onChange={handleContentChange}
        selectedWorkspaceItems={atPath}
        onSelectedWorkspaceItemsChange={(items) => {
          emitter.emit('acp.selected.file', items, conversation_id);
          setAtPath(items);
        }}
        loading={teamRuntime?.loading ?? isBusy}
        active={teamRuntime?.isActive}
        onFocused={teamRuntime?.onFocus}
        disabled={false}
        sendDisabled={!supportsMidturnDelivery && isBusy}
        sendDisabledTooltip={
          !supportsMidturnDelivery && isBusy
            ? t('conversation.commandQueue.midturnBlockedSendHint', {
                defaultValue:
                  'The current agent is still working and cannot receive another message yet. Add it to Draft box instead.',
              })
            : undefined
        }
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
                beforeRuntimeSync={prepareRuntimeConfig}
                beforeRuntimeSet={teamPermission?.warmupSession}
                configOptionsPort={teamPermission?.configOptionsPort}
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
                    hint={mediaPathHintFor(path)}
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
                          emitter.emit('acp.selected.file', newAtPath, conversation_id);
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
        sendButtonPrefix={
          // Agents reporting a window size (UsageUpdate.size) get a progress
          // ring; agents reporting only a token count get a hollow ring whose
          // popover shows the raw count — never a percentage against a
          // guessed denominator. No usage report at all → nothing.
          <>
            {teamRuntime?.onInterruptSend && content.trim() && (
              <Button
                size='mini'
                type='secondary'
                icon={<Lightning />}
                loading={interrupting}
                onClick={() => void handleInterruptSend()}
              >
                {t('team.interruptAndSend')}
              </Button>
            )}
            {tokenUsage ? <ContextUsageIndicator tokenUsage={tokenUsage} context_limit={context_limit} /> : undefined}
          </>
        }
        onAddToDraft={handleAddToQueue}
        addToDraftDisabled={!canQueueCurrentDraft}
        addToDraftTooltip={
          isBusy
            ? t('conversation.commandQueue.addToQueueBusyHint', {
                defaultValue: 'Save to Draft box and send it later.',
              })
            : t('conversation.commandQueue.addToQueue', { defaultValue: 'Save to Draft box' })
        }
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
