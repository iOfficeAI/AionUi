import {
  readSalesPlanLocalDrafts,
  writeSalesPlanLocalDrafts,
  type SalesPlanLocalDraftStore,
} from './models/salesPlanLocalDraftModel';
import { useSalesPlanAccess } from './hooks/useSalesPlanAccess';
import { salesPlanAccessForRow } from './models/salesPlanAccessModel';
import {
  Alert,
  Button,
  Empty,
  Modal,
  Pagination,
  Progress,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from '@arco-design/web-react';
import type { TableColumnProps } from '@arco-design/web-react';
import { CheckOne, Download, Info, Refresh } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBusinessSurfaceSession } from '../../components/BusinessSurfaceShell';
import {
  getAssistantSurfaceWorkbenchScope,
  readAssistantSurfaceState,
  writeAssistantSurfaceState,
} from '../../storage';
import {
  APPROVAL_STAGE_FIXTURES,
  APPROVAL_DIMENSIONS_BY_STAGE,
  REGIONAL_APPROVAL_ROWS,
  approvalRowsForStage,
  isApprovalStageId,
  type ApprovalHealth,
  type ApprovalDimension,
  type ApprovalStageId,
  type ApprovalState,
  type ApprovalVersion,
  type RegionalApprovalRow,
} from './regionalApprovalFixture';
import {
  ALL_ORGANIZATIONS,
  DEFAULT_APPROVAL_FILTERS,
  approvalFilterOptions,
  buildApprovalCsv,
  metricsForApprovalVersion,
  normalizeApprovalFilters,
  paginateApprovalRows,
  projectApprovalRows,
  updateApprovalFilter,
  type ApprovalCsvLabels,
  type ApprovalOrganizationFilterField,
  type ApprovalOrganizationFilters,
} from './regionalApprovalModel';
import RegionalApprovalPlanDetail from './RegionalApprovalPlanDetail';
import RegionalApprovalLivePlanDetail, {
  type RegionalApprovalLivePlanDetailTab,
} from './RegionalApprovalLivePlanDetail';
import RegionalApprovalActionDialog from './RegionalApprovalActionDialog';
import RegionalApprovalLiveActionDialog, { type LiveActionKind } from './RegionalApprovalLiveActionDialog';
import RegionalApprovalLiveAdjustmentDialog from './RegionalApprovalLiveAdjustmentDialog';
import RegionalApprovalLiveProgress from './RegionalApprovalLiveProgress';
import {
  EMPTY_REGIONAL_APPROVAL_ACTION_STORE,
  regionalApprovalFixtureResults,
  type RegionalApprovalActionExecutor,
  type RegionalApprovalActionStore,
} from './regionalApprovalActionModel';
import {
  EMPTY_APPROVAL_DETAIL_STORE,
  savedApprovalAdjustments,
  type ApprovalDetailStore,
} from './regionalApprovalDetailModel';
import {
  aggregateRegionalApprovalLiveCategories,
  addExactDecimals,
  SALES_PLAN_STATUS_BY_STAGE,
  clampSalesPlanPageNumber,
  formatExactDecimal,
  isOpenSalesPlanPeriod,
  projectRegionalApprovalLiveDimension,
  regionalApprovalLiveProgress,
  subtractExactDecimals,
  toRegionalApprovalLiveRow,
  VISIBLE_SALES_PLAN_STATUSES_BY_STAGE,
  type RegionalApprovalLiveCategorySummary,
  type RegionalApprovalLiveRow,
} from './regionalApprovalQueryModel';
import {
  useRegionalApprovalQuery,
  type RegionalApprovalQueryError,
  type SalesPlanQueryClient,
} from './useRegionalApprovalQuery';
import type { SalesPlanDetailClient } from './hooks/useSalesPlanDetail';
import { salesPlanApprovalNodeForStatus, type SalesPlanActionClient } from './models/salesPlanActionModel';
import type { SalesPlanAdjustmentDraft } from './models/salesPlanAdjustmentModel';
import type { GeaSalesPlanActionReceipt, GeaSalesPlanVersion } from '@/common/adapter/ipcBridge';
import {
  buildSalesPlanFilterSummary,
  projectFixtureSalesPlanContext,
  projectSalesPlanActionContext,
  projectSalesPlanQueryContext,
  type SalesPlanAuthorityContext,
  type SalesPlanContextApprovalStage,
} from './models/salesPlanContextModel';
import styles from './RegionalApprovalWorkbench.module.css';

type ApprovalContextFilters = { [Field in keyof ApprovalOrganizationFilters]: string };

export type RegionalApprovalContextEntity = {
  source: 'gea' | 'fixture';
  id: string;
  organizationKey: string;
  approvalState: ApprovalState | 'returned';
  health: ApprovalHealth | 'unknown';
  versionId?: string;
  seq?: number;
  status?: number;
  planTypeCode?: string;
  dealerCode?: string;
  orgCode?: string;
  provinceCode?: string;
  areaCode?: string;
  currentQty?: string;
  currentAmount?: string;
  targetQty?: string;
  targetAmount?: string;
  skuCount?: number;
  submitter?: string;
  returnReason?: string;
  customerCode?: string;
  category?: RegionalApprovalRow['category'];
  quantity?: string;
  amount?: string;
  previousQuantity?: string;
  previousAmount?: string;
  adjustmentQuantity?: string;
  adjustmentAmount?: string;
};

export type RegionalApprovalWorkbenchContext = {
  analysisSummary?: ReturnType<typeof useRegionalApprovalQuery>['analysisSummary'];
  view: 'regional-approval';
  fixtureState: 'ready' | 'live' | 'mixed';
  scope: {
    dimension?: ApprovalDimension;
    categoryComparison?: boolean;
    versionReferencePlanId?: string;
    currentVersionId?: string;
    primaryVersionId?: string;
    compareVersionId?: string;
    planType: string;
    month: string;
    approvalStage: SalesPlanContextApprovalStage;
    authority: 'organization';
    primaryVersion: ApprovalVersion;
    compareVersion: ApprovalVersion;
    appliedFilters: ApprovalContextFilters;
  };
  visibleEntities: RegionalApprovalContextEntity[];
  selectedEntities: RegionalApprovalContextEntity[];
  changes: ReturnType<typeof savedApprovalAdjustments>;
  localApprovalResults: ReturnType<typeof regionalApprovalFixtureResults>;
  metrics: {
    visibleCount: number;
    pendingCount: number;
    warningCount: number;
    quantity: string;
    amount: string;
    targetQuantity?: string;
    targetAmount?: string;
    savedAdjustmentCount: number;
    localApprovalResultCount: number;
  };
  pagination: { page: number; pageSize: number; total: number };
  evidence: {
    source: 'fixture' | 'gea-user-session' | 'unverified';
    permission: 'read-only' | 'user-session-action';
    completeness: 'skeleton' | 'periods-only' | 'paged-queue' | 'none';
    queryState: 'fixture' | 'loading' | 'error' | 'empty-periods' | 'empty' | 'success' | 'refreshing' | 'stale-error';
    error?: RegionalApprovalQueryError;
    dataVersion: string;
  };
  authority?: SalesPlanAuthorityContext;
};

const stageLabelKey = (stage: ApprovalStageId) => `common.assistantSurface.regionalApproval.stages.${stage}` as const;

const organizationLabelKey = (organization: RegionalApprovalRow['organizationKey']) =>
  `common.assistantSurface.regionalApproval.organizations.${organization}` as const;

const areaLabelKey = (area: RegionalApprovalRow['areaKey']) =>
  `common.assistantSurface.regionalApproval.areas.${area}` as const;

const branchLabelKey = (branch: RegionalApprovalRow['branchKey']) =>
  `common.assistantSurface.regionalApproval.branches.${branch}` as const;

const departmentLabelKey = (department: RegionalApprovalRow['departmentKey']) =>
  `common.assistantSurface.regionalApproval.departments.${department}` as const;

const customerLabelKey = (customer: RegionalApprovalRow['customerKey']) =>
  `common.assistantSurface.regionalApproval.customers.${customer}` as const;

const number = (value: number) => value.toLocaleString();
const money = (value: number) => `¥${value.toLocaleString()}`;
const exactMoney = (value: string) => `¥${formatExactDecimal(value)}`;
const isExactZero = (value: string) => /^-?0(?:\.0+)?$/.test(value);
const formattedProgress = (value: number | undefined) => (value === undefined ? '—' : `${value.toFixed(1)}%`);
const projectLiveContextEntity = (
  row: RegionalApprovalLiveRow,
  dimension: ApprovalDimension
): RegionalApprovalContextEntity => ({
  source: 'gea',
  id: row.planId,
  organizationKey: projectRegionalApprovalLiveDimension(row, dimension).name ?? row.orgCode ?? row.dealerCode,
  approvalState: row.approvalState,
  health: 'unknown',
  versionId: row.versionId,
  seq: row.seq,
  status: row.status,
  planTypeCode: row.planTypeCode,
  dealerCode: row.dealerCode,
  ...(row.orgCode ? { orgCode: row.orgCode } : {}),
  ...(row.provinceCode ? { provinceCode: row.provinceCode } : {}),
  ...(row.areaCode ? { areaCode: row.areaCode } : {}),
  currentQty: row.currentQty,
  currentAmount: row.currentAmount,
  targetQty: row.targetQty,
  targetAmount: row.targetAmount,
  skuCount: row.skuCount,
  ...(row.submitter ? { submitter: row.submitter } : {}),
  ...(row.returnReason ? { returnReason: row.returnReason } : {}),
});

const projectFixtureContextEntity = (
  row: RegionalApprovalRow,
  version: ApprovalVersion
): RegionalApprovalContextEntity => {
  const versionMetrics = metricsForApprovalVersion(row, version);
  return {
    source: 'fixture',
    id: row.id,
    organizationKey: row.organizationKey,
    approvalState: row.approvalState,
    health: row.health,
    customerCode: row.customerCode,
    category: row.category,
    quantity: String(versionMetrics.quantity),
    amount: String(versionMetrics.amount),
    previousQuantity: String(row.previousQuantity),
    previousAmount: String(row.previousAmount),
    adjustmentQuantity: String(row.adjustmentQuantity),
    adjustmentAmount: String(row.adjustmentAmount),
    ...(row.returnReason ? { returnReason: row.returnReason } : {}),
  };
};

type ExportFeedback = { type: 'success' | 'warning' | 'error'; message: string };
type LiveApprovalFilters = {
  areaCode: string;
  provinceCode: string;
  orgCode: string;
  dealerCode: string;
  status: string;
};

const EMPTY_LIVE_APPROVAL_FILTERS: LiveApprovalFilters = {
  areaCode: ALL_ORGANIZATIONS,
  provinceCode: ALL_ORGANIZATIONS,
  orgCode: ALL_ORGANIZATIONS,
  dealerCode: ALL_ORGANIZATIONS,
  status: ALL_ORGANIZATIONS,
};

const uniqueLiveNamedFilterOptions = (
  rows: readonly RegionalApprovalLiveRow[],
  valueFor: (row: RegionalApprovalLiveRow) => string | null | undefined,
  labelFor: (row: RegionalApprovalLiveRow) => string | null | undefined
) =>
  rows
    .map((row) => ({ value: valueFor(row)?.trim(), label: labelFor(row)?.trim() }))
    .filter((option): option is { value: string; label: string | undefined } => Boolean(option.value))
    .filter((option, index, options) => options.findIndex((candidate) => candidate.value === option.value) === index)
    .toSorted((left, right) => (left.label ?? left.value).localeCompare(right.label ?? right.value, 'zh-CN'));

type RegionalApprovalLiveTableRow =
  | { kind: 'plan'; tableRowId: string; plan: RegionalApprovalLiveRow }
  | {
      kind: 'category';
      tableRowId: string;
      plan: RegionalApprovalLiveRow;
      category: RegionalApprovalLiveCategorySummary;
    };

const categoryComparisonState = (summary: RegionalApprovalLiveCategorySummary) => {
  if (
    (summary.amountProgress === undefined && !isExactZero(summary.amountDelta)) ||
    (summary.quantityProgress === undefined && !isExactZero(summary.quantityDelta))
  ) {
    return 'warning' as const;
  }
  const progress = [summary.amountProgress, summary.quantityProgress].filter(
    (value): value is number => value !== undefined
  );
  if (progress.some((value) => value < 85 || value > 115)) return 'warning' as const;
  if (progress.some((value) => value < 95 || value > 105)) return 'attention' as const;
  return 'healthy' as const;
};

type PersistedApprovalWorkbenchState = {
  currentStage: ApprovalStageId;
  draftFilters: ApprovalOrganizationFilters;
  appliedFilters: ApprovalOrganizationFilters;
  primaryVersion: ApprovalVersion;
  compareVersion: ApprovalVersion;
  page: number;
  pageSize: number;
  dimension: ApprovalDimension;
  categoryComparison: boolean;
  selectedRowIds: string[];
  liveActionReceipts: Record<string, GeaSalesPlanActionReceipt>;
};

