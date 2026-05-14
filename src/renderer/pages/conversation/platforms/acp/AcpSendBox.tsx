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
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
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
import { Message, Tag } from '@arco-design/web-react';
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

type ModelSortProfile = 'best' | 'coding' | 'reasoning' | 'vision' | 'fast' | 'local' | 'default';

type RankedModel = {
  id: string;
  label: string;
  provider: string;
  score: number;
  providerScore: number;
  tags: string[];
};

const modelLabel = (model: { id?: string; label?: string }): string => {
  const id = (model.id || '').trim();
  const label = (model.label || '').trim();
  if (id && label && id !== label) {
    return `${label} (${id})`;
  }
  return id || label || 'Unknown model';
};

const safeModelId = (model: { id?: string; label?: string }): string => {
  return (model.id || '').trim();
};

const inferProvider = (model: { id: string; label: string }): string => {
  const probe = `${model.id || ''} ${model.label || ''}`.toLowerCase();
  if (probe.includes('gemini') || probe.includes('google')) {
    return 'gemini';
  }
  if (probe.includes('claude') || probe.includes('anthropic')) {
    return 'claude';
  }
  if (probe.includes('grok')) {
    return 'grok';
  }
  if (probe.includes('qwen') || probe.includes('kimi') || probe.includes('llama') || probe.includes('ollama')) {
    return 'local';
  }
  if (probe.includes('gpt') || probe.includes('openai')) {
    return 'openai';
  }
  return 'api';
};

const normalizeModelText = (value: string): string => value.toLowerCase().trim();

const splitRequestedModel = (input: string): {
  profile: ModelSortProfile;
  isList?: boolean;
} => {
  const trimmed = normalizeModelText(input);
  if (!trimmed) {
    return { profile: 'default' };
  }

  if (trimmed === 'help' || trimmed === 'list' || trimmed === 'ls' || trimmed === '?' || trimmed === 'h') {
    return { profile: 'default', isList: true };
  }

  if (trimmed === 'best' || trimmed.startsWith('best ')) {
    const extra = trimmed.replace(/^best\s*/i, '').trim();
    if (!extra) {
      return { profile: 'best' };
    }
    if (extra.includes('code')) {
      return { profile: 'coding' };
    }
    if (extra.includes('reason') || extra.includes('analysis')) {
      return { profile: 'reasoning' };
    }
    if (extra.includes('vision') || extra.includes('img') || extra.includes('image')) {
      return { profile: 'vision' };
    }
    if (extra.includes('speed') || extra.includes('fast')) {
      return { profile: 'fast' };
    }
    if (extra.includes('local')) {
      return { profile: 'local' };
    }
    return { profile: 'best' };
  }

  if (trimmed === 'coding' || trimmed === 'reasoning' || trimmed === 'vision' || trimmed === 'fast' || trimmed === 'local') {
    return { profile: trimmed };
  }

  return { profile: 'default' };
};

const modelTier = (score: number) => {
  if (score >= 88) {
    return { rankEmoji: '🟢', name: 'Best' };
  }
  if (score >= 74) {
    return { rankEmoji: '🟡', name: 'Strong' };
  }
  if (score >= 60) {
    return { rankEmoji: '🔵', name: 'Good' };
  }
  return { rankEmoji: '⚪', name: 'Fallback' };
};

const profileScoreBonus = (profile: ModelSortProfile): Record<string, number> => {
  switch (profile) {
    case 'coding':
      return {
        local: 14,
        claude: 15,
        qwen: 12,
        grok: 9,
        gemini: 11,
        openai: 6,
        api: 0,
      };
    case 'reasoning':
      return {
        local: 8,
        claude: 16,
        qwen: 12,
        grok: 10,
        gemini: 14,
        openai: 10,
        api: 0,
      };
    case 'vision':
      return {
        local: 4,
        claude: 4,
        qwen: 8,
        grok: 3,
        gemini: 18,
        openai: 12,
        api: 0,
      };
    case 'fast':
      return {
        local: 10,
        claude: 7,
        qwen: 9,
        grok: 14,
        gemini: 5,
        openai: 10,
        api: 0,
      };
    case 'local':
      return {
        local: 20,
        claude: 0,
        qwen: 6,
        grok: 0,
        gemini: 0,
        openai: 0,
        api: -4,
      };
    default:
      return {
        local: 14,
        claude: 11,
        qwen: 12,
        grok: 9,
        gemini: 10,
        openai: 8,
        api: 0,
      };
  }
};

