import type { TFunction } from 'i18next';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { salesPlan } from '@/common/adapter/ipcBridge';
import BusinessSurfaceShell from './components/BusinessSurfaceShell';
import BusinessMessageInbox from './components/BusinessMessageInbox';
import RegionalApprovalWorkbench, {
  type RegionalApprovalWorkbenchContext,
} from './workbenches/regionalApproval/RegionalApprovalWorkbench';
import { getAssistantSurfaceWorkbenchScope, readAssistantSurfaceState, writeAssistantSurfaceState } from './storage';
import {
  resolveSurfaceContextRevision,
  type SurfaceContextRevisionState,
  type SurfaceContextSnapshot,
} from './surfaceContext';

const CURRENT_WORKBENCH_FOCUS = {
  target: 'current-workbench',
  priority: ['selectedEntities', 'analysisSummary', 'visibleEntities', 'metrics', 'scope'],
  constrainToSnapshot: true,
} as const;

const contextSummary = (context: RegionalApprovalWorkbenchContext, t: TFunction) => {
  const authority = context.authority;
  if (!authority) return '';
  return t('common.assistantSurface.regionalApproval.authorityContextSummary', {
    source: t(`common.assistantSurface.regionalApproval.contextSources.${authority.source}`),
    stage: t(`common.assistantSurface.regionalApproval.stages.${authority.filterSummary.approvalStage}`),
    planId: authority.planId ?? '—',
    status: authority.status ?? '—',
  });
};

export const shouldDisableFixtureSalesPlanQuery = ({
  fixtureEnvironment,
  e2eEnvironment,
  e2eSalesPlanQuery,
}: {
  fixtureEnvironment: boolean;
  e2eEnvironment: boolean;
  e2eSalesPlanQuery: boolean;
}) => fixtureEnvironment && !(e2eEnvironment && e2eSalesPlanQuery);

const ForecastAssistantSurface: React.FC<{
  stateScope: string;
  businessView?: string;
  permissionCodes?: readonly string[];
  draftStorageScope?: string;
  onRefreshPermissions?: () => Promise<void>;
}> = ({ stateScope, businessView, permissionCodes, draftStorageScope, onRefreshPermissions }) => {
  const { t } = useTranslation();
  const [analysisContext, setAnalysisContext] = useState<RegionalApprovalWorkbenchContext>();
  const [surfaceContext, setSurfaceContext] = useState<SurfaceContextSnapshot>();
  const [surfaceContextConversationId, setSurfaceContextConversationId] = useState<string | null>();

  const handleBoardContextChange = useCallback(
    (context: RegionalApprovalWorkbenchContext, conversationId: string | null) => {
      setAnalysisContext(context);
      if (!context.authority) {
        setSurfaceContext(undefined);
        setSurfaceContextConversationId(conversationId);
        return;
      }
      const payload = {
        focus: CURRENT_WORKBENCH_FOCUS,
        ...context,
      };
      const serialized = JSON.stringify(payload);
      const candidateKey = `${getAssistantSurfaceWorkbenchScope(stateScope)}:context-candidate`;
      const previousCandidate = readAssistantSurfaceState<SurfaceContextRevisionState | null>(
        'forecast',
        candidateKey,
        null
      );
      const candidate = resolveSurfaceContextRevision(previousCandidate, serialized, new Date().toISOString());
      if (candidate !== previousCandidate) {
        writeAssistantSurfaceState('forecast', candidateKey, candidate);
      }
      setSurfaceContextConversationId(conversationId);
      setSurfaceContext({
        schemaVersion: 1,
        surfaceId: 'forecast',
        revision: candidate.revision,
        capturedAt: candidate.capturedAt,
        label: t('common.assistantSurface.forecastBoardLabel'),
        summary: contextSummary(context, t),
        payload,
      });
    },
    [stateScope, t]
  );

  const showingMessages = businessView === 'messages';
  const fixtureEnvironment = typeof window !== 'undefined' && window.__aionuiAssistantSurfaceFixtures === true;
  const queryClient: null | undefined = shouldDisableFixtureSalesPlanQuery({
    fixtureEnvironment,
    e2eEnvironment: typeof window !== 'undefined' && window.__aionuiE2ETest === true,
    e2eSalesPlanQuery: typeof window !== 'undefined' && window.__aionuiE2ESalesPlanQuery === true,
  })
    ? null
    : undefined;
  // Each object remains read-only unless its authenticated detail grants the action.
  const liveActionsEnabled = queryClient !== null;

  return (
    <BusinessSurfaceShell
      automaticAnalysis={
        showingMessages
          ? undefined
          : {
              snapshot:
                analysisContext &&
                ['success', 'fixture'].includes(analysisContext.evidence.queryState) &&
                (analysisContext.selectedEntities.length > 0 ||
                  !analysisContext.analysisSummary ||
                  analysisContext.analysisSummary.status === 'success') &&
                analysisContext.visibleEntities.length > 0
                  ? surfaceContext
                  : undefined,
              prompt: t('common.assistantSurface.approvalAnalysis.prompt'),
              label: analysisContext
                ? t('common.assistantSurface.approvalAnalysis.scope', {
                    month: analysisContext.scope.month,
                    dimension: analysisContext.scope.dimension
                      ? t(`common.assistantSurface.regionalApproval.dimensions.${analysisContext.scope.dimension}`)
                      : '',
                    target: analysisContext.selectedEntities.length
                      ? analysisContext.selectedEntities
                          .map((entity) =>
                            entity.source === 'fixture'
                              ? t(`common.assistantSurface.regionalApproval.organizations.${entity.organizationKey}`)
                              : entity.organizationKey
                          )
                          .join('、')
                      : t('common.assistantSurface.approvalAnalysis.summary'),
                    count:
                      analysisContext.selectedEntities.length ||
                      analysisContext.analysisSummary?.data?.count ||
                      analysisContext.visibleEntities.length,
                    total: analysisContext.pagination.total,
                  })
                : '',
              unavailable: Boolean(
                analysisContext &&
                (['error', 'stale-error', 'empty', 'empty-periods'].includes(analysisContext.evidence.queryState) ||
                  (analysisContext.selectedEntities.length === 0 &&
                    analysisContext.analysisSummary?.status === 'error'))
              ),
            }
      }
      surfaceId='forecast'
      stateScope={stateScope}
      surfaceContext={showingMessages ? undefined : surfaceContext}
      surfaceContextConversationId={showingMessages ? undefined : surfaceContextConversationId}
      agentName={t('common.assistantSurface.forecast.name')}
      conversationTitle={t('common.assistantSurface.forecastConversation')}
      selectConversationLabel={t('common.assistantSurface.selectConversation')}
      boardLabel={
        showingMessages
          ? t('common.assistantSurface.messages.title')
          : t('common.assistantSurface.regionalApproval.ariaLabel')
      }
      {...(showingMessages ? { fixtureBoundary: t('common.assistantSurface.messages.boundary') } : {})}
      workflowCurrent={0}
      workflowSteps={[]}
    >
      {showingMessages ? (
        <BusinessMessageInbox />
      ) : (
        <RegionalApprovalWorkbench
          stateScope={stateScope}
          t={t}
          onContextChange={handleBoardContextChange}
          queryClient={queryClient}
          detailClient={salesPlan}
          liveActionsEnabled={liveActionsEnabled}
          permissionCodes={permissionCodes}
          draftStorageScope={draftStorageScope}
          onRefreshPermissions={onRefreshPermissions}
          automaticAnalysisEnabled
        />
      )}
    </BusinessSurfaceShell>
  );
};

export default ForecastAssistantSurface;
