import { ipcBridge } from '@/common';
import { ConversationPreparation, createAionCoreConversationPreparationAdapter } from '@/common/adapter/conversation';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import ChatConversation, {
  createConversationFromConversation,
} from '@/renderer/pages/conversation/components/ChatConversation';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getAvailableModels } from '@/renderer/pages/guid/utils/modelUtils';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import { addEventListener, emitter } from '@/renderer/utils/emitter';
import { Alert, Button, Drawer, Empty, Message, Spin, Steps, Tag, Tooltip } from '@arco-design/web-react';
import { AddOne, Comments, Data, History, Refresh, Robot } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { mutate as swrMutate } from 'swr';
import type { AssistantSurfaceId } from '../registry';
import { readAssistantSurfaceState, writeAssistantSurfaceState } from '../storage';
import { appendSurfaceContextBlock, type SurfaceContextSnapshot } from '../surfaceContext';
import styles from './BusinessSurfaceShell.module.css';

type SpecializedSurfaceId = Exclude<AssistantSurfaceId, 'general'>;
type SupportedConversation = Extract<TChatConversation, { type: 'aionrs' | 'acp' | 'antigravity' }>;

const RECENT_CONVERSATION_LIMIT = 50;
const SALES_FORECAST_ASSISTANT_ID = 'sales-forecast-planning';
const SALES_FORECAST_SKILL_ID = 'sales-forecast-submit';
const createPreparationIdempotencyKey = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `conversation-preparation-${Date.now()}`;

const BusinessSurfaceSessionContext = React.createContext<{ conversationId: string | null }>({
  conversationId: null,
});

export const useBusinessSurfaceSession = () => React.useContext(BusinessSurfaceSessionContext);

const isSupportedConversation = (conversation: TChatConversation): conversation is SupportedConversation =>
  conversation.type === 'aionrs' || conversation.type === 'acp' || conversation.type === 'antigravity';

export const findPreferredForecastAssistant = (assistants: Assistant[]): Assistant | undefined => {
  const builtin = assistants.find(
    (candidate) => candidate.id === SALES_FORECAST_ASSISTANT_ID && candidate.source === 'builtin'
  );
  if (builtin) return builtin;

  const candidates = assistants.filter((candidate) =>
    [...(candidate.enabled_skills ?? []), ...(candidate.custom_skill_names ?? [])].includes(SALES_FORECAST_SKILL_ID)
  );
  return candidates.find((candidate) => candidate.source !== 'generated') ?? candidates[0];
};

export const findDefaultForecastModel = (providers: IProvider[]): TProviderWithModel | undefined => {
  const provider = providers.find(
    (candidate) => candidate.enabled !== false && getAvailableModels(candidate).length > 0
  );
  const useModel = provider ? getAvailableModels(provider)[0] : undefined;
  return provider && useModel ? { ...provider, use_model: useModel } : undefined;
};

const isConversationForAssistant = (
  conversation: TChatConversation,
  assistantId: string
): conversation is SupportedConversation => {
  const extra = conversation.extra;
  const belongsToTeam = typeof extra === 'object' && extra !== null && ('team_id' in extra || 'teamId' in extra);
  return isSupportedConversation(conversation) && conversation.assistant?.id === assistantId && !belongsToTeam;
};

const conversationOptionLabel = (conversation: SupportedConversation) => {
  const assistantName = conversation.assistant?.name?.trim();
  return assistantName ? `${conversation.name} · ${assistantName}` : conversation.name;
};

const ActiveTurnTag: React.FC<{
  surfaceId: SpecializedSurfaceId;
  conversationId: string;
}> = ({ surfaceId, conversationId }) => {
  const { t } = useTranslation();
  const runtime = useConversationRuntimeView(conversationId);
  if (!runtime.isProcessing || !runtime.activeTurnId) return null;
  return (
    <Tag size='small' color='blue' data-testid={`${surfaceId}-active-turn`}>
      {t('common.assistantSurface.activeTurn', {
        defaultValue: '运行中 · {{turnId}}',
        turnId: runtime.activeTurnId,
      })}
    </Tag>
  );
};