const providerBaseScore = (provider: string): number => {
  switch (provider) {
    case 'local':
      return 28;
    case 'claude':
      return 22;
    case 'gemini':
      return 20;
    case 'qwen':
      return 20;
    case 'grok':
      return 17;
    case 'openai':
      return 16;
    default:
      return 10;
  }
};

const modelProviderAlias = (provider: string): string => {
  if (provider === 'local') {
    return 'local/ollama';
  }
  return provider;
};

const scoreModel = (model: { id: string; label: string }, profile: ModelSortProfile): RankedModel => {
  const text = `${model.id} ${model.label}`.toLowerCase();
  const provider = inferProvider(model);
  const tags: string[] = [];
  let score = providerBaseScore(provider);
  const bonus = profileScoreBonus(profile);
  score += bonus[provider] ?? 0;

  if (text.includes('flash') || text.includes('lite') || text.includes('mini')) {
    tags.push('low-latency');
    score += 6;
  }
  if (text.includes('pro') || text.includes('sonnet') || text.includes('2.5') || text.includes('3.6')) {
    tags.push('high-capability');
    score += 10;
  }
  if (text.includes('vision') || text.includes('vision-preview') || text.includes('gemini-2.5-flash')) {
    tags.push('vision-friendly');
    score += 6;
  }
  if (text.includes('code') || text.includes('coding')) {
    tags.push('code-first');
    score += 7;
  }

  if (profile === 'fast' && (text.includes('flash') || text.includes('mini') || provider === 'grok')) {
    score += 4;
  }
  if (profile === 'reasoning' && (text.includes('2.5-pro') || text.includes('3.6') || text.includes('sonnet') || provider === 'claude')) {
    score += 7;
  }

  if (provider === 'local' && text.includes('qwen3')) {
    tags.push('local-coding');
    score += 9;
  }
  if (!tags.length) {
    tags.push('balanced');
  }

  return {
    id: safeModelId(model),
    label: modelLabel(model),
    provider,
    score,
    providerScore: providerBaseScore(provider),
    tags,
  };
};

const getRankedModels = (
  models: Array<{ id?: string; label?: string }>,
  profile: ModelSortProfile
): RankedModel[] =>
  models
    .filter((model) => safeModelId(model))
    .map((model) => scoreModel({ id: safeModelId(model), label: modelLabel(model) }, profile))
    .filter((model) => model.score >= 0)
    .sort((a, b) => b.score - a.score || b.providerScore - a.providerScore || a.label.localeCompare(b.label));