const APPROVAL_VERSIONS = ['current', 'previous', 'initial'] as const satisfies readonly ApprovalVersion[];
const approvalVersionOffset = (version: ApprovalVersion) => APPROVAL_VERSIONS.indexOf(version);

const isApprovalVersion = (value: unknown): value is ApprovalVersion =>
  APPROVAL_VERSIONS.includes(value as ApprovalVersion);

const normalizeLiveActionReceipts = (value: unknown): Record<string, GeaSalesPlanActionReceipt> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([versionId, receipt]) => {
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
      const candidate = receipt as Partial<GeaSalesPlanActionReceipt>;
      return (
        candidate.versionId === versionId &&
        typeof candidate.planId === 'string' &&
        Number.isInteger(candidate.fromStatus) &&
        Number.isInteger(candidate.toStatus) &&
        typeof candidate.replayed === 'boolean' &&
        typeof candidate.requestId === 'string' &&
        typeof candidate.traceId === 'string' &&
        typeof candidate.auditId === 'string'
      );
    })
  ) as Record<string, GeaSalesPlanActionReceipt>;
};

const queryErrorKey = (error: RegionalApprovalQueryError) =>
  `common.assistantSurface.regionalApproval.query.errors.${error}` as const;

const fixturePriority = (row: RegionalApprovalRow) => {
  if (row.approvalState === 'pending' && row.health === 'warning') return 0;
  if (row.approvalState === 'pending') return 1;
  if (row.health === 'warning' || row.health === 'attention') return 2;
  if (row.approvalState === 'approved') return 3;
  return 4;
};

const livePriority = (row: RegionalApprovalLiveRow) => {
  if (row.approvalState === 'returned') return 0;
  if (row.approvalState === 'pending') return 1;
  return 2;
};