type BusinessSurfaceShellProps = React.PropsWithChildren<{
  surfaceId: SpecializedSurfaceId;
  stateScope: string;
  surfaceContext?: SurfaceContextSnapshot;
  surfaceContextConversationId?: string | null;
  automaticAnalysis?: { snapshot?: SurfaceContextSnapshot; prompt: string; label: string; unavailable: boolean };
  agentName: string;
  conversationTitle: string;
  selectConversationLabel: string;
  boardLabel: string;
  fixtureBoundary?: string;
  workflowSteps: readonly string[];
  workflowCurrent: number;
}>;

const DesktopConversationRail: React.FC<{
  surfaceId: SpecializedSurfaceId;
  title: string;
  header: React.ReactNode;
  body: React.ReactNode;
}> = ({ surfaceId, title, header, body }) => {
  const { t } = useTranslation();
  const railRef = useRef<HTMLElement>(null);
  const [maxWidth, setMaxWidth] = useState(720);
  const minWidth = Math.min(266, maxWidth);
  const {
    splitRatio: width,
    setSplitRatio: setWidth,
    createDragHandle,
  } = useResizableSplit({
    unit: 'px',
    defaultWidth: Math.min(340, maxWidth),
    minWidth,
    maxWidth,
    storageKey: `aionui:assistant-surface:${surfaceId}:conversation-width`,
  });
  useEffect(() => {
    const container = railRef.current?.parentElement;
    if (!container) return;
    const update = () => {
      const available = container.getBoundingClientRect().width;
      if (available > 0) setMaxWidth(Math.min(720, available - Math.min(320, available * 0.55)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (width > maxWidth || width < minWidth) setWidth(Math.max(minWidth, Math.min(maxWidth, width)));
  }, [width, maxWidth, minWidth, setWidth]);
  const resizeLabel = t('common.assistantSurface.resizeConversation');
  return (
    <aside
      ref={railRef}
      className={styles.conversationRegion}
      style={{ width: Math.min(width, maxWidth), minWidth }}
      data-testid={`${surfaceId}-conversation-region`}
      aria-label={title}
    >
      {React.cloneElement(createDragHandle({ reverse: true, style: { left: 0, width: 8, touchAction: 'none' } }), {
        role: 'separator',
        tabIndex: 0,
        'aria-label': resizeLabel,
        'aria-orientation': 'vertical',
        'aria-valuemin': Math.round(minWidth),
        'aria-valuemax': Math.round(maxWidth),
        'aria-valuenow': Math.round(Math.min(width, maxWidth)),
        title: resizeLabel,
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          const next =
            event.key === 'ArrowLeft'
              ? width + 20
              : event.key === 'ArrowRight'
                ? width - 20
                : event.key === 'Home'
                  ? minWidth
                  : event.key === 'End'
                    ? maxWidth
                    : undefined;
          if (next === undefined) return;
          event.preventDefault();
          setWidth(Math.max(minWidth, Math.min(maxWidth, next)));
        },
      })}
      {header}
      <div className={styles.conversationBody}>{body}</div>
    </aside>
  );
};

const BusinessSurfaceShell: React.FC<BusinessSurfaceShellProps> = ({
  surfaceId,
  stateScope,
  surfaceContext,
  surfaceContextConversationId,
  automaticAnalysis,
  agentName,
  conversationTitle,
  selectConversationLabel,
  boardLabel,
  fixtureBoundary,
  workflowSteps,
  workflowCurrent,
  children,
}) => {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<SupportedConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, setLastSharedRevision] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState(() =>
    readAssistantSurfaceState<string | null>(surfaceId, `${stateScope}:conversation-binding`, null)
  );
  // Automatic analysis owns a fresh conversation; never send into a restored history binding.
  const analysisKey = automaticAnalysis?.snapshot
    ? `${stateScope}:${JSON.stringify(automaticAnalysis.snapshot.payload)}`
    : undefined;
  const analysisKeyRef = useRef(analysisKey);
  analysisKeyRef.current = analysisKey;
  const mountedRef = useRef(true);
  const selectionGenerationRef = useRef(0);
  const attemptedAnalysisRef = useRef<string | undefined>(undefined);
  const pendingFirstTurnRef = useRef<{ storageKey: string; value: string } | undefined>(undefined);
  const clearPendingFirstTurn = useCallback(() => {
    const pending = pendingFirstTurnRef.current;
    if (pending && sessionStorage.getItem(pending.storageKey) === pending.value) {
      sessionStorage.removeItem(pending.storageKey);
    }
    pendingFirstTurnRef.current = undefined;
  }, []);
  useEffect(() => () => clearPendingFirstTurn(), [analysisKey, clearPendingFirstTurn]);
  const [analysisBinding, setAnalysisBinding] = useState<{
    key?: string;
    conversationId?: string;
    failed?: boolean;
    modelMissing?: boolean;
    history?: boolean;
  }>();
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const selectedConversationIdRef = useRef(selectedConversationId);
  const preferredAssistantRef = useRef<Assistant | undefined>(undefined);
  const conversationPreparationRef = useRef(
    new ConversationPreparation(
      createAionCoreConversationPreparationAdapter((request) =>
        ipcBridge.conversation.prepareConfiguration.invoke(request)
      )
    )
  );

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const resolvePreferredAssistant = useCallback(async () => {
    const assistant = findPreferredForecastAssistant(await ipcBridge.assistants.list.invoke());
    preferredAssistantRef.current = assistant;
    return assistant;
  }, []);

  const refreshConversations = useCallback(() => {
    setLoadingConversations(true);
    setLoadError(false);
    void ipcBridge.database.getUserConversations
      .invoke({ limit: RECENT_CONVERSATION_LIMIT })
      .then(async (result) => {
        const assistant = await resolvePreferredAssistant();
        let next = (result?.items ?? [])
          .filter((conversation): conversation is SupportedConversation =>
            assistant ? isConversationForAssistant(conversation, assistant.id) : false
          )
          .toSorted((a, b) => getActivityTime(b) - getActivityTime(a));

        const boundConversationId = selectedConversationIdRef.current;
        if (boundConversationId && !next.some((conversation) => conversation.id === boundConversationId)) {
          const boundConversation = await getConversationOrNull(boundConversationId);
          if (boundConversation && assistant && isConversationForAssistant(boundConversation, assistant.id)) {
            next = [boundConversation, ...next];
          }
        }

        setConversations(next);
        setSelectedConversationId((current) =>
          current && next.some((conversation) => conversation.id === current) ? current : null
        );
      })
      .catch((error) => {
        console.error(`[${surfaceId}AssistantSurface] Failed to load conversations:`, error);
        setLoadError(true);
        setConversations([]);
      })
      .finally(() => setLoadingConversations(false));
  }, [resolvePreferredAssistant, surfaceId]);

  useEffect(() => {
    refreshConversations();
    return addEventListener('chat.history.refresh', refreshConversations);
  }, [refreshConversations]);

  useEffect(() => {
    writeAssistantSurfaceState(surfaceId, `${stateScope}:conversation-binding`, selectedConversationId);
    setLastSharedRevision(
      selectedConversationId
        ? readAssistantSurfaceState<number | null>(
            surfaceId,
            `${stateScope}:conversation:${selectedConversationId}:last-shared-revision`,
            null
          )
        : null
    );
  }, [selectedConversationId, stateScope, surfaceId]);

  useEffect(
    () =>
      addEventListener('assistant-surface.context-sent', (event) => {
        if (event.surfaceId !== surfaceId) return;
        writeAssistantSurfaceState(
          surfaceId,
          `${stateScope}:conversation:${event.conversationId}:last-shared-revision`,
          event.revision
        );
        if (event.conversationId === selectedConversationId) setLastSharedRevision(event.revision);
      }),
    [selectedConversationId, stateScope, surfaceId]
  );

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId]
  );

  const createConversation = useCallback(
    async (analysis?: { key: string; snapshot: SurfaceContextSnapshot; prompt: string }) => {
      if (creatingConversation) return;
      const generation = ++selectionGenerationRef.current;
      const sourceConversation = selectedConversation ?? conversations[0];
      setCreatingConversation(true);
      let modelMissing = false;
      try {
        const assistant = preferredAssistantRef.current ?? (await resolvePreferredAssistant());
        if (!assistant) {
          Message.error(t('conversation.attention.salesForecast.assistantUnavailable'));
          return;
        }
        let created: TChatConversation;
        if (sourceConversation) {
          created = await createConversationFromConversation(sourceConversation);
        } else {
          if (!assistant.enabled) {
            await ipcBridge.assistants.setState.invoke({ id: assistant.id, enabled: true });
            await swrMutate('assistants.list');
          }
          const preparationResult = await conversationPreparationRef.current.prepare({
            assistant,
            locale: i18n.language,
            idempotencyKey: createPreparationIdempotencyKey(),
            overrides: {},
          });
          if (preparationResult.status !== 'ready') {
            Message.error(t('conversation.attention.salesForecast.startFailed'));
            return;
          }
          const requiresLocalModel = preparationResult.mode === 'standard' && isAionrsAssistant(assistant);
          const model = requiresLocalModel
            ? findDefaultForecastModel(await ipcBridge.mode.listProviders.invoke())
            : undefined;
          if (requiresLocalModel && !model) {
            modelMissing = true;
            if (!analysis) Message.error(t('conversation.noModelConfigured'));
            return;
          }
          created = await ipcBridge.conversation.create.invoke(
            preparationResult.preparation
              ? { preparation: preparationResult.preparation }
              : {
                  name: conversationTitle,
                  model,
                  assistant: { id: assistant.id, locale: i18n.language, conversation_overrides: {} },
                  extra: {},
                }
          );
        }
        if (!isConversationForAssistant(created, assistant.id)) return;
        if (analysis) {
          if (
            !mountedRef.current ||
            analysisKeyRef.current !== analysis.key ||
            selectionGenerationRef.current !== generation
          ) {
            if (analysisKeyRef.current !== analysis.key && attemptedAnalysisRef.current === analysis.key)
              attemptedAnalysisRef.current = undefined;
            return;
          }
          const storageKey = `${created.type === 'aionrs' ? 'aionrs' : 'acp'}_initial_message_${created.id}`;
          const value = JSON.stringify({ input: appendSurfaceContextBlock(analysis.prompt, analysis.snapshot) });
          sessionStorage.setItem(storageKey, value);
          pendingFirstTurnRef.current = { storageKey, value };
          setAnalysisBinding({ key: analysis.key, conversationId: created.id });
        } else if (analysisKeyRef.current) {
          setAnalysisBinding({ key: analysisKeyRef.current, conversationId: created.id });
        }
        setConversations((current) => [created, ...current.filter((conversation) => conversation.id !== created.id)]);
        selectedConversationIdRef.current = created.id;
        setSelectedConversationId(created.id);
        if (!sourceConversation) emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error(`[${surfaceId}AssistantSurface] Failed to create conversation:`, error);
        Message.error(getConversationCreateErrorMessage(error, t));
      } finally {
        if (
          analysis &&
          mountedRef.current &&
          analysisKeyRef.current === analysis.key &&
          selectionGenerationRef.current === generation
        ) {
          setAnalysisBinding((current) =>
            current?.key === analysis.key && current.conversationId
              ? current
              : { key: analysis.key, failed: true, modelMissing }
          );
        }
        setCreatingConversation(false);
      }
    },
    [
      conversationTitle,
      conversations,
      creatingConversation,
      i18n.language,
      resolvePreferredAssistant,
      selectedConversation,
      surfaceId,
      t,
    ]
  );
  useEffect(() => {
    if (!analysisKey || !automaticAnalysis?.snapshot || loadingConversations || loadError || creatingConversation)
      return;
    if (attemptedAnalysisRef.current === analysisKey) return;
    const snapshot = automaticAnalysis.snapshot;
    const prompt = automaticAnalysis.prompt;
    // Coalesce rapid scope changes before preparing a conversation.
    const timer = window.setTimeout(() => {
      attemptedAnalysisRef.current = analysisKey;
      void createConversation({ key: analysisKey, snapshot, prompt });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    analysisKey,
    automaticAnalysis,
    loadingConversations,
    loadError,
    creatingConversation,
    createConversation,
    analysisBinding,
  ]);

  const showingAnalysisHistory = analysisBinding?.history && analysisBinding.key === analysisKey;
  const analysisPending =
    automaticAnalysis && !showingAnalysisHistory && (!analysisKey || analysisBinding?.key !== analysisKey);
  const analysisFailed = automaticAnalysis && analysisBinding?.key === analysisKey && analysisBinding?.failed;
  const activeSurfaceContext = automaticAnalysis
    ? analysisBinding?.key === analysisKey && !analysisBinding?.history
      ? automaticAnalysis.snapshot
      : undefined
    : surfaceContext && surfaceContextConversationId === selectedConversationId
      ? surfaceContext
      : undefined;

  const conversationBody = loadingConversations ? (
    <div className={styles.conversationState}>
      <Spin />
      <span>{t('common.assistantSurface.loadingConversations', { defaultValue: '正在加载对话…' })}</span>
    </div>
  ) : loadError ? (
    <div className={styles.conversationState}>
      <Alert
        type='error'
        showIcon
        content={t('common.assistantSurface.conversationLoadFailed', { defaultValue: '对话加载失败。' })}
      />
      <Button icon={<Refresh size={14} />} onClick={refreshConversations}>
        {t('common.retry')}
      </Button>
    </div>
  ) : analysisPending || analysisFailed ? (
    <div className={styles.conversationState} role='status'>
      {analysisFailed || automaticAnalysis?.unavailable ? (
        <Alert
          type={analysisFailed ? 'error' : 'info'}
          content={t(
            analysisFailed
              ? analysisBinding?.modelMissing
                ? 'conversation.noModelConfigured'
                : 'common.assistantSurface.approvalAnalysis.failed'
              : 'common.assistantSurface.approvalAnalysis.unavailable'
          )}
        />
      ) : (
        <>
          <Spin />
          <span>{t('common.assistantSurface.approvalAnalysis.loading')}</span>
        </>
      )}
      {analysisFailed && analysisBinding?.modelMissing ? (
        <Button type='primary' onClick={() => navigate('/settings/model')}>
          {t('common.assistantSurface.approvalAnalysis.configureModel')}
        </Button>
      ) : null}
      {analysisFailed ? (
        <Button
          onClick={() => {
            attemptedAnalysisRef.current = undefined;
            setAnalysisBinding(undefined);
          }}
        >
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  ) : selectedConversation ? (
    <ChatConversation
      key={selectedConversation.id}
      conversation={selectedConversation}
      embedded
      surfaceContext={activeSurfaceContext}
      scrollPersistenceKey={`aionui:assistant-surface:${surfaceId}:${stateScope}:conversation:${selectedConversation.id}:scroll`}
    />
  ) : (
    <div className={styles.conversationState}>
      <Empty
        icon={<Comments size={36} />}
        description={t('common.assistantSurface.explicitConversationBinding', {
          defaultValue: '请选择一个对话。工作台不会自动把业务上下文发送到未确认的会话。',
        })}
      />
      <Button type='primary' loading={creatingConversation} onClick={() => void createConversation()}>
        {t('common.assistantSurface.createConversation', { defaultValue: '新建 AI 对话' })}
      </Button>
    </div>
  );

  const historyBody = loadingConversations ? (
    <div className={styles.historyState}>
      <Spin />
      <span>{t('common.assistantSurface.loadingConversations', { defaultValue: '正在加载对话…' })}</span>
    </div>
  ) : loadError ? (
    <div className={styles.historyState}>
      <Alert
        type='error'
        showIcon
        content={t('common.assistantSurface.conversationLoadFailed', { defaultValue: '对话加载失败。' })}
      />
      <Button icon={<Refresh size={14} />} onClick={refreshConversations}>
        {t('common.retry')}
      </Button>
    </div>
  ) : conversations.length === 0 ? (
    <div className={styles.historyState}>
      <Empty description={t('common.assistantSurface.chooseConversation', { defaultValue: '选择对话' })} />
    </div>
  ) : (
    <div className={styles.historyList} role='listbox' aria-label={selectConversationLabel}>
      {conversations.map((conversation) => (
        <Button
          key={conversation.id}
          type='text'
          long
          className={styles.historyItem}
          data-selected={conversation.id === selectedConversationId}
          role='option'
          aria-selected={conversation.id === selectedConversationId}
          onClick={() => {
            selectionGenerationRef.current++;
            setSelectedConversationId(conversation.id);
            clearPendingFirstTurn();
            if (automaticAnalysis) {
              attemptedAnalysisRef.current = analysisKey;
              setAnalysisBinding({ key: analysisKey, conversationId: conversation.id, history: true });
            }
            setHistoryOpen(false);
          }}
        >
          {conversationOptionLabel(conversation)}
        </Button>
      ))}
    </div>
  );

  const conversationHeader = (
    <>
      <header className={styles.conversationHeader}>
        <div className={styles.conversationHeading}>
          <Robot size={16} />
          <span className={styles.agentName}>{agentName}</span>
          {selectedConversationId ? (
            <ActiveTurnTag surfaceId={surfaceId} conversationId={selectedConversationId} />
          ) : null}
        </div>
        <div className={styles.conversationControls}>
          <Tooltip content={t('common.assistantSurface.conversationHistory', { defaultValue: '历史对话' })}>
            <Button
              type='text'
              size='mini'
              icon={<History size={15} />}
              aria-label={t('common.assistantSurface.conversationHistory', { defaultValue: '历史对话' })}
              data-testid={`${surfaceId}-conversation-select`}
              onClick={() => setHistoryOpen(true)}
            />
          </Tooltip>
          <Tooltip content={t('common.assistantSurface.newConversation', { defaultValue: '新对话' })}>
            <Button
              type='text'
              size='mini'
              icon={<AddOne size={15} />}
              loading={creatingConversation}
              aria-label={t('common.assistantSurface.newConversation', { defaultValue: '新对话' })}
              data-testid={`${surfaceId}-new-conversation`}
              onClick={() => void createConversation()}
            />
          </Tooltip>
        </div>
      </header>
      {automaticAnalysis ? (
        <div className={styles.analysisScope}>
          <strong>{t('common.assistantSurface.approvalAnalysis.title')}</strong>
          <span>
            {showingAnalysisHistory ? t('common.assistantSurface.approvalAnalysis.history') : automaticAnalysis.label}
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div className={styles.root} data-testid={`assistant-surface-${surfaceId}`}>
        <section className={styles.boardRegion} data-testid={`${surfaceId}-board-region`} aria-label={boardLabel}>
          {workflowSteps.length > 0 ? (
            <div
              className={styles.taskRoute}
              aria-label={t('common.assistantSurface.workflow', { defaultValue: 'Agent 任务航线' })}
            >
              <Steps current={workflowCurrent} size='small'>
                {workflowSteps.map((step) => (
                  <Steps.Step key={step} title={step} />
                ))}
              </Steps>
            </div>
          ) : null}
          <BusinessSurfaceSessionContext.Provider value={{ conversationId: selectedConversationId }}>
            <div className={styles.boardContent}>{children}</div>
          </BusinessSurfaceSessionContext.Provider>
          {fixtureBoundary ? (
            <footer className={styles.fixtureBoundary} data-testid={`${surfaceId}-fixture-boundary`}>
              <Data size={13} />
              {fixtureBoundary}
            </footer>
          ) : null}
        </section>

        <DesktopConversationRail
          surfaceId={surfaceId}
          title={conversationTitle}
          header={conversationHeader}
          body={<div className={styles.realConversation}>{conversationBody}</div>}
        />
      </div>
      <Drawer
        wrapClassName={styles.historyDrawerWrapper}
        width={320}
        title={t('common.assistantSurface.conversationHistory', { defaultValue: '历史对话' })}
        visible={historyOpen}
        footer={null}
        unmountOnExit
        onCancel={() => setHistoryOpen(false)}
      >
        <div className={styles.historyPanel} data-testid={`${surfaceId}-history-panel`}>
          {historyBody}
        </div>
      </Drawer>
    </>
  );
};

export default BusinessSurfaceShell;