const formatRankedModelLine = (model: RankedModel, rank: number): string => {
  const tier = modelTier(model.score);
  const provider = modelProviderAlias(model.provider);
  const tags = model.tags.join(' | ');
  return `${rank}. ${tier.rankEmoji} ${model.label} [${provider}] ${tier.name} • ${tags} • ${model.score}`;
};

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

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });
  const isBusy = running || aiProcessing;

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

  const onSendHandler = async (message: string) => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.toLowerCase().startsWith('/model')) {
      const requestedModel = trimmedMessage.replace(/^\/model\s*/i, '').trim();
      const parsedRequest = splitRequestedModel(requestedModel);
      const requestedProfile = parsedRequest.profile;

      const modelInfoResult = await ipcBridge.acpConversation.getModelInfo.invoke({ conversationId: conversation_id });
      const modelInfo = modelInfoResult.data?.modelInfo;
      const availableModels = modelInfo?.availableModels ?? [];

      if (!modelInfo) {
        Message.error(
          t('conversation.model.notReady', {
            defaultValue: 'Modellen nog niet beschikbaar. Probeer na een kort moment opnieuw.',
          })
        );
        return;
      }

      const rankedModels = getRankedModels(
        availableModels,
        requestedProfile === 'best' ? 'best' : requestedProfile
      );

      if (!requestedModel || parsedRequest.isList) {
        const examples = rankedModels
          .slice(0, 12)
          .map((model, index) => formatRankedModelLine(model, index + 1))
          .join('\n');

        Message.info(
          examples
            ? t('conversation.model.availableModels', {
                models: `Gebruik: /model <index>, /model <naam>, /model best [coding|reasoning|vision|fast|local]\n${examples}`,
                defaultValue: `Beschikbare modellen:\nGebruik: /model <index>, /model <naam>, /model best [coding|reasoning|vision|fast|local]\n${examples}`,
              })
            : t('conversation.model.noModels', { defaultValue: 'Geen modellen gevonden voor deze ACP sessie.' })
        );
        return;
      }

      if (!modelInfo.canSwitch) {
        Message.error(
          t('conversation.model.notSwitchable', { defaultValue: 'Model wisselen is niet beschikbaar in deze sessie.' })
        );
        return;
      }

      const normalizedRequest = requestedModel.trim().toLowerCase();
      const indexRequest = Number.parseInt(normalizedRequest, 10);
      let targetModel = null as null | { id: string; label: string; provider: string };

      if (Number.isInteger(indexRequest) && indexRequest > 0) {
        const ranked = rankedModels[indexRequest - 1];
        if (ranked) {
          targetModel = {
            id: ranked.id,
            label: ranked.label,
            provider: ranked.provider,
          };
        }
      } else if (
        requestedProfile !== 'default' &&
        ['best', 'coding', 'reasoning', 'vision', 'fast', 'local'].includes(requestedProfile)
      ) {
        const best = rankedModels[0];
        if (best) {
          targetModel = {
            id: best.id,
            label: best.label,
            provider: best.provider,
          };
        }
      } else {
        targetModel =
          availableModels.find((model) => safeModelId(model).toLowerCase() === normalizedRequest) ||
          availableModels.find((model) => (model.label || '').toLowerCase() === normalizedRequest) ||
          availableModels.find(
            (model) =>
              safeModelId(model).toLowerCase().includes(normalizedRequest) ||
              (model.label || '').toLowerCase().includes(normalizedRequest)
          );
        if (targetModel) {
          const provider = inferProvider({ id: safeModelId(targetModel), label: targetModel.label || safeModelId(targetModel) });
          targetModel = {
            ...targetModel,
            provider,
          };
        }
      }

      if (!targetModel) {
        const preview = rankedModels
          .slice(0, 8)
          .map((model) => `${model.id} • ${model.provider} (${model.score})`)
          .join(', ');
        Message.error(
          t('conversation.model.invalidModel', {
            model: requestedModel,
            preview,
            defaultValue: `Model "${requestedModel}" niet gevonden. Voorbeeld: ${preview}`,
          })
        );
        return;
      }

      const result = await ipcBridge.acpConversation.setModel.invoke({
        conversationId: conversation_id,
        modelId: targetModel.id,
      });

      if (!result.success) {
        Message.error(
          t('conversation.model.switchFailed', {
            model: targetModel.id,
            error: result.msg || 'onbekende fout',
            defaultValue: `Model switch gefaald: ${result.msg || 'onbekende fout'}`,
          })
        );
        return;
      }

      Message.success(
        t('conversation.model.switched', {
          model: modelLabel(targetModel),
          provider: targetModel.provider || inferProvider({ id: targetModel.id, label: targetModel.label || targetModel.id }),
          defaultValue: `Model wissel gelukt: ${modelLabel(targetModel)} (${targetModel.provider || inferProvider({ id: targetModel.id, label: targetModel.label || targetModel.id })})`,
        })
      );
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

  useAddEventListener('acp.selected.file', setAtPath);
  useAddEventListener('acp.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
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
        slashCommands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
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