const RegionalApprovalWorkbench: React.FC<{
  stateScope: string;
  t: TFunction;
  onContextChange: (context: RegionalApprovalWorkbenchContext, conversationId: string | null) => void;
  actionExecutor?: RegionalApprovalActionExecutor;
  queryClient?: SalesPlanQueryClient | null;
  detailClient?: SalesPlanDetailClient;
  liveActionClient?: SalesPlanActionClient;
  liveActionsEnabled?: boolean;
  permissionCodes?: readonly string[];
  draftStorageScope?: string;
  onRefreshPermissions?: () => Promise<void>;
  automaticAnalysisEnabled?: boolean;
}> = ({
  stateScope,
  t,
  onContextChange,
  actionExecutor,
  queryClient,
  detailClient,
  liveActionClient,
  liveActionsEnabled = false,
  permissionCodes = [],
  draftStorageScope,
  onRefreshPermissions,
  automaticAnalysisEnabled = false,
}) => {
  const { conversationId } = useBusinessSurfaceSession();
  const scopedState = getAssistantSurfaceWorkbenchScope(stateScope);
  const [initialState] = useState<PersistedApprovalWorkbenchState>(() => {
    const saved = readAssistantSurfaceState<Partial<PersistedApprovalWorkbenchState>>(
      'forecast',
      `${scopedState}:regional-approval-state`,
      {}
    );
    const legacyStage = readAssistantSurfaceState<unknown>('forecast', `${scopedState}:approval-stage`, 'area');
    const currentStage = isApprovalStageId(saved.currentStage)
      ? saved.currentStage
      : isApprovalStageId(legacyStage)
        ? legacyStage
        : 'area';
    const stageRows = approvalRowsForStage(REGIONAL_APPROVAL_ROWS, currentStage);
    return {
      currentStage,
      draftFilters: normalizeApprovalFilters(stageRows, {
        ...DEFAULT_APPROVAL_FILTERS,
        ...saved.draftFilters,
      }),
      appliedFilters: normalizeApprovalFilters(stageRows, {
        ...DEFAULT_APPROVAL_FILTERS,
        ...saved.appliedFilters,
      }),
      primaryVersion: isApprovalVersion(saved.primaryVersion) ? saved.primaryVersion : 'current',
      compareVersion: isApprovalVersion(saved.compareVersion) ? saved.compareVersion : 'previous',
      page: typeof saved.page === 'number' && saved.page >= 1 ? Math.floor(saved.page) : 1,
      pageSize: [10, 20, 50, 100].includes(saved.pageSize ?? 0) ? saved.pageSize! : 20,
      dimension: APPROVAL_DIMENSIONS_BY_STAGE[currentStage].includes(saved.dimension as ApprovalDimension)
        ? (saved.dimension as ApprovalDimension)
        : APPROVAL_DIMENSIONS_BY_STAGE[currentStage][0],
      categoryComparison: saved.categoryComparison === true,
      selectedRowIds: Array.isArray(saved.selectedRowIds)
        ? saved.selectedRowIds.filter((value): value is string => typeof value === 'string')
        : [],
      liveActionReceipts: normalizeLiveActionReceipts(saved.liveActionReceipts),
    };
  });
  const [currentStage, setCurrentStage] = useState(initialState.currentStage);
  const [draftFilters, setDraftFilters] = useState(initialState.draftFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialState.appliedFilters);
  const [primaryVersion, setPrimaryVersion] = useState(initialState.primaryVersion);
  const [compareVersion, setCompareVersion] = useState(initialState.compareVersion);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [page, setPage] = useState(initialState.page);
  const [dimension, setDimension] = useState(initialState.dimension);
  const [categoryComparison, setCategoryComparison] = useState(initialState.categoryComparison);
  const [liveCategorySummaries, setLiveCategorySummaries] = useState<
    Record<string, RegionalApprovalLiveCategorySummary[]>
  >({});
  const [liveCategoriesLoading, setLiveCategoriesLoading] = useState(false);
  const [draftLiveFilters, setDraftLiveFilters] = useState<LiveApprovalFilters>(EMPTY_LIVE_APPROVAL_FILTERS);
  const [appliedLiveFilters, setAppliedLiveFilters] = useState<LiveApprovalFilters>(EMPTY_LIVE_APPROVAL_FILTERS);
  const [liveStageFilter, setLiveStageFilter] = useState<ApprovalStageId>();
  const [selectedRowIds, setSelectedRowIds] = useState(initialState.selectedRowIds);
  const [progressOpen, setProgressOpen] = useState(false);
  const [narrowFiltersExpanded, setNarrowFiltersExpanded] = useState(false);
  const filterPanelId = React.useId();
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback>();
  const [detailRowId, setDetailRowId] = useState<string>();
  const [liveDetailPlanId, setLiveDetailPlanId] = useState<string>();
  const [liveAdjustmentPlanId, setLiveAdjustmentPlanId] = useState<string>();
  const [liveAdjustmentDrafts, setLiveAdjustmentDrafts] = useState<Record<string, SalesPlanAdjustmentDraft>>({});
  const [localDraftState, setLocalDraftState] = useState(() => ({
    scope: draftStorageScope,
    drafts: readSalesPlanLocalDrafts(draftStorageScope),
  }));
  const localDrafts = localDraftState.scope === draftStorageScope ? localDraftState.drafts : {};
  useEffect(() => {
    setLocalDraftState({ scope: draftStorageScope, drafts: readSalesPlanLocalDrafts(draftStorageScope) });
  }, [draftStorageScope]);
  const persistLocalDrafts = (drafts: SalesPlanLocalDraftStore) => {
    if (!draftStorageScope) throw new Error('Draft identity unavailable');
    writeSalesPlanLocalDrafts(draftStorageScope, drafts);
    setLocalDraftState({ scope: draftStorageScope, drafts });
  };
  const [focusedLivePlanId, setFocusedLivePlanId] = useState<string>();
  const [liveVersions, setLiveVersions] = useState<GeaSalesPlanVersion[]>([]);
  const [liveVersionsLoading, setLiveVersionsLoading] = useState(false);
  const [livePrimaryVersionId, setLivePrimaryVersionId] = useState<string>();
  const [liveCompareVersionId, setLiveCompareVersionId] = useState<string>();
  const [liveDetailInitialTab, setLiveDetailInitialTab] = useState<RegionalApprovalLivePlanDetailTab>('skus');
  const [liveActionPlanId, setLiveActionPlanId] = useState<string>();
  const [liveActionKind, setLiveActionKind] = useState<LiveActionKind>('APPROVE');
  const [liveActionReceipts, setLiveActionReceipts] = useState(initialState.liveActionReceipts);
  const [liveAuthorityContext, setLiveAuthorityContext] = useState<SalesPlanAuthorityContext>();
  const [permissionDeniedVersions, setPermissionDeniedVersions] = useState<Set<string>>(() => new Set());
  const [actionRowId, setActionRowId] = useState<string>();
  const [detailStore, setDetailStore] = useState<ApprovalDetailStore>(() =>
    readAssistantSurfaceState<ApprovalDetailStore>(
      'forecast',
      `${scopedState}:regional-approval-detail-state`,
      EMPTY_APPROVAL_DETAIL_STORE
    )
  );
  const [actionStore, setActionStore] = useState<RegionalApprovalActionStore>(() =>
    readAssistantSurfaceState<RegionalApprovalActionStore>(
      'forecast',
      `${scopedState}:regional-approval-action-state`,
      EMPTY_REGIONAL_APPROVAL_ACTION_STORE
    )
  );
  const liveQueryScope = useMemo(
    () => ({
      areaCode: appliedLiveFilters.areaCode === ALL_ORGANIZATIONS ? undefined : appliedLiveFilters.areaCode,
      provinceCode: appliedLiveFilters.provinceCode === ALL_ORGANIZATIONS ? undefined : appliedLiveFilters.provinceCode,
      orgCode: appliedLiveFilters.orgCode === ALL_ORGANIZATIONS ? undefined : appliedLiveFilters.orgCode,
      dealerCode: appliedLiveFilters.dealerCode === ALL_ORGANIZATIONS ? undefined : appliedLiveFilters.dealerCode,
      status: appliedLiveFilters.status === ALL_ORGANIZATIONS ? undefined : Number(appliedLiveFilters.status),
    }),
    [appliedLiveFilters]
  );
  const liveQuery = useRegionalApprovalQuery({
    client: queryClient,
    page,
    pageSize,
    scope: liveQueryScope,
    loadStageProgress: queryClient !== null,
    loadAnalysisSummary: queryClient !== null,
    stageStatuses: liveStageFilter ? VISIBLE_SALES_PLAN_STATUSES_BY_STAGE[liveStageFilter] : undefined,
  });
  const stageRows = useMemo(() => approvalRowsForStage(REGIONAL_APPROVAL_ROWS, currentStage), [currentStage]);
  const filterOptions = useMemo(() => approvalFilterOptions(stageRows, draftFilters), [draftFilters, stageRows]);
  const visibleRows = useMemo(() => projectApprovalRows(stageRows, appliedFilters), [appliedFilters, stageRows]);
  const prioritizedVisibleRows = useMemo(
    () => visibleRows.toSorted((left, right) => fixturePriority(left) - fixturePriority(right)),
    [visibleRows]
  );
  const pageData = useMemo(
    () => paginateApprovalRows(prioritizedVisibleRows, page, pageSize),
    [page, pageSize, prioritizedVisibleRows]
  );
  const filtersDirty = JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters);
  const liveFiltersDirty = JSON.stringify(draftLiveFilters) !== JSON.stringify(appliedLiveFilters);
  const savedAdjustments = useMemo(() => savedApprovalAdjustments(detailStore), [detailStore]);
  const localApprovalResults = useMemo(() => regionalApprovalFixtureResults(actionStore), [actionStore]);
  const liveRows = useMemo(
    () => (liveQuery.queueState.data?.records ?? []).map(toRegionalApprovalLiveRow),
    [liveQuery.queueState.data?.records]
  );
  const draftedLiveRows = useMemo(
    () =>
      liveRows.map((row) => {
        const drafts = Object.values(liveAdjustmentDrafts).filter((draft) => draft.versionId === row.versionId);
        if (drafts.length === 0) return row;
        const quantityDelta = addExactDecimals(
          drafts.map((draft) => subtractExactDecimals(draft.qty, draft.sourceQty))
        );
        const amountDelta = addExactDecimals(
          drafts.map((draft) => subtractExactDecimals(draft.amount, draft.sourceAmount))
        );
        return {
          ...row,
          currentQty: addExactDecimals([row.currentQty, quantityDelta]),
          currentAmount: addExactDecimals([row.currentAmount, amountDelta]),
        };
      }),
    [liveAdjustmentDrafts, liveRows]
  );
  const dimensionStage = liveQuery.enabled ? (liveStageFilter ?? currentStage) : currentStage;
  const availableDimensions = APPROVAL_DIMENSIONS_BY_STAGE[dimensionStage];
  const liveStageProgress = liveQuery.progressState.data ?? {
    customer: 0,
    region: 0,
    province: 0,
    area: 0,
    category: 0,
  };

  useEffect(() => {
    if (availableDimensions.includes(dimension)) return;
    setDimension(availableDimensions[0]);
  }, [availableDimensions, dimension]);

  useEffect(() => {
    if (!liveQuery.enabled || !categoryComparison || !detailClient || liveRows.length === 0) {
      setLiveCategorySummaries({});
      setLiveCategoriesLoading(false);
      return;
    }
    const controller = new AbortController();
    setLiveCategoriesLoading(true);
    void Promise.all(
      liveRows.map(async (row) => {
        try {
          const skus = await detailClient.versionSkus.invoke({ versionId: row.versionId, signal: controller.signal });
          return [row.planId, aggregateRegionalApprovalLiveCategories(skus)] as const;
        } catch {
          return [row.planId, []] as const;
        }
      })
    )
      .then((entries) => {
        if (!controller.signal.aborted) setLiveCategorySummaries(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLiveCategoriesLoading(false);
      });
    return () => controller.abort();
  }, [categoryComparison, detailClient, liveQuery.enabled, liveRows]);
  const liveFilterOptions = useMemo(() => {
    const provinceRows =
      draftLiveFilters.areaCode !== ALL_ORGANIZATIONS
        ? liveRows.filter((row) => row.areaCode?.trim() === draftLiveFilters.areaCode)
        : liveRows;
    const organizationRows =
      draftLiveFilters.provinceCode !== ALL_ORGANIZATIONS
        ? provinceRows.filter((row) => row.provinceCode?.trim() === draftLiveFilters.provinceCode)
        : provinceRows;
    const customerRows =
      draftLiveFilters.orgCode !== ALL_ORGANIZATIONS
        ? organizationRows.filter((row) => row.orgCode?.trim() === draftLiveFilters.orgCode)
        : organizationRows;
    return {
      areas: uniqueLiveNamedFilterOptions(
        liveRows,
        (row) => row.areaCode,
        (row) => row.areaName ?? row.regionName
      ),
      provinces: uniqueLiveNamedFilterOptions(
        provinceRows,
        (row) => row.provinceCode,
        (row) => row.provinceName ?? row.provinceRegionName
      ),
      organizations: uniqueLiveNamedFilterOptions(
        organizationRows,
        (row) => row.orgCode,
        (row) => row.orgName ?? row.salesGroupName
      ),
      customers: customerRows
        .map((row) => ({
          dealerCode: row.dealerCode.trim(),
          dealerName: row.dealerName?.trim(),
          baseName: row.baseName?.trim(),
        }))
        .filter(
          (option, index, options) => options.findIndex((item) => item.dealerCode === option.dealerCode) === index
        ),
    };
  }, [draftLiveFilters.areaCode, draftLiveFilters.orgCode, draftLiveFilters.provinceCode, liveRows]);
  const prioritizedLiveRows = useMemo(
    () => draftedLiveRows.toSorted((left, right) => livePriority(left) - livePriority(right)),
    [draftedLiveRows]
  );
  const liveTableRows = useMemo<RegionalApprovalLiveTableRow[]>(
    () =>
      prioritizedLiveRows.flatMap((plan) => [
        { kind: 'plan' as const, tableRowId: plan.planId, plan },
        ...(categoryComparison
          ? (liveCategorySummaries[plan.planId] ?? []).map((category) => ({
              kind: 'category' as const,
              tableRowId: `${plan.planId}:category:${category.categoryName}`,
              plan,
              category,
            }))
          : []),
      ]),
    [categoryComparison, liveCategorySummaries, prioritizedLiveRows]
  );
  const selectableFixtureRow = (row: RegionalApprovalRow) =>
    row.approvalState === 'pending' && row.permission === 'writable' && row.reachedStage === currentStage;
  const selectedFixtureRows = useMemo(
    () => visibleRows.filter((row) => selectedRowIds.includes(row.id)),
    [selectedRowIds, visibleRows]
  );
  const selectedLiveRows = useMemo(
    () => liveRows.filter((row) => selectedRowIds.includes(row.planId)),
    [liveRows, selectedRowIds]
  );
  const displayStage = liveQuery.enabled ? undefined : currentStage;
  const effectiveStage: SalesPlanContextApprovalStage = liveQuery.enabled ? (liveStageFilter ?? 'all') : currentStage;
  const contextAppliedFilters = useMemo<ApprovalContextFilters>(
    () =>
      liveQuery.enabled
        ? {
            area: appliedLiveFilters.areaCode,
            branch: appliedLiveFilters.provinceCode,
            department: appliedLiveFilters.orgCode,
            customer: appliedLiveFilters.dealerCode,
            approval: appliedLiveFilters.status,
            health: ALL_ORGANIZATIONS,
          }
        : appliedFilters,
    [appliedFilters, appliedLiveFilters, liveQuery.enabled]
  );
  const activeDetailRow = visibleRows.find((row) => row.id === detailRowId);
  const activeLiveDetailRow = liveRows.find((row) => row.planId === liveDetailPlanId);
  const activeLiveAdjustmentRow = liveRows.find((row) => row.planId === liveAdjustmentPlanId);
  const focusedLiveRow = liveRows.find((row) => row.planId === focusedLivePlanId) ?? liveRows[0];
  // Version responses can still belong to the previous plan while focus changes.
  const scopedPrimaryVersionId = liveVersions.some(
    (version) => version.planId === focusedLiveRow?.planId && version.id === livePrimaryVersionId
  )
    ? livePrimaryVersionId
    : undefined;
  const scopedCompareVersionId = liveVersions.some(
    (version) => version.planId === focusedLiveRow?.planId && version.id === liveCompareVersionId
  )
    ? liveCompareVersionId
    : undefined;
  const historicalSummaryUnavailable = Boolean(
    liveQuery.enabled && scopedPrimaryVersionId && scopedPrimaryVersionId !== focusedLiveRow?.versionId
  );
  const scopeSummary = useMemo<typeof liveQuery.analysisSummary>(
    () => (historicalSummaryUnavailable ? { status: 'error', error: 'unavailable' } : liveQuery.analysisSummary),
    [historicalSummaryUnavailable, liveQuery.analysisSummary]
  );
  const liveAccess = useSalesPlanAccess(
    liveRows,
    detailClient,
    liveQuery.enabled && liveActionsEnabled && liveQuery.queueState.status === 'success'
  );
  const refreshLiveAuthority = () => {
    void onRefreshPermissions?.();
    setPermissionDeniedVersions(new Set());
    liveAccess.refresh();
    liveQuery.retryQueue();
  };
  const activeLiveActionRow = liveRows.find((row) => row.planId === liveActionPlanId);
  const activeActionRow = visibleRows.find((row) => row.id === actionRowId);
  const contextFilterSummary = useMemo(
    () =>
      buildSalesPlanFilterSummary({
        periodMonth: liveQuery.selectedPeriod?.periodMonth ?? (liveQuery.enabled ? undefined : '2026-09'),
        planTypeCode: liveQuery.selectedPeriod?.planTypeCode ?? (liveQuery.enabled ? undefined : 'monthly'),
        approvalStage: effectiveStage,
        queueMode: 'approval',
        appliedFilters: contextAppliedFilters,
      }),
    [contextAppliedFilters, effectiveStage, liveQuery.enabled, liveQuery.selectedPeriod]
  );

  useEffect(() => {
    const planId = focusedLiveRow?.planId;
    const currentVersionId = focusedLiveRow?.versionId;
    if (!liveQuery.enabled || !detailClient || !planId || !currentVersionId) {
      setLiveVersions([]);
      setLiveVersionsLoading(false);
      setLivePrimaryVersionId(undefined);
      setLiveCompareVersionId(undefined);
      return;
    }
    const controller = new AbortController();
    setLiveVersionsLoading(true);
    void detailClient.versions
      .invoke({ planId, signal: controller.signal })
      .then((versions) => {
        if (controller.signal.aborted) return;
        const matchingVersions = versions
          .filter((version) => version.planId === planId)
          .toSorted((left, right) => right.seq - left.seq);
        const currentVersion = matchingVersions.find((version) => version.id === currentVersionId);
        if (!currentVersion) {
          setLiveVersions([]);
          setLivePrimaryVersionId(undefined);
          setLiveCompareVersionId(undefined);
          return;
        }
        const currentIndex = matchingVersions.findIndex((version) => version.id === currentVersion.id);
        const previousVersion = matchingVersions[currentIndex + 1] ?? currentVersion;
        setLiveVersions(matchingVersions);
        setLivePrimaryVersionId(currentVersion.id);
        setLiveCompareVersionId(previousVersion.id);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLiveVersions([]);
        setLivePrimaryVersionId(undefined);
        setLiveCompareVersionId(undefined);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLiveVersionsLoading(false);
      });
    return () => controller.abort();
  }, [detailClient, focusedLiveRow?.planId, focusedLiveRow?.versionId, liveQuery.enabled]);

  const liveActionDisabledReason = (row: RegionalApprovalLiveRow, kind: LiveActionKind = 'APPROVE') => {
    if (!liveActionsEnabled) return 'missingAuthority';
    if (liveActionReceipts[row.versionId]?.fromStatus === row.status) return 'completed';
    if (permissionDeniedVersions.has(row.versionId)) return 'permission';
    if (liveQuery.queueState.status !== 'success') return 'queueNotFresh';
    const detail = liveAccess.entries[row.versionId];
    if (!detail || !salesPlanAccessForRow(row, detail, permissionCodes)?.allowedActions.includes(kind))
      return 'missingAuthority';
    if (kind === 'SAVE') return draftStorageScope ? undefined : 'missingAuthority';
    if (!isOpenSalesPlanPeriod(liveQuery.selectedPeriod)) return 'closedPeriod';
    if (salesPlanApprovalNodeForStatus(row.status) === undefined) return 'notCurrentStage';
    return undefined;
  };
  const metrics = useMemo(() => {
    if (liveQuery.enabled) {
      return {
        visibleCount: liveRows.length,
        pendingCount: liveRows.filter((row) => row.approvalState === 'pending').length,
        warningCount: liveRows.filter((row) => row.approvalState === 'returned').length,
        quantity: scopeSummary.data?.quantity ?? '—',
        amount: scopeSummary.data?.amount ?? '—',
        targetQuantity: scopeSummary.data?.targetQuantity,
        targetAmount: scopeSummary.data?.targetAmount,
        savedAdjustmentCount: Object.keys(liveAdjustmentDrafts).length,
        localApprovalResultCount: 0,
      };
    }
    return {
      visibleCount: visibleRows.length,
      pendingCount: visibleRows.filter((row) => row.approvalState === 'pending').length,
      warningCount: visibleRows.filter((row) => row.health === 'warning').length,
      quantity: addExactDecimals(
        visibleRows.map((row) => String(metricsForApprovalVersion(row, primaryVersion).quantity))
      ),
      amount: addExactDecimals(visibleRows.map((row) => String(metricsForApprovalVersion(row, primaryVersion).amount))),
      targetQuantity: undefined,
      targetAmount: undefined,
      savedAdjustmentCount: savedAdjustments.length,
      localApprovalResultCount: localApprovalResults.length,
    };
  }, [
    scopeSummary,
    draftedLiveRows,
    liveAdjustmentDrafts,
    liveQuery.enabled,
    localApprovalResults.length,
    primaryVersion,
    savedAdjustments.length,
    visibleRows,
  ]);

  useEffect(() => {
    writeAssistantSurfaceState('forecast', `${scopedState}:approval-stage`, currentStage);
    writeAssistantSurfaceState<PersistedApprovalWorkbenchState>('forecast', `${scopedState}:regional-approval-state`, {
      currentStage,
      draftFilters,
      appliedFilters,
      primaryVersion,
      compareVersion,
      page,
      pageSize,
      dimension,
      categoryComparison,
      selectedRowIds,
      liveActionReceipts,
    });
  }, [
    appliedFilters,
    categoryComparison,
    compareVersion,
    currentStage,
    dimension,
    draftFilters,
    liveActionReceipts,
    page,
    pageSize,
    primaryVersion,
    scopedState,
    selectedRowIds,
  ]);

  useEffect(() => {
    writeAssistantSurfaceState('forecast', `${scopedState}:regional-approval-detail-state`, detailStore);
  }, [detailStore, scopedState]);

  useEffect(() => {
    setLiveDetailPlanId(undefined);
    setLiveAdjustmentPlanId(undefined);
    setLiveActionPlanId(undefined);
    setLiveAuthorityContext(undefined);
    setPermissionDeniedVersions(new Set());
  }, [appliedFilters, appliedLiveFilters, currentStage, liveQuery.selectedPeriod?.periodId, page, pageSize]);

  useEffect(() => {
    writeAssistantSurfaceState('forecast', `${scopedState}:regional-approval-action-state`, actionStore);
  }, [actionStore, scopedState]);

  useEffect(() => {
    if (!liveQuery.enabled) {
      if (page !== pageData.page) setPage(pageData.page);
      return;
    }
    if (liveQuery.queueState.status !== 'success') return;
    if (liveQuery.queueSettledPage !== clampSalesPlanPageNumber(page)) return;
    const pages = clampSalesPlanPageNumber(liveQuery.queueState.data.pages);
    const serverPage = Math.min(clampSalesPlanPageNumber(liveQuery.queueState.data.current), pages);
    if (page !== serverPage) setPage(serverPage);
  }, [liveQuery.enabled, liveQuery.queueSettledPage, liveQuery.queueState, page, pageData.page]);

  const liveEvidence = useMemo<RegionalApprovalWorkbenchContext['evidence']>(() => {
    if (!liveQuery.enabled) {
      return {
        source: 'fixture',
        permission: 'read-only',
        completeness: 'skeleton',
        queryState: 'fixture',
        dataVersion: 'regional-approval-fixture-v3',
      };
    }

    const queueData = liveQuery.queueState.data;
    const queryError =
      liveQuery.queueState.status === 'error'
        ? liveQuery.queueState.error
        : liveQuery.periodsState.status === 'error'
          ? liveQuery.periodsState.error
          : undefined;
    if (queueData) {
      return {
        source: 'gea-user-session',
        permission: 'read-only',
        completeness: 'paged-queue',
        queryState: queryError
          ? 'stale-error'
          : liveQuery.queueState.status === 'loading' || liveQuery.periodsState.status === 'loading'
            ? 'refreshing'
            : queueData.records.length === 0
              ? 'empty'
              : 'success',
        error: queryError,
        dataVersion: 'sales-plan-v1.11',
      };
    }

    if (liveQuery.periodsState.status === 'success') {
      return {
        source: 'gea-user-session',
        permission: 'read-only',
        completeness: 'periods-only',
        queryState:
          liveQuery.periods.length === 0
            ? 'empty-periods'
            : liveQuery.queueState.status === 'error'
              ? 'error'
              : 'loading',
        error: queryError,
        dataVersion: 'sales-plan-v1.11',
      };
    }

    return {
      source: 'unverified',
      permission: 'read-only',
      completeness: 'none',
      queryState: queryError ? 'error' : 'loading',
      error: queryError,
      dataVersion: 'unverified',
    };
  }, [liveQuery.enabled, liveQuery.periods.length, liveQuery.periodsState, liveQuery.queueState]);

  useEffect(() => {
    const usingLiveQueue = liveQuery.enabled;
    const selectedAuthority =
      usingLiveQueue && selectedLiveRows.length === 1
        ? liveAuthorityContext?.planId === selectedLiveRows[0].planId &&
          liveAuthorityContext.source === 'gea-user-session-action'
          ? liveAuthorityContext
          : projectSalesPlanQueryContext(selectedLiveRows[0], contextFilterSummary)
        : undefined;
    const authority = usingLiveQueue
      ? (selectedAuthority ??
        (liveQuery.queueState.status === 'success'
          ? projectSalesPlanQueryContext(undefined, contextFilterSummary)
          : undefined))
      : projectFixtureSalesPlanContext(contextFilterSummary);
    onContextChange(
      {
        ...(usingLiveQueue && automaticAnalysisEnabled ? { analysisSummary: scopeSummary } : {}),
        view: 'regional-approval',
        fixtureState: usingLiveQueue ? 'live' : 'ready',
        scope: {
          dimension,
          categoryComparison,
          ...(usingLiveQueue
            ? {
                versionReferencePlanId: focusedLiveRow?.planId,
                currentVersionId: focusedLiveRow?.versionId,
                primaryVersionId: scopedPrimaryVersionId,
                compareVersionId: scopedCompareVersionId,
              }
            : {}),
          planType: liveQuery.selectedPeriod?.planTypeCode ?? (usingLiveQueue ? 'unknown' : 'monthly'),
          month: liveQuery.selectedPeriod?.periodMonth ?? (usingLiveQueue ? '' : '2026-09'),
          approvalStage: effectiveStage,
          authority: 'organization',
          primaryVersion: usingLiveQueue ? 'current' : primaryVersion,
          compareVersion: usingLiveQueue ? 'previous' : compareVersion,
          appliedFilters: contextAppliedFilters,
        },
        visibleEntities: usingLiveQueue
          ? draftedLiveRows.map((row) => projectLiveContextEntity(row, dimension))
          : visibleRows.map((row) => projectFixtureContextEntity(row, primaryVersion)),
        selectedEntities: usingLiveQueue
          ? selectedLiveRows.map((row) => projectLiveContextEntity(row, dimension))
          : selectedFixtureRows.map((row) => projectFixtureContextEntity(row, primaryVersion)),
        changes: usingLiveQueue ? [] : savedAdjustments,
        localApprovalResults: usingLiveQueue ? [] : localApprovalResults,
        metrics,
        pagination: usingLiveQueue
          ? {
              page: liveQuery.queueState.data?.current ?? page,
              pageSize: liveQuery.queueState.data?.size ?? pageSize,
              total: liveQuery.queueState.data?.total ?? 0,
            }
          : { page: pageData.page, pageSize: pageData.pageSize, total: pageData.total },
        evidence: liveEvidence,
        authority,
      },
      conversationId
    );
  }, [
    automaticAnalysisEnabled,
    scopeSummary,
    dimension,
    categoryComparison,
    focusedLiveRow?.planId,
    focusedLiveRow?.versionId,
    scopedPrimaryVersionId,
    scopedCompareVersionId,
    compareVersion,
    contextAppliedFilters,
    conversationId,
    currentStage,
    metrics,
    localApprovalResults,
    liveQuery.enabled,
    liveQuery.queueState.data,
    liveQuery.selectedPeriod,
    liveEvidence,
    liveAuthorityContext,
    draftedLiveRows,
    onContextChange,
    page,
    pageData,
    pageSize,
    primaryVersion,
    savedAdjustments,
    selectedFixtureRows,
    selectedLiveRows,
    contextFilterSummary,
    visibleRows,
  ]);

  const selectLivePlanContext = (row: RegionalApprovalLiveRow) => {
    setLiveAuthorityContext(projectSalesPlanQueryContext(row, contextFilterSummary));
  };

  const changeStage = (stage: ApprovalStageId) => {
    if (liveQuery.enabled) {
      setLiveStageFilter((current) => (current === stage ? undefined : stage));
      setDraftLiveFilters((current) => ({ ...current, status: ALL_ORGANIZATIONS }));
      setAppliedLiveFilters((current) => ({ ...current, status: ALL_ORGANIZATIONS }));
      setSelectedRowIds([]);
      setPage(1);
      return;
    }
    const nextRows = approvalRowsForStage(REGIONAL_APPROVAL_ROWS, stage);
    setCurrentStage(stage);
    setDraftFilters((current) => normalizeApprovalFilters(nextRows, current));
    setAppliedFilters((current) => normalizeApprovalFilters(nextRows, current));
    setDimension(APPROVAL_DIMENSIONS_BY_STAGE[stage][0]);
    setSelectedRowIds([]);
    setPage(1);
    setExportFeedback(undefined);
  };

  const updateDraftFilter = <Field extends ApprovalOrganizationFilterField>(
    field: Field,
    value: ApprovalOrganizationFilters[Field]
  ) => {
    setDraftFilters((current) => updateApprovalFilter(stageRows, current, field, value));
    setExportFeedback(undefined);
  };

  const updateLiveDraftFilter = (field: keyof LiveApprovalFilters, value: string) => {
    if (field === 'status') setLiveStageFilter(undefined);
    setDraftLiveFilters((current) => {
      const next = { ...current, [field]: value };
      if (field === 'areaCode') {
        next.provinceCode = ALL_ORGANIZATIONS;
        next.orgCode = ALL_ORGANIZATIONS;
        next.dealerCode = ALL_ORGANIZATIONS;
      } else if (field === 'provinceCode') {
        next.orgCode = ALL_ORGANIZATIONS;
        next.dealerCode = ALL_ORGANIZATIONS;
      } else if (field === 'orgCode') {
        next.dealerCode = ALL_ORGANIZATIONS;
      }
      return next;
    });
    setExportFeedback(undefined);
  };

  const applyFilters = () => {
    if (liveQuery.enabled) {
      setAppliedLiveFilters(draftLiveFilters);
      setSelectedRowIds([]);
      setPage(1);
      return;
    }
    setAppliedFilters(draftFilters);
    setSelectedRowIds([]);
    setPage(1);
  };

  const resetFilters = () => {
    if (liveQuery.enabled) {
      setDraftLiveFilters(EMPTY_LIVE_APPROVAL_FILTERS);
      setAppliedLiveFilters(EMPTY_LIVE_APPROVAL_FILTERS);
      setLiveStageFilter(undefined);
      setSelectedRowIds([]);
      setPage(1);
      setExportFeedback(undefined);
      return;
    }
    setDraftFilters(DEFAULT_APPROVAL_FILTERS);
    setAppliedFilters(DEFAULT_APPROVAL_FILTERS);
    setSelectedRowIds([]);
    setPage(1);
    setExportFeedback(undefined);
  };

  const applyHealthFilter = (health: ApprovalHealth) => {
    const nextFilters = { ...draftFilters, health };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setSelectedRowIds([]);
    setPage(1);
  };

  const changePrimaryVersion = (version: ApprovalVersion) => {
    setSelectedRowIds([]);
    setPrimaryVersion(version);
    if (approvalVersionOffset(version) > approvalVersionOffset(compareVersion)) {
      setCompareVersion(version);
    } else if (version === compareVersion && approvalVersionOffset(version) > 0) {
      setCompareVersion(APPROVAL_VERSIONS[approvalVersionOffset(version) - 1]);
    }
    setPage(1);
  };

  const changeCompareVersion = (version: ApprovalVersion) => {
    setSelectedRowIds([]);
    setCompareVersion(version);
    if (approvalVersionOffset(primaryVersion) > approvalVersionOffset(version)) setPrimaryVersion(version);
    setPage(1);
  };

  const openDetail = (row: RegionalApprovalRow) => {
    if (selectableFixtureRow(row)) setSelectedRowIds([row.id]);
    setDetailRowId(row.id);
  };
  const openAction = (row: RegionalApprovalRow) => setActionRowId(row.id);

  const versionLabel = (version: ApprovalVersion) => t(`common.assistantSurface.regionalApproval.versions.${version}`);

  const liveVersionLabel = (versionId: string) => {
    const offset = liveVersions.findIndex((version) => version.id === versionId);
    return offset <= 0
      ? t('common.assistantSurface.regionalApproval.versions.current')
      : t('common.assistantSurface.regionalApproval.versions.offset', { offset });
  };

  const openLiveVersionComparison = (primaryVersionId: string, compareVersionId: string) => {
    const row = focusedLiveRow;
    if (!row) return;
    setLivePrimaryVersionId(primaryVersionId);
    setLiveCompareVersionId(compareVersionId);
    setSelectedRowIds([]);
    setLiveAuthorityContext(undefined);
    setLiveDetailInitialTab('compare');
    setLiveDetailPlanId(row.planId);
  };

  const changeLivePrimaryVersion = (versionId: string) => {
    const primary = liveVersions.find((version) => version.id === versionId);
    const compare = liveVersions.find((version) => version.id === liveCompareVersionId);
    if (!primary) return;
    openLiveVersionComparison(primary.id, compare && compare.seq <= primary.seq ? compare.id : primary.id);
  };

  const changeLiveCompareVersion = (versionId: string) => {
    const primary = liveVersions.find((version) => version.id === livePrimaryVersionId);
    const compare = liveVersions.find((version) => version.id === versionId);
    if (!compare) return;
    openLiveVersionComparison(primary && primary.seq >= compare.seq ? primary.id : compare.id, compare.id);
  };

  const exportScope = JSON.stringify([
    liveQueryScope,
    liveQuery.selectedPeriod?.periodId,
    liveStageFilter,
    page,
    pageSize,
  ]);
  const exportScopeRef = useRef(exportScope);
  const exportRowsRef = useRef(liveRows);
  const exportMountedRef = useRef(true);
  exportScopeRef.current = exportScope;
  exportRowsRef.current = liveRows;
  useEffect(() => {
    exportMountedRef.current = true;
    return () => {
      exportMountedRef.current = false;
    };
  }, []);
  const exportQueue = async () => {
    if (liveQuery.enabled) {
      if (liveQuery.queueState.status !== 'success' || liveRows.length === 0) {
        setExportFeedback({
          type: 'warning',
          message: t('common.assistantSurface.regionalApproval.exportFeedback.empty'),
        });
        return;
      }
      try {
        const XLSX = await import('xlsx-republish');
        if (!exportMountedRef.current || exportScopeRef.current !== exportScope || exportRowsRef.current !== liveRows)
          return;
        if (
          liveRows.some(
            (row) =>
              [row.planId, row.versionId, row.periodId, row.dealerCode].some((value) => !String(value ?? '').trim()) ||
              [row.targetQty, row.targetAmount, row.currentQty, row.currentAmount].some(
                (value) => !/^-?\d+(?:\.\d+)?$/.test(value)
              )
          )
        ) {
          setExportFeedback({
            type: 'error',
            message: t('common.assistantSurface.regionalApproval.exportFeedback.missingData'),
          });
          return;
        }
        const numericValue = (value: string) => {
          const numeric = Number(value);
          return Number.isFinite(numeric) &&
            Math.abs(numeric) <= Number.MAX_SAFE_INTEGER &&
            value.replace(/[-.]/g, '').replace(/^0+/, '').replace(/0+$/, '').length <= 15 &&
            !String(numeric).includes('e') &&
            isExactZero(subtractExactDecimals(String(numeric), value))
            ? numeric
            : value;
        };
        const headers = [
          'planId',
          'versionId',
          'periodId',
          'dealerCode',
          'status',
          'targetQty',
          'targetAmount',
          'currentQty',
          'currentAmount',
        ] as const;
        const sheet = XLSX.utils.aoa_to_sheet([
          headers.map((field) => t(`common.assistantSurface.regionalApproval.exportColumns.${field}`)),
          ...liveRows.map((row) => [
            row.planId,
            row.versionId,
            row.periodId,
            row.dealerCode,
            t(`common.assistantSurface.regionalApproval.query.status.${row.status}`),
            numericValue(row.targetQty),
            numericValue(row.targetAmount),
            numericValue(row.currentQty),
            numericValue(row.currentAmount),
          ]),
        ]);
        sheet['!cols'] = headers.map(() => ({ wch: 24 }));
        for (let row = 2; row <= liveRows.length + 1; row++) {
          for (const column of ['G', 'I'])
            if (sheet[`${column}${row}`]?.t === 'n') sheet[`${column}${row}`].z = '#,##0.00';
        }
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          workbook,
          sheet,
          t('common.assistantSurface.regionalApproval.exportColumns.sheet')
        );
        const exportLabel = (key: string) => t(`common.assistantSurface.regionalApproval.exportScope.${key}`);
        const metadata = [
          [exportLabel('scope'), exportLabel('currentPage')],
          [exportLabel('month'), liveQuery.selectedPeriod?.periodMonth ?? '—'],
          [exportLabel('planType'), liveQuery.selectedPeriod?.planTypeCode ?? '—'],
          [exportLabel('version'), exportLabel('currentVersion')],
          [exportLabel('page'), liveQuery.queueState.data.current],
          [exportLabel('pageSize'), liveQuery.queueState.data.size],
          [exportLabel('exported'), liveRows.length],
          [exportLabel('total'), liveQuery.queueState.data.total],
          [exportLabel('stage'), t(`common.assistantSurface.regionalApproval.stages.${liveStageFilter ?? 'all'}`)],
          ...(['areaCode', 'provinceCode', 'orgCode', 'dealerCode', 'status'] as const).map((field) => [
            exportLabel(field),
            String(liveQueryScope[field] ?? exportLabel('all')),
          ]),
        ];
        const scopeSheet = XLSX.utils.aoa_to_sheet(metadata);
        scopeSheet['!cols'] = [{ wch: 20 }, { wch: 42 }];
        XLSX.utils.book_append_sheet(workbook, scopeSheet, exportLabel('sheet'));
        const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        const url = URL.createObjectURL(
          new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = `sales-plan-approval-${liveQuery.selectedPeriod?.periodMonth ?? 'period'}-${liveStageFilter ?? 'all'}-page-${liveQuery.queueState.data.current}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
        setExportFeedback({
          type: 'success',
          message: t('common.assistantSurface.regionalApproval.exportFeedback.successLive', { count: liveRows.length }),
        });
      } catch {
        setExportFeedback({
          type: 'error',
          message: t('common.assistantSurface.regionalApproval.exportFeedback.failed'),
        });
      }
      return;
    }
    if (visibleRows.length === 0) {
      setExportFeedback({
        type: 'warning',
        message: t('common.assistantSurface.regionalApproval.exportFeedback.empty'),
      });
      return;
    }
    const csvLabels: ApprovalCsvLabels = {
      version: t('common.assistantSurface.regionalApproval.csv.version'),
      stage: t('common.assistantSurface.regionalApproval.csv.stage'),
      organization: t('common.assistantSurface.regionalApproval.csv.organization'),
      area: t('common.assistantSurface.regionalApproval.csv.area'),
      branch: t('common.assistantSurface.regionalApproval.csv.branch'),
      department: t('common.assistantSurface.regionalApproval.csv.department'),
      customer: t('common.assistantSurface.regionalApproval.csv.customer'),
      quantity: t('common.assistantSurface.regionalApproval.csv.quantity'),
      amount: t('common.assistantSurface.regionalApproval.csv.amount'),
      versionValues: {
        current: versionLabel('current'),
        previous: versionLabel('previous'),
        initial: versionLabel('initial'),
      },
    };
    try {
      const csv = buildApprovalCsv(visibleRows, primaryVersion, currentStage, csvLabels);
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `regional-approval-${primaryVersion}-fixture.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setExportFeedback({
        type: 'success',
        message: t('common.assistantSurface.regionalApproval.exportFeedback.success', {
          count: visibleRows.length,
          version: versionLabel(primaryVersion),
        }),
      });
    } catch {
      setExportFeedback({
        type: 'error',
        message: t('common.assistantSurface.regionalApproval.exportFeedback.failed'),
      });
    }
  };

  const currentStageIndex = APPROVAL_STAGE_FIXTURES.findIndex((stage) => stage.id === displayStage);
  const healthColors: Record<ApprovalHealth, 'green' | 'orange' | 'red'> = {
    healthy: 'green',
    attention: 'orange',
    warning: 'red',
  };
  const approvalColors: Record<ApprovalState, 'arcoblue' | 'green' | 'gray'> = {
    pending: 'arcoblue',
    approved: 'green',
    future: 'gray',
  };
  const localResultFor = (row: RegionalApprovalRow) =>
    localApprovalResults
      .toReversed()
      .find((result) => result.scope.organizationId === row.id && result.scope.version === primaryVersion);
  const liveColumns: TableColumnProps<RegionalApprovalLiveTableRow>[] = [
    {
      title: t('common.assistantSurface.regionalApproval.columns.organization'),
      width: 220,
      render: (_, tableRow) => {
        if (tableRow.kind === 'category') {
          return (
            <div
              className={styles.categoryOrganizationCell}
              data-testid={`regional-approval-category-row-${tableRow.plan.planId}-${tableRow.category.categoryName}`}
            >
              <span aria-hidden>›</span>
              <div>
                <strong>
                  {t('common.assistantSurface.regionalApproval.categoryRows.name', {
                    category: tableRow.category.categoryName,
                  })}
                </strong>
                <small>
                  {t('common.assistantSurface.regionalApproval.categoryRows.skuCount', {
                    count: tableRow.category.skuCount,
                  })}
                </small>
              </div>
            </div>
          );
        }
        const row = tableRow.plan;
        const projection = projectRegionalApprovalLiveDimension(tableRow.plan, dimension);
        const organizationName =
          projection.name ?? t('common.assistantSurface.regionalApproval.query.unnamedOrganization');
        return (
          <div className={styles.organizationCell}>
            <Button
              type='text'
              size='small'
              className={styles.detailTrigger}
              onClick={() => {
                selectLivePlanContext(row);
                setFocusedLivePlanId(row.planId);
                setLiveAdjustmentPlanId(row.planId);
              }}
              aria-label={t('common.assistantSurface.regionalApproval.liveAdjustment.openFor', {
                plan: organizationName,
              })}
              title={
                organizationName === t('common.assistantSurface.regionalApproval.query.unnamedOrganization')
                  ? t('common.assistantSurface.regionalApproval.query.unnamedOrganizationHint')
                  : undefined
              }
            >
              {organizationName}
            </Button>
            <Tag
              color={
                !liveActionDisabledReason(row, 'SAVE') || !liveActionDisabledReason(row, 'APPROVE')
                  ? 'arcoblue'
                  : 'gray'
              }
            >
              {t(
                !liveActionDisabledReason(row, 'SAVE')
                  ? 'common.assistantSurface.regionalApproval.liveAction.canSave'
                  : !liveActionDisabledReason(row, 'APPROVE')
                    ? 'common.assistantSurface.regionalApproval.liveAction.canApprove'
                    : 'common.assistantSurface.regionalApproval.liveAdjustment.readOnly'
              )}
            </Tag>
            <span data-testid={`regional-approval-scope-${row.planId}`} title={projection.context.join(' / ')}>
              {projection.context.length > 0
                ? projection.context.map((name, index) => (
                    <React.Fragment key={`${name}-${index}`}>
                      {index > 0 ? ' / ' : null}
                      <span>{name}</span>
                    </React.Fragment>
                  ))
                : '—'}
            </span>
          </div>
        );
      },
    },
    {
      title: t('common.assistantSurface.regionalApproval.columns.plan'),
      width: 165,
      render: (_, tableRow) => {
        const category = tableRow.kind === 'category' ? tableRow.category : undefined;
        const row = tableRow.plan;
        return (
          <div className={styles.stackCell}>
            <strong>{formatExactDecimal(category?.quantity ?? row.currentQty)} 件</strong>
            <span>{exactMoney(category?.amount ?? row.currentAmount)}</span>
          </div>
        );
      },
    },
    {
      title: categoryComparison
        ? t('common.assistantSurface.regionalApproval.columns.categoryProgress')
        : t('common.assistantSurface.regionalApproval.columns.progress'),
      width: 190,
      render: (_, tableRow) => {
        if (tableRow.kind === 'plan') {
          const progress = regionalApprovalLiveProgress(tableRow.plan);
          return (
            <div className={styles.categoryProgressCell}>
              <strong>
                {t('common.assistantSurface.regionalApproval.categoryRows.amountProgress', {
                  progress: formattedProgress(progress.amount),
                })}
              </strong>
              <Progress
                percent={Math.min(progress.amount ?? 0, 100)}
                showText={false}
                size='small'
                color='rgb(var(--danger-6))'
                width={100}
              />
              <small>
                {t('common.assistantSurface.regionalApproval.query.target')} {exactMoney(tableRow.plan.targetAmount)}
              </small>
              <strong>
                {t('common.assistantSurface.regionalApproval.categoryRows.quantityProgress', {
                  progress: formattedProgress(progress.quantity),
                })}
              </strong>
              <Progress
                percent={Math.min(progress.quantity ?? 0, 100)}
                showText={false}
                size='small'
                color='rgb(var(--orange-6))'
                width={100}
              />
              <small>
                {t('common.assistantSurface.regionalApproval.query.target')}{' '}
                {formatExactDecimal(tableRow.plan.targetQty)}
              </small>
            </div>
          );
        }
        const { category } = tableRow;
        return (
          <div className={styles.categoryProgressCell}>
            <strong>
              {t('common.assistantSurface.regionalApproval.categoryRows.amountProgress', {
                progress: formattedProgress(category.amountProgress),
              })}
            </strong>
            <Progress
              percent={Math.min(category.amountProgress ?? 0, 100)}
              showText={false}
              size='small'
              color='rgb(var(--danger-6))'
              width={100}
            />
            <small>
              {t('common.assistantSurface.regionalApproval.categoryRows.baseAmount', {
                amount: exactMoney(category.baseAmount),
              })}
            </small>
            <strong>
              {t('common.assistantSurface.regionalApproval.categoryRows.quantityProgress', {
                progress: formattedProgress(category.quantityProgress),
              })}
            </strong>
            <Progress
              percent={Math.min(category.quantityProgress ?? 0, 100)}
              showText={false}
              size='small'
              color='rgb(var(--orange-6))'
              width={100}
            />
            <small>
              {t('common.assistantSurface.regionalApproval.categoryRows.baseQuantity', {
                quantity: formatExactDecimal(category.baseQuantity),
              })}
            </small>
          </div>
        );
      },
    },
    {
      title: categoryComparison
        ? t('common.assistantSurface.regionalApproval.columns.aiOpinion')
        : t('common.assistantSurface.regionalApproval.columns.status'),
      width: categoryComparison ? 220 : 95,
      render: (_, tableRow) => {
        if (tableRow.kind === 'plan') {
          const row = tableRow.plan;
          return (
            <Tag
              color={
                row.approvalState === 'approved' ? 'green' : row.approvalState === 'returned' ? 'orange' : 'arcoblue'
              }
            >
              {t(`common.assistantSurface.regionalApproval.query.status.${row.status}`)}
            </Tag>
          );
        }
        const state = categoryComparisonState(tableRow.category);
        return (
          <div className={styles.categoryOpinionCell}>
            <Tag color={state === 'healthy' ? 'green' : state === 'attention' ? 'orange' : 'red'}>
              {t(`common.assistantSurface.regionalApproval.health.${state}`)}
            </Tag>
            <span>
              {t(`common.assistantSurface.regionalApproval.categoryRows.advice.${state}`, {
                category: tableRow.category.categoryName,
              })}
            </span>
          </div>
        );
      },
    },
  ];
  const columns: TableColumnProps<RegionalApprovalRow>[] = [
    {
      title: t('common.assistantSurface.regionalApproval.columns.organization'),
      width: 220,
      render: (_, row) => (
        <div className={styles.organizationCell}>
          <Button
            type='text'
            size='small'
            className={styles.detailTrigger}
            onClick={() => openDetail(row)}
            aria-label={t('common.assistantSurface.regionalApproval.detail.openFor', {
              organization: t(organizationLabelKey(row.organizationKey)),
            })}
          >
            {t(organizationLabelKey(row.organizationKey))}
          </Button>
          <span>
            {t(areaLabelKey(row.areaKey))} · {t(branchLabelKey(row.branchKey))} ·{' '}
            {t(departmentLabelKey(row.departmentKey))}
          </span>
          <small>
            {row.customerCode} · {t(customerLabelKey(row.customerKey))}
            <Button
              type='text'
              size='mini'
              className={styles.healthFilterAction}
              aria-label={t('common.assistantSurface.regionalApproval.healthFilter', {
                health: t(`common.assistantSurface.regionalApproval.health.${row.health}`),
              })}
              onClick={() => applyHealthFilter(row.health)}
            >
              <Tag size='small' color={healthColors[row.health]}>
                {t(`common.assistantSurface.regionalApproval.health.${row.health}`)}
              </Tag>
            </Button>
          </small>
        </div>
      ),
    },
    ...(categoryComparison
      ? [
          {
            title: t('common.assistantSurface.regionalApproval.columns.category'),
            width: 110,
            render: (_: unknown, row: RegionalApprovalRow) => (
              <Tag>{t(`common.assistantSurface.regionalApproval.categories.${row.category}`)}</Tag>
            ),
          },
        ]
      : []),
    {
      title: t('common.assistantSurface.regionalApproval.columns.aiOpinion'),
      width: 190,
      render: (_, row) => t(`common.assistantSurface.regionalApproval.opinions.${row.aiOpinionKey}`),
    },
    {
      title: t('common.assistantSurface.regionalApproval.columns.quantity'),
      width: 100,
      render: (_, row) => <strong>{number(metricsForApprovalVersion(row, primaryVersion).quantity)}</strong>,
    },
    {
      title: t('common.assistantSurface.regionalApproval.columns.amount'),
      width: 110,
      render: (_, row) => <strong>{money(metricsForApprovalVersion(row, primaryVersion).amount)}</strong>,
    },
    {
      title: t('common.assistantSurface.regionalApproval.columns.progress'),
      width: 125,
      render: (_, row) => (
        <div className={styles.stackCell}>
          <strong>
            {t('common.assistantSurface.regionalApproval.quantityProgress', { progress: row.quantityProgress })}
          </strong>
          <span>{t('common.assistantSurface.regionalApproval.amountProgress', { progress: row.amountProgress })}</span>
        </div>
      ),
    },
    ...(primaryVersion !== compareVersion
      ? [
          {
            title: t('common.assistantSurface.regionalApproval.columns.comparison'),
            width: 145,
            render: (_: unknown, row: RegionalApprovalRow) => {
              const primary = metricsForApprovalVersion(row, primaryVersion);
              const compare = metricsForApprovalVersion(row, compareVersion);
              return (
                <div className={styles.stackCell}>
                  <strong>
                    {primary.quantity - compare.quantity >= 0 ? '+' : ''}
                    {number(primary.quantity - compare.quantity)}
                  </strong>
                  <span>
                    {primary.amount - compare.amount >= 0 ? '+' : ''}
                    {money(primary.amount - compare.amount)}
                  </span>
                </div>
              );
            },
          },
          {
            title: t('common.assistantSurface.regionalApproval.columns.returnReason'),
            width: 170,
            render: (_: unknown, row: RegionalApprovalRow) =>
              row.returnReason ?? t('common.assistantSurface.regionalApproval.columns.noReturnReason'),
          },
        ]
      : []),
    {
      title: t('common.assistantSurface.regionalApproval.columns.status'),
      width: 90,
      fixed: 'right',
      render: (_, row) => {
        const localResult = localResultFor(row);
        return localResult ? (
          <Tag color={localResult.kind === 'submit' ? 'green' : 'orange'}>
            {t(`common.assistantSurface.regionalApproval.action.rowStatus.${localResult.kind}`)}
          </Tag>
        ) : (
          <Tag color={approvalColors[row.approvalState]}>
            {t(`common.assistantSurface.regionalApproval.status.${row.approvalState}`)}
          </Tag>
        );
      },
    },
  ];
  const approvalActionButtons = liveQuery.enabled ? (
    <>
      <Button
        size='small'
        disabled={
          selectedLiveRows.length !== 1 ||
          Boolean(selectedLiveRows[0] && liveActionDisabledReason(selectedLiveRows[0], 'SAVE'))
        }
        onClick={() => {
          const row = selectedLiveRows[0];
          if (!row || liveActionDisabledReason(row, 'SAVE')) return;
          selectLivePlanContext(row);
          setLiveActionKind('SAVE');
          setLiveActionPlanId(row.planId);
        }}
      >
        {t('common.assistantSurface.regionalApproval.liveAction.save')}
      </Button>
      <Button
        size='small'
        status='danger'
        disabled={
          selectedLiveRows.length !== 1 ||
          selectedLiveRows[0]?.status === 5 ||
          (selectedLiveRows[0] ? Boolean(liveActionDisabledReason(selectedLiveRows[0], 'REJECT')) : true)
        }
        onClick={() => {
          const row = selectedLiveRows[0];
          if (!row) return;
          selectLivePlanContext(row);
          setLiveActionKind('REJECT');
          setLiveActionPlanId(row.planId);
        }}
      >
        {t('common.assistantSurface.regionalApproval.liveAction.reject')}
      </Button>
      <Button
        type='primary'
        size='small'
        disabled={
          selectedLiveRows.length !== 1 ||
          (selectedLiveRows[0] ? Boolean(liveActionDisabledReason(selectedLiveRows[0])) : true)
        }
        onClick={() => {
          const row = selectedLiveRows[0];
          if (!row) return;
          selectLivePlanContext(row);
          setLiveActionKind('APPROVE');
          setLiveActionPlanId(row.planId);
        }}
      >
        {t('common.assistantSurface.regionalApproval.liveAction.approve')}
      </Button>
    </>
  ) : (
    <>
      <Button
        size='small'
        status='danger'
        disabled={selectedFixtureRows.length === 0 || !selectedFixtureRows.every(selectableFixtureRow)}
        onClick={() => selectedFixtureRows[0] && openAction(selectedFixtureRows[0])}
      >
        {t('common.assistantSurface.regionalApproval.footer.return')}
      </Button>
      <Button
        type='primary'
        size='small'
        disabled={
          selectedFixtureRows.length === 0 ||
          !selectedFixtureRows.every(selectableFixtureRow) ||
          currentStage === 'category'
        }
        onClick={() => selectedFixtureRows[0] && openAction(selectedFixtureRows[0])}
      >
        {t('common.assistantSurface.regionalApproval.footer.submit')}
      </Button>
    </>
  );

  return (
    <main
      className={styles.root}
      aria-label={t('common.assistantSurface.regionalApproval.ariaLabel')}
      data-testid='regional-approval-workbench'
    >
      <header className={styles.header}>
        <div className={styles.titleLine}>
          <Typography.Title heading={5}>{t('common.assistantSurface.regionalApproval.title')}</Typography.Title>
          {!liveQuery.enabled ? (
            <Tag className={styles.fixtureTag} color='red'>
              {t('common.assistantSurface.regionalApproval.fixtureTag')}
            </Tag>
          ) : null}
          {!liveQuery.enabled ? (
            <Tag color='orange'>{t('common.assistantSurface.regionalApproval.query.fixtureCapabilitiesTag')}</Tag>
          ) : null}
        </div>
        <div className={styles.scope} aria-label={t('common.assistantSurface.regionalApproval.scopeAria')}>
          <div
            className={styles.versionControls}
            aria-label={t('common.assistantSurface.regionalApproval.versions.group')}
            data-testid='regional-approval-version-controls'
          >
            <span className={styles.versionField}>
              <small>{t('common.assistantSurface.regionalApproval.versions.primaryCompact')}</small>
              {liveQuery.enabled ? (
                <Select
                  size='small'
                  value={livePrimaryVersionId}
                  aria-label={t('common.assistantSurface.regionalApproval.versions.primary')}
                  placeholder={t('common.assistantSurface.regionalApproval.versions.unavailable')}
                  disabled={liveVersionsLoading || liveVersions.length === 0}
                  onChange={(value) => changeLivePrimaryVersion(String(value))}
                >
                  {liveVersions.map((version) => (
                    <Select.Option key={version.id} value={version.id}>
                      {liveVersionLabel(version.id)}
                    </Select.Option>
                  ))}
                </Select>
              ) : (
                <Select
                  size='small'
                  value={primaryVersion}
                  aria-label={t('common.assistantSurface.regionalApproval.versions.primary')}
                  onChange={(value) => changePrimaryVersion(value as ApprovalVersion)}
                >
                  {APPROVAL_VERSIONS.map((version) => (
                    <Select.Option key={version} value={version}>
                      {versionLabel(version)}
                    </Select.Option>
                  ))}
                </Select>
              )}
            </span>
            <span className={styles.versionField}>
              <small>{t('common.assistantSurface.regionalApproval.versions.compareCompact')}</small>
              {liveQuery.enabled ? (
                <Select
                  size='small'
                  value={liveCompareVersionId}
                  aria-label={t('common.assistantSurface.regionalApproval.versions.compare')}
                  placeholder={t('common.assistantSurface.regionalApproval.versions.unavailable')}
                  disabled={liveVersionsLoading || liveVersions.length === 0}
                  onChange={(value) => changeLiveCompareVersion(String(value))}
                >
                  {liveVersions.map((version) => (
                    <Select.Option key={version.id} value={version.id}>
                      {liveVersionLabel(version.id)}
                    </Select.Option>
                  ))}
                </Select>
              ) : (
                <Select
                  size='small'
                  value={compareVersion}
                  aria-label={t('common.assistantSurface.regionalApproval.versions.compare')}
                  onChange={(value) => changeCompareVersion(value as ApprovalVersion)}
                >
                  {APPROVAL_VERSIONS.map((version) => (
                    <Select.Option key={version} value={version}>
                      {versionLabel(version)}
                    </Select.Option>
                  ))}
                </Select>
              )}
            </span>
            <Tooltip content={t('common.assistantSurface.regionalApproval.versions.description')}>
              <Button
                className={styles.versionInfo}
                type='text'
                size='mini'
                aria-label={t('common.assistantSurface.regionalApproval.versions.info')}
                icon={<Info size={14} />}
              />
            </Tooltip>
          </div>
          <span>
            <small>{t('common.assistantSurface.regionalApproval.planMonth')}</small>
            {liveQuery.enabled ? (
              <Spin loading={liveQuery.periodsState.status === 'loading' && liveQuery.periods.length === 0} size={14}>
                <Select
                  size='small'
                  value={liveQuery.selectedPeriod?.periodId}
                  aria-label={t('common.assistantSurface.regionalApproval.query.periodSelect')}
                  placeholder={t('common.assistantSurface.regionalApproval.query.noPeriod')}
                  onChange={(periodId) => {
                    setSelectedRowIds([]);
                    setPage(1);
                    liveQuery.selectPeriod(periodId);
                  }}
                  disabled={liveQuery.periods.length === 0}
                >
                  {liveQuery.periods.map((period) => (
                    <Select.Option key={period.periodId} value={period.periodId}>
                      {period.periodMonth}
                    </Select.Option>
                  ))}
                </Select>
              </Spin>
            ) : (
              <Select size='small' value='2026-09' aria-label={t('common.assistantSurface.regionalApproval.planMonth')}>
                <Select.Option value='2026-09'>
                  {t('common.assistantSurface.regionalApproval.planMonthValue')}
                </Select.Option>
              </Select>
            )}
          </span>
        </div>
      </header>

      <div className={styles.stageViewport}>
        <nav
          className={styles.stageLane}
          data-live-status={liveQuery.enabled}
          aria-label={t('common.assistantSurface.regionalApproval.stageLane')}
        >
          {APPROVAL_STAGE_FIXTURES.map((stage, index) => {
            const state = liveQuery.enabled
              ? liveQuery.progressState.status !== 'success'
                ? 'unavailable'
                : stage.id !== 'category' &&
                    (liveQuery.progressState.statusTotals?.[SALES_PLAN_STATUS_BY_STAGE[stage.id] + 5] ?? 0) > 0
                  ? 'critical'
                  : liveStageProgress[stage.id] === 100
                    ? 'completed'
                    : 'partial'
              : index < currentStageIndex
                ? 'completed'
                : index === currentStageIndex
                  ? 'current'
                  : 'available';
            return (
              <React.Fragment key={stage.id}>
                <Button
                  type='text'
                  className={styles.stageButton}
                  data-state={state}
                  data-selected={liveQuery.enabled && liveStageFilter === stage.id}
                  data-testid={`regional-approval-stage-${stage.id}`}
                  aria-current={!liveQuery.enabled && stage.id === displayStage ? 'step' : undefined}
                  aria-pressed={liveQuery.enabled ? liveStageFilter === stage.id : undefined}
                  disabled={liveQuery.enabled && liveQuery.progressState.status !== 'success'}
                  onClick={() => changeStage(stage.id)}
                >
                  <span className={styles.stageMarker}>
                    {state === 'completed' ? <CheckOne size={14} /> : index + 1}
                  </span>
                  <span className={styles.stageCopy}>
                    <strong>{t(stageLabelKey(stage.id))}</strong>
                    <small>
                      {t('common.assistantSurface.regionalApproval.stageProgress', {
                        progress: liveQuery.enabled ? liveStageProgress[stage.id] : stage.progress,
                      })}
                    </small>
                  </span>
                </Button>
                {!liveQuery.enabled && index < APPROVAL_STAGE_FIXTURES.length - 1 ? (
                  <span className={styles.stageConnector} data-state={state} aria-hidden='true' />
                ) : null}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <div className={styles.content}>
        {liveQuery.enabled && liveQuery.periodsState.status === 'error' ? (
          <Alert
            className={styles.queryAlert}
            type='error'
            showIcon
            title={t('common.assistantSurface.regionalApproval.query.periodErrorTitle')}
            content={t(queryErrorKey(liveQuery.periodsState.error))}
            action={
              <Button size='small' onClick={liveQuery.retryPeriods}>
                {t('common.assistantSurface.regionalApproval.query.retry')}
              </Button>
            }
          />
        ) : null}
        {liveQuery.enabled && liveQuery.periodsState.status === 'success' && liveQuery.periods.length === 0 ? (
          <Alert
            className={styles.queryAlert}
            type='info'
            showIcon
            title={t('common.assistantSurface.regionalApproval.query.noPeriod')}
            content={t('common.assistantSurface.regionalApproval.query.noPeriodDescription')}
          />
        ) : null}
        <section className={styles.queue} aria-label={t('common.assistantSurface.regionalApproval.queue.ariaLabel')}>
          <header className={styles.queueHeader}>
            <div>
              <h2>{t('common.assistantSurface.regionalApproval.queue.title')}</h2>
              <Typography.Text type='secondary'>
                {t('common.assistantSurface.regionalApproval.queue.counts', {
                  count: metrics.visibleCount,
                  pending: metrics.pendingCount,
                })}
              </Typography.Text>
            </div>
            <div
              className={styles.queueMetrics}
              role='region'
              aria-label={t('common.assistantSurface.regionalApproval.scopeTotals.title')}
            >
              {(['targetQuantity', 'targetAmount', 'quantity', 'amount'] as const).map((field) => (
                <span key={field}>
                  <small>{t(`common.assistantSurface.regionalApproval.scopeTotals.${field}`)}</small>
                  <strong>
                    {(liveQuery.enabled && scopeSummary.status !== 'success') || metrics[field] === undefined
                      ? '—'
                      : field === 'amount' || field === 'targetAmount'
                        ? exactMoney(metrics[field]!)
                        : formatExactDecimal(metrics[field]!)}
                  </strong>
                </span>
              ))}
              {liveQuery.enabled && scopeSummary.status === 'loading' ? <Spin size={14} /> : null}
              {historicalSummaryUnavailable ? (
                <small>{t('common.assistantSurface.regionalApproval.scopeTotals.historicalUnavailable')}</small>
              ) : liveQuery.enabled && scopeSummary.status === 'error' ? (
                <Button size='mini' onClick={refreshLiveAuthority}>
                  {t('common.assistantSurface.regionalApproval.scopeTotals.retry')}
                </Button>
              ) : null}
            </div>
            <div className={styles.controlToolbar}>
              <div className={styles.dimensionControls}>
                <label className={styles.categorySwitch}>
                  <Switch
                    size='small'
                    checked={categoryComparison}
                    aria-label={t('common.assistantSurface.regionalApproval.categoryComparison')}
                    onChange={setCategoryComparison}
                  />
                  <span>{t('common.assistantSurface.regionalApproval.categoryComparison')}</span>
                </label>
                <div
                  className={styles.dimensionTabs}
                  role='tablist'
                  aria-label={t('common.assistantSurface.regionalApproval.dimensions.ariaLabel')}
                >
                  {availableDimensions.map((candidate) => (
                    <Button
                      key={candidate}
                      size='small'
                      type='text'
                      role='tab'
                      aria-selected={candidate === dimension}
                      data-active={candidate === dimension}
                      onClick={() => {
                        setSelectedRowIds([]);
                        setLiveAuthorityContext(undefined);
                        setDimension(candidate);
                      }}
                    >
                      {t(`common.assistantSurface.regionalApproval.dimensions.${candidate}`)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className={styles.toolbarActions} data-testid='regional-approval-toolbar-actions'>
                <Button size='small' onClick={() => setProgressOpen(true)}>
                  {t('common.assistantSurface.regionalApproval.toolbar.progress')}
                </Button>
                {liveQuery.enabled ? (
                  <Button
                    size='small'
                    icon={<Refresh size={14} />}
                    loading={liveQuery.refreshing}
                    loadingFixedWidth
                    disabled={liveQuery.refreshing}
                    onClick={() => {
                      setPermissionDeniedVersions(new Set());
                      liveAccess.refresh();
                      liveQuery.refresh();
                    }}
                  >
                    {t('common.assistantSurface.regionalApproval.toolbar.refreshData')}
                  </Button>
                ) : null}
                <Button
                  size='small'
                  icon={<Download size={14} />}
                  disabled={liveQuery.enabled && liveQuery.queueState.status !== 'success'}
                  onClick={() => void exportQueue()}
                >
                  {t(
                    liveQuery.enabled
                      ? 'common.assistantSurface.regionalApproval.toolbar.exportPage'
                      : 'common.assistantSurface.regionalApproval.toolbar.export'
                  )}
                </Button>
                <div className={styles.approvalToolbarActions}>{approvalActionButtons}</div>
              </div>
            </div>
          </header>
          <section
            className={styles.controls}
            aria-label={t('common.assistantSurface.regionalApproval.filters.ariaLabel')}
          >
            <Button
              className={styles.advancedToggle}
              size='small'
              aria-label={t('common.assistantSurface.regionalApproval.filters.toggle')}
              aria-controls={filterPanelId}
              aria-expanded={narrowFiltersExpanded}
              onClick={() => setNarrowFiltersExpanded((expanded) => !expanded)}
            >
              {t(
                narrowFiltersExpanded
                  ? 'common.assistantSurface.regionalApproval.filters.collapse'
                  : 'common.assistantSurface.regionalApproval.filters.expand'
              )}
              {(liveQuery.enabled ? liveFiltersDirty : filtersDirty)
                ? ` · ${t('common.assistantSurface.regionalApproval.filters.dirty')}`
                : ''}
            </Button>
            <div id={filterPanelId} className={styles.advancedControls} data-expanded={narrowFiltersExpanded}>
              <div className={styles.filterHeading}>
                <strong>{t('common.assistantSurface.regionalApproval.filters.title')}</strong>
                {!liveQuery.enabled ? (
                  <Tag color='orange'>{t('common.assistantSurface.regionalApproval.query.fixtureScopeTag')}</Tag>
                ) : null}
                <Tag color={(liveQuery.enabled ? liveFiltersDirty : filtersDirty) ? 'orange' : 'green'}>
                  {t(
                    (liveQuery.enabled ? liveFiltersDirty : filtersDirty)
                      ? 'common.assistantSurface.regionalApproval.filters.dirty'
                      : 'common.assistantSurface.regionalApproval.filters.applied'
                  )}
                </Tag>
              </div>
              <div className={`${styles.filterRow} ${liveQuery.enabled ? styles.liveFilterRow : ''}`}>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.area')}</span>
                  <Select
                    size='small'
                    value={liveQuery.enabled ? draftLiveFilters.areaCode : draftFilters.area}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.area')}
                    onChange={(value) =>
                      liveQuery.enabled ? updateLiveDraftFilter('areaCode', value) : updateDraftFilter('area', value)
                    }
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allAreas')}
                    </Select.Option>
                    {liveQuery.enabled
                      ? liveFilterOptions.areas.map((option) => (
                          <Select.Option key={option.value} value={option.value}>
                            {option.label ?? option.value}
                          </Select.Option>
                        ))
                      : filterOptions.area.map((value) => (
                          <Select.Option key={value} value={value}>
                            {t(areaLabelKey(value as RegionalApprovalRow['areaKey']))}
                          </Select.Option>
                        ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.branch')}</span>
                  <Select
                    size='small'
                    value={liveQuery.enabled ? draftLiveFilters.provinceCode : draftFilters.branch}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.branch')}
                    onChange={(value) =>
                      liveQuery.enabled
                        ? updateLiveDraftFilter('provinceCode', value)
                        : updateDraftFilter('branch', value)
                    }
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allBranches')}
                    </Select.Option>
                    {liveQuery.enabled
                      ? liveFilterOptions.provinces.map((option) => (
                          <Select.Option key={option.value} value={option.value}>
                            {option.label ?? option.value}
                          </Select.Option>
                        ))
                      : filterOptions.branch.map((value) => (
                          <Select.Option key={value} value={value}>
                            {t(branchLabelKey(value as RegionalApprovalRow['branchKey']))}
                          </Select.Option>
                        ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.department')}</span>
                  <Select
                    size='small'
                    value={liveQuery.enabled ? draftLiveFilters.orgCode : draftFilters.department}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.department')}
                    onChange={(value) =>
                      liveQuery.enabled
                        ? updateLiveDraftFilter('orgCode', value)
                        : updateDraftFilter('department', value)
                    }
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allDepartments')}
                    </Select.Option>
                    {liveQuery.enabled
                      ? liveFilterOptions.organizations.map((option) => (
                          <Select.Option key={option.value} value={option.value}>
                            {option.label ?? option.value}
                          </Select.Option>
                        ))
                      : filterOptions.department.map((value) => (
                          <Select.Option key={value} value={value}>
                            {t(departmentLabelKey(value as RegionalApprovalRow['departmentKey']))}
                          </Select.Option>
                        ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.customer')}</span>
                  <Select
                    size='small'
                    value={liveQuery.enabled ? draftLiveFilters.dealerCode : draftFilters.customer}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.customer')}
                    onChange={(value) =>
                      liveQuery.enabled
                        ? updateLiveDraftFilter('dealerCode', value)
                        : updateDraftFilter('customer', value)
                    }
                    showSearch
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allCustomers')}
                    </Select.Option>
                    {liveQuery.enabled
                      ? liveFilterOptions.customers.map((option) => (
                          <Select.Option key={option.dealerCode} value={option.dealerCode}>
                            {option.dealerName ?? option.dealerCode}
                            {option.baseName ? ` · ${option.baseName}` : ''}
                          </Select.Option>
                        ))
                      : filterOptions.customer.map((value) => (
                          <Select.Option key={value} value={value}>
                            {REGIONAL_APPROVAL_ROWS.find((row) => row.customerKey === value)?.customerCode} ·{' '}
                            {t(customerLabelKey(value as RegionalApprovalRow['customerKey']))}
                          </Select.Option>
                        ))}
                  </Select>
                </div>
                <div className={styles.fieldControl}>
                  <span>{t('common.assistantSurface.regionalApproval.filters.approval')}</span>
                  <Select
                    size='small'
                    value={liveQuery.enabled ? draftLiveFilters.status : draftFilters.approval}
                    aria-label={t('common.assistantSurface.regionalApproval.filters.approval')}
                    onChange={(value) =>
                      liveQuery.enabled ? updateLiveDraftFilter('status', value) : updateDraftFilter('approval', value)
                    }
                  >
                    <Select.Option value={ALL_ORGANIZATIONS}>
                      {t('common.assistantSurface.regionalApproval.filters.allApprovals')}
                    </Select.Option>
                    {liveQuery.enabled
                      ? Array.from({ length: 11 }, (_, index) => String(index)).map((value) => (
                          <Select.Option key={value} value={value}>
                            {t(`common.assistantSurface.regionalApproval.query.status.${value}`)}
                          </Select.Option>
                        ))
                      : filterOptions.approval.map((value) => (
                          <Select.Option key={value} value={value}>
                            {t(`common.assistantSurface.regionalApproval.status.${value}`)}
                          </Select.Option>
                        ))}
                  </Select>
                </div>
                {!liveQuery.enabled ? (
                  <div className={styles.fieldControl}>
                    <span>{t('common.assistantSurface.regionalApproval.filters.health')}</span>
                    <Select
                      size='small'
                      value={draftFilters.health}
                      aria-label={t('common.assistantSurface.regionalApproval.filters.health')}
                      onChange={(value) => updateDraftFilter('health', value)}
                    >
                      <Select.Option value={ALL_ORGANIZATIONS}>
                        {t('common.assistantSurface.regionalApproval.filters.allHealth')}
                      </Select.Option>
                      {filterOptions.health.map((value) => (
                        <Select.Option key={value} value={value}>
                          {t(`common.assistantSurface.regionalApproval.health.${value}`)}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div className={styles.filterActions}>
                  <Button
                    size='small'
                    onClick={applyFilters}
                    disabled={liveQuery.enabled ? !liveFiltersDirty : !filtersDirty}
                  >
                    {t('common.assistantSurface.regionalApproval.filters.query')}
                  </Button>
                  <Button size='small' icon={<Refresh size={14} />} onClick={resetFilters}>
                    {t('common.assistantSurface.regionalApproval.filters.reset')}
                  </Button>
                </div>
              </div>
            </div>
            {exportFeedback ? (
              <Alert
                className={styles.exportFeedback}
                type={exportFeedback.type}
                content={exportFeedback.message}
                closable
                onClose={() => setExportFeedback(undefined)}
              />
            ) : null}
          </section>
          <div className={styles.tableViewport}>
            {liveQuery.enabled ? (
              <Spin loading={liveQuery.queueState.status === 'loading'} className={styles.querySpin}>
                {liveQuery.queueState.status === 'error' ? (
                  <Alert
                    className={styles.queryAlert}
                    type='error'
                    showIcon
                    title={t('common.assistantSurface.regionalApproval.query.queueErrorTitle')}
                    content={t(queryErrorKey(liveQuery.queueState.error))}
                    action={
                      <Button size='small' onClick={refreshLiveAuthority}>
                        {t('common.assistantSurface.regionalApproval.query.retry')}
                      </Button>
                    }
                  />
                ) : null}
                {liveQuery.queueState.status === 'success' && liveRows.length === 0 ? (
                  <Empty
                    description={
                      <div>
                        <strong>{t('common.assistantSurface.regionalApproval.query.emptyQueue')}</strong>
                        <br />
                        <small>{t('common.assistantSurface.regionalApproval.query.emptyQueueHint')}</small>
                      </div>
                    }
                  />
                ) : (
                  <Table
                    rowKey='tableRowId'
                    columns={liveColumns}
                    data={liveTableRows}
                    loading={liveCategoriesLoading}
                    rowClassName={(row) => (row.kind === 'category' ? styles.categoryComparisonRow : '')}
                    rowSelection={{
                      type: 'checkbox',
                      checkAll: false,
                      selectedRowKeys: selectedRowIds,
                      onChange: (keys) => setSelectedRowIds(keys.map(String).slice(-1)),
                      checkboxProps: (row) => (row.kind === 'category' ? { disabled: true } : { disabled: false }),
                    }}
                    pagination={false}
                    size='small'
                    scroll={{ x: categoryComparison ? 835 : 660 }}
                  />
                )}
              </Spin>
            ) : (
              <Table
                rowKey='id'
                columns={columns}
                data={pageData.rows}
                rowSelection={{
                  selectedRowKeys: selectedRowIds,
                  onChange: (keys) => setSelectedRowIds(keys.map(String)),
                }}
                pagination={false}
                size='small'
                scroll={{ x: 1360 }}
              />
            )}
          </div>
          <footer className={styles.queueFooter} data-testid='regional-approval-queue-footer'>
            <div className={styles.footerControls}>
              <div className={styles.pageSizeControl}>
                <span>{t('common.assistantSurface.regionalApproval.pagination.pageSize')}</span>
                <Select
                  size='small'
                  value={pageSize}
                  aria-label={t('common.assistantSurface.regionalApproval.pagination.pageSize')}
                  onChange={(value) => {
                    setPageSize(Number(value));
                    setPage(1);
                  }}
                >
                  {[10, 20, 50, 100].map((size) => (
                    <Select.Option key={size} value={size}>
                      {t('common.assistantSurface.regionalApproval.pagination.pageSizeValue', { count: size })}
                    </Select.Option>
                  ))}
                </Select>
              </div>
              <span>
                {t('common.assistantSurface.regionalApproval.pagination.total', {
                  count: liveQuery.enabled ? (liveQuery.queueState.data?.total ?? 0) : pageData.total,
                })}
              </span>
              <Pagination
                size='small'
                current={
                  liveQuery.enabled
                    ? liveQuery.queueState.status === 'loading'
                      ? page
                      : (liveQuery.queueState.data?.current ?? page)
                    : pageData.page
                }
                pageSize={liveQuery.enabled ? (liveQuery.queueState.data?.size ?? pageSize) : pageData.pageSize}
                total={liveQuery.enabled ? (liveQuery.queueState.data?.total ?? 0) : pageData.total}
                onChange={setPage}
              />
            </div>
          </footer>
        </section>
      </div>

      <Modal
        visible={progressOpen}
        title={t('common.assistantSurface.regionalApproval.progressDialog.title', {
          stage: liveQuery.enabled
            ? t('common.assistantSurface.regionalApproval.progressDialog.allStages')
            : t(stageLabelKey(currentStage)),
        })}
        footer={
          <Button onClick={() => setProgressOpen(false)}>
            {t('common.assistantSurface.regionalApproval.progressDialog.close')}
          </Button>
        }
        onCancel={() => setProgressOpen(false)}
        className={styles.progressModal}
      >
        <Typography.Paragraph type='secondary'>
          {liveQuery.enabled
            ? t('common.assistantSurface.regionalApproval.progressDialog.liveScope', {
                month: liveQuery.selectedPeriod?.periodMonth ?? '—',
                planType: liveQuery.selectedPeriod?.planType ?? '—',
                stage: t(`common.assistantSurface.regionalApproval.stages.${liveStageFilter ?? 'all'}`),
              })
            : t('common.assistantSurface.regionalApproval.progressDialog.description', {
                version: versionLabel(primaryVersion),
                count: metrics.visibleCount,
              })}
        </Typography.Paragraph>
        <div className={styles.progressList} data-testid='regional-approval-progress-results'>
          {liveQuery.enabled ? (
            <RegionalApprovalLiveProgress
              key={JSON.stringify([liveQuery.selectedPeriod?.periodId, liveQueryScope, liveStageFilter])}
              records={liveQuery.analysisRecords}
              status={liveQuery.analysisSummary.status}
              error={liveQuery.analysisSummary.error}
              t={t}
              onRetry={liveQuery.retryQueue}
            />
          ) : (
            visibleRows.map((row) => {
              const versionMetrics = metricsForApprovalVersion(row, primaryVersion);
              const progress = Math.round((row.quantityProgress + row.amountProgress) / 2);
              return (
                <div className={styles.progressRow} key={row.id}>
                  <span>
                    <strong>{t(organizationLabelKey(row.organizationKey))}</strong>
                    <small>
                      {number(versionMetrics.quantity)} · {money(versionMetrics.amount)}
                    </small>
                  </span>
                  <Progress percent={progress} size='small' />
                  <Tag color={approvalColors[row.approvalState]}>
                    {t(`common.assistantSurface.regionalApproval.status.${row.approvalState}`)}
                  </Tag>
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {activeDetailRow ? (
        <RegionalApprovalPlanDetail
          visible
          rows={visibleRows}
          row={activeDetailRow}
          approvalStage={currentStage}
          categoryComparison={categoryComparison}
          version={primaryVersion}
          store={detailStore}
          t={t}
          onStoreChange={setDetailStore}
          onClose={() => setDetailRowId(undefined)}
          onRowChange={setDetailRowId}
          onVersionChange={changePrimaryVersion}
        />
      ) : null}

      {activeLiveDetailRow ? (
        <RegionalApprovalLivePlanDetail
          visible
          rows={liveRows}
          row={activeLiveDetailRow}
          t={t}
          client={detailClient}
          initialTab={liveDetailInitialTab}
          initialFromVersionId={liveCompareVersionId}
          initialToVersionId={livePrimaryVersionId}
          onClose={() => setLiveDetailPlanId(undefined)}
          onRowChange={(planId) => {
            const row = liveRows.find((candidate) => candidate.planId === planId);
            if (row) selectLivePlanContext(row);
            setLiveDetailPlanId(planId);
          }}
          onCompareFromVersionChange={changeLiveCompareVersion}
          onCompareToVersionChange={changeLivePrimaryVersion}
        />
      ) : null}

      {activeLiveAdjustmentRow ? (
        <RegionalApprovalLiveAdjustmentDialog
          key={`${activeLiveAdjustmentRow.versionId}:${dimension}`}
          visible
          rows={liveRows}
          row={activeLiveAdjustmentRow}
          initialDimension={dimension}
          drafts={liveAdjustmentDrafts}
          t={t}
          client={detailClient}
          onDraftsChange={(recordIds, nextDrafts) => {
            const nextDraftById = Object.fromEntries(
              nextDrafts.map((draft) => [`${draft.versionId}:${draft.skuCode}`, draft])
            );
            setLiveAdjustmentDrafts((current) => ({
              ...Object.fromEntries(Object.entries(current).filter(([recordId]) => !recordIds.includes(recordId))),
              ...nextDraftById,
            }));
          }}
          onEdit={
            !liveActionDisabledReason(activeLiveAdjustmentRow, 'SAVE')
              ? () => {
                  setLiveActionKind('SAVE');
                  setLiveActionPlanId(activeLiveAdjustmentRow.planId);
                  setLiveAdjustmentPlanId(undefined);
                }
              : undefined
          }
          onClose={() => setLiveAdjustmentPlanId(undefined)}
        />
      ) : null}

      {activeLiveActionRow && liveActionsEnabled ? (
        <RegionalApprovalLiveActionDialog
          key={`${activeLiveActionRow.versionId}:${liveActionKind}`}
          visible
          row={activeLiveActionRow}
          approvalStage={
            (['customer', 'region', 'province', 'area', 'category'] as const)[
              (activeLiveActionRow.status === 10
                ? 5
                : (salesPlanApprovalNodeForStatus(activeLiveActionRow.status) ?? 1)) - 1
            ] ?? 'customer'
          }
          initialAction={liveActionKind}
          t={t}
          client={liveActionClient}
          evidence={liveAccess.entries[activeLiveActionRow.versionId]}
          onPermissionDenied={(versionId) => setPermissionDeniedVersions((current) => new Set(current).add(versionId))}
          permissionCodes={permissionCodes}
          readCurrentDetail={
            detailClient ? () => detailClient.detail.invoke({ planId: activeLiveActionRow.planId }) : undefined
          }
          initialDraft={
            localDrafts[activeLiveActionRow.versionId]?.status === activeLiveActionRow.status
              ? localDrafts[activeLiveActionRow.versionId]
              : undefined
          }
          onSaveDraft={(draft) => {
            persistLocalDrafts({ ...readSalesPlanLocalDrafts(draftStorageScope), [draft.versionId]: draft });
            setExportFeedback({
              type: 'success',
              message: t('common.assistantSurface.regionalApproval.detail.savedFeedback'),
            });
          }}
          onSucceeded={async (receipt) => {
            setLiveActionReceipts((current) => ({ ...current, [receipt.versionId]: receipt }));
            const remaining = { ...readSalesPlanLocalDrafts(draftStorageScope) };
            delete remaining[receipt.versionId];
            try {
              persistLocalDrafts(remaining);
            } catch {
              /* A confirmed approval must not become a retryable error. Stale drafts fail freshness validation. */
            }
            setLiveAuthorityContext(projectSalesPlanActionContext(activeLiveActionRow, receipt, contextFilterSummary));
            setSelectedRowIds([]);
            setLiveActionPlanId(undefined);
            refreshLiveAuthority();
          }}
          onRefresh={refreshLiveAuthority}
          onClose={() => setLiveActionPlanId(undefined)}
        />
      ) : null}

      {activeActionRow ? (
        <RegionalApprovalActionDialog
          visible
          rows={selectedFixtureRows.length > 0 ? selectedFixtureRows : [activeActionRow]}
          version={primaryVersion}
          approvalStage={currentStage}
          savedAdjustments={savedAdjustments}
          store={actionStore}
          t={t}
          executor={actionExecutor}
          onStoreChange={setActionStore}
          onClose={() => setActionRowId(undefined)}
        />
      ) : null}
    </main>
  );
};

export default RegionalApprovalWorkbench;
