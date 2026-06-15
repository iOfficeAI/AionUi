/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Empty, Input, Message, Modal, Select, Spin, Tag } from '@arco-design/web-react';
import { bridge } from '@office-ai/platform';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { isElectronDesktop } from '@renderer/utils/platform';

const MAX_RUNS = 16;

interface IBridgeResponse<D = unknown> {
  success: boolean;
  msg?: string;
  data?: D;
}

interface ICommandEveCommandCenterTraceCard {
  run_id: string;
  issue_id: string;
  agent: string;
  mode: string;
  source_event_id: string;
  redaction_level: string;
  trace_json: string | null;
  trace_markdown: string | null;
  prompt_result: string | null;
}

interface ICommandEveCommandCenterDecisionGate {
  level: string;
  state: string;
  source_event_id: string;
  source_event_type: string;
  release_authority: string;
  released_by: string;
  founder_prediction_confidence: number | null;
  decision_mode: string;
  decision: string;
  next_action: string;
  reason: string;
  routes_to_hg35: boolean;
  simulated: boolean;
  artifact_paths: string[];
}

interface ICommandEveCommandCenterRunCard {
  run_id: string;
  issue_id: string;
  parent_issue_id: string;
  agent: string;
  mode: string;
  role_owner: string;
  department: string;
  worker_state: string;
  controller_state: string;
  issue_state_recommendation: string;
  human_gate_state: string;
  human_gate_level: string;
  decision_gate: ICommandEveCommandCenterDecisionGate | null;
  merge_state: string;
  next_action: string;
  blocking_reasons: string[];
  event_count: number;
  first_event_at: string | null;
  last_event_at: string | null;
  last_event_id: string;
  source_event_ids: string[];
  artifact_paths: string[];
  trace_cards: ICommandEveCommandCenterTraceCard[];
}

interface ICommandEveCommandCenterReadModel {
  schema_version: string;
  generated_at: string;
  read_only: boolean;
  sources: {
    event_ledger: string;
    reducer: string;
  };
  morning_brief: {
    headline: string;
    totals: Record<string, number>;
    warnings: string[];
  };
  worker_runs: ICommandEveCommandCenterRunCard[];
  human_gate_queue: ICommandEveCommandCenterRunCard[];
  ceo_critical_releases: ICommandEveCommandCenterRunCard[];
  eve_hg35_packets: ICommandEveCommandCenterRunCard[];
  trace_summary_cards: ICommandEveCommandCenterTraceCard[];
  blocked_actions: string[];
}

interface ICommandEveCommandCenterReadModelResult {
  version: 'command-eve-command-center-read-model/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  message?: string;
  model?: ICommandEveCommandCenterReadModel;
  source: {
    company_os_root?: string;
    event_ledger?: string;
    reducer?: string;
    generated_by: 'company-os-read-model-cli';
  };
}

interface ICommandEveStatusSurface {
  schema_version: 'command-eve-status-surface/v0';
  generated_at: string;
  read_only: boolean;
  source_policy: string;
  status: 'READY' | 'CHECK' | 'BLOCK';
  status_label: string;
  empty_states: string[];
  sources: {
    read_model: string | null;
    event_ledger: string | null;
    readiness: string | null;
  };
  morning_brief: {
    headline: string;
    totals: Record<string, number>;
  };
  event_type_counts: Record<string, number>;
  hermes_status: {
    available: boolean;
    reason?: string;
  };
  readiness: {
    available: boolean;
    status: string;
    mode?: string;
    blocker_count: number | null;
    warning_count: number | null;
    warnings: string[];
  };
  blocked_actions: string[];
}

interface ICommandEveStatusSurfaceResult {
  version: 'command-eve-status-surface-bridge/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  message?: string;
  surface?: ICommandEveStatusSurface;
  source: {
    company_os_root?: string;
    event_ledger?: string;
    status_surface_cli?: string;
    generated_by: 'company-os-status-surface-cli';
  };
}

type IMarketingLaneKey = 'research' | 'draft' | 'assetGeneration' | 'review' | 'readyToApprove';
type IMarketingCardAction = 'comment' | 'block' | 'unblock' | 'complete';

interface ICommandEveMarketingCard {
  card_id: string;
  card_title: string;
  card_status: string;
  card_priority: number;
  card_assignee: string;
  lane_key: IMarketingLaneKey;
  created_at: number;
  updated_at: number | null;
  linked_run_id: string | null;
  linked_audit_event_id: string | null;
  governance_state: 'read_only' | 'proof_write_recorded' | 'unknown';
}

interface ICommandEveMarketingColumn {
  key: IMarketingLaneKey;
  cards: ICommandEveMarketingCard[];
}

interface ICommandEveMarketingBoardModel {
  schema_version: 'command-eve-kanban-marketing-board/v0';
  generated_at: string;
  board: {
    slug: string;
    db_path: string;
    db_exists: boolean;
    table_count: number;
  };
  policy: {
    dispatcher_enabled: false;
    auto_decompose_enabled: false;
    card_mutation_requires_humangate: 'HG-2.5';
    delete_allowed: false;
    assign_dispatch_allowed: false;
  };
  summary: {
    total_cards: number;
    audit_linked_cards: number;
  };
  columns: ICommandEveMarketingColumn[];
  warnings: string[];
}

interface ICommandEveMarketingBoardResult {
  version: 'command-eve-kanban-marketing-board/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  message?: string;
  model?: ICommandEveMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
}

interface ICommandEveMarketingProofCardResult {
  version: 'command-eve-kanban-marketing-proof-card/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  message?: string;
  card_id?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: ICommandEveMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
}

interface ICommandEveMarketingCardCreateRequest {
  title: string;
  description?: string;
  lane_key: IMarketingLaneKey;
  client_token: string;
  boardSlug?: string;
  eventLedgerPath?: string;
}

interface ICommandEveMarketingCardCreateResult {
  version: 'command-eve-kanban-marketing-card-create/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  message?: string;
  card_id?: string;
  lane_key?: IMarketingLaneKey;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: ICommandEveMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
}

interface ICommandEveMarketingCardMoveRequest {
  task_id: string;
  to_lane_key: IMarketingLaneKey;
  boardSlug?: string;
  eventLedgerPath?: string;
}

interface ICommandEveMarketingCardMoveResult {
  version: 'command-eve-kanban-marketing-card-move/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  message?: string;
  card_id?: string;
  from_lane_key?: IMarketingLaneKey;
  to_lane_key?: IMarketingLaneKey;
  moved?: boolean;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: ICommandEveMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
}

interface ICommandEveMarketingCardActionRequest {
  task_id: string;
  action: IMarketingCardAction;
  comment?: string;
  boardSlug?: string;
  eventLedgerPath?: string;
}

interface ICommandEveMarketingCardActionResult {
  version: 'command-eve-kanban-marketing-card-action/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  message?: string;
  card_id?: string;
  action?: IMarketingCardAction;
  action_applied?: boolean;
  from_status?: string;
  to_status?: string;
  from_lane_key?: IMarketingLaneKey;
  to_lane_key?: IMarketingLaneKey;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: ICommandEveMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
}

interface ICommandEveMarketingDispatchPlanRequest {
  task_id: string;
  command?: 'decompose' | 'specify';
  boardSlug?: string;
  eventLedgerPath?: string;
}

interface ICommandEveMarketingDispatchPlanResult {
  version: 'command-eve-kanban-marketing-dispatch-plan/v0';
  status: 'ready' | 'blocked' | 'failed';
  ok: boolean;
  reason_code?: string;
  reason_codes: string[];
  message?: string;
  card_id?: string;
  command?: 'decompose' | 'specify';
  subprocess_spawned: boolean;
  data_boundary_checked: boolean;
  controller_approval_required?: boolean;
  release_blocked?: boolean;
  human_gate?: 'HG-2.5';
  audit_event_id?: string;
  audit_event_path?: string;
  dispatch_plan?: Record<string, unknown>;
  dispatch_handoff_packet?: Record<string, unknown>;
  dispatch_source?: string;
  dispatch_source_reason?: string;
  policy?: Record<string, unknown>;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
    company_os_root?: string;
  };
}

interface ICommandEveCrmOverlayPolicy {
  local_only: true;
  plane_sync_enabled: false;
  hosted_sync_enabled: false;
  bulk_import_enabled: false;
  enrichment_enabled: false;
  outreach_enabled: false;
  crm_data_class_default: 'S2';
  customer_write_requires_humangate: 'HG-4';
  deal_action_ceiling_without_consent: 'draft-only';
}

interface ICommandEveCrmOverlayCounts {
  companies: number;
  contacts: number;
  deals: number;
  audit_events: number;
}

interface ICommandEveCrmOverlayDeal {
  deal_id: string;
  company_id: string;
  stage: string;
  allowed_actions: string;
  consent_status: string;
  human_gate: string;
  data_class: string;
  last_activity_at: string;
}

interface ICommandEveCrmOverlayModel {
  schema_version: 'command-eve-crm-overlay/v0';
  generated_at: string;
  initialized: boolean;
  db_path: string;
  event_ledger_path: string;
  policy: ICommandEveCrmOverlayPolicy;
  counts: ICommandEveCrmOverlayCounts;
  recent_deals: ICommandEveCrmOverlayDeal[];
  warnings: string[];
}

interface ICommandEveCrmOverlayResult {
  version: 'command-eve-crm-overlay/v0';
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  model?: ICommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
}

interface ICommandEveCrmOverlayInitializeResult {
  version: 'command-eve-crm-overlay-initialize/v0';
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  model?: ICommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
}

interface ICommandEveCrmDraftCreateResult {
  version: 'command-eve-crm-draft-create/v0';
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  company_id?: string;
  contact_id?: string;
  deal_id?: string;
  model?: ICommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
}

interface ICommandEveCrmStageLocalResult {
  version: 'command-eve-crm-stage-local/v0';
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  deal_id?: string;
  previous_stage?: string;
  stage?: string;
  model?: ICommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
}

interface ICommandEveCrmConsentLocalResult {
  version: 'command-eve-crm-consent-local/v0';
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  audit_event_id?: string;
  audit_event_path?: string;
  deal_id?: string;
  consent_status?: string;
  allowed_actions?: string;
  model?: ICommandEveCrmOverlayModel;
  source: {
    generated_by: 'command-eve-crm-overlay-core';
    hermes_home: string;
  };
}

// Shared board-carrying shape between the create and move mutation results, used
// to re-render the read-only board projection after a successful mutation.
interface IMarketingMutationBoardCarrier {
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  model?: ICommandEveMarketingBoardModel;
  source: {
    generated_by: 'command-eve-kanban-marketing-board-core';
    hermes_home: string;
  };
}

const commandCenterReadModel = bridge.buildProvider<
  IBridgeResponse<ICommandEveCommandCenterReadModelResult>,
  { maxRuns?: number } | undefined
>('command-eve.command-center-read-model');

const commandEveStatusSurface = bridge.buildProvider<
  IBridgeResponse<ICommandEveStatusSurfaceResult>,
  { maxRuns?: number } | undefined
>('command-eve.status-surface');

const kanbanMarketingBoard = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingBoardResult>,
  { boardSlug?: string } | undefined
>('command-eve.kanban-marketing-board');

const kanbanMarketingProofCard = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingProofCardResult>,
  { boardSlug?: string } | undefined
>('command-eve.kanban-marketing-proof-card');

const kanbanMarketingCardCreate = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingCardCreateResult>,
  ICommandEveMarketingCardCreateRequest
>('command-eve.kanban-marketing-card-create');

const kanbanMarketingCardMove = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingCardMoveResult>,
  ICommandEveMarketingCardMoveRequest
>('command-eve.kanban-marketing-card-move');

const kanbanMarketingCardAction = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingCardActionResult>,
  ICommandEveMarketingCardActionRequest
>('command-eve.kanban-marketing-card-action');

const kanbanMarketingDispatchPlan = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingDispatchPlanResult>,
  ICommandEveMarketingDispatchPlanRequest
>('command-eve.kanban-marketing-dispatch-plan');

const crmOverlay = bridge.buildProvider<IBridgeResponse<ICommandEveCrmOverlayResult>, { eventLedgerPath?: string }>(
  'command-eve.crm-overlay'
);

const crmOverlayInitialize = bridge.buildProvider<
  IBridgeResponse<ICommandEveCrmOverlayInitializeResult>,
  { eventLedgerPath?: string }
>('command-eve.crm-overlay-initialize');

const crmDraftCreate = bridge.buildProvider<
  IBridgeResponse<ICommandEveCrmDraftCreateResult>,
  { eventLedgerPath?: string }
>('command-eve.crm-draft-create');

const crmStageLocal = bridge.buildProvider<
  IBridgeResponse<ICommandEveCrmStageLocalResult>,
  { dealId: string; targetStage: 'qualified'; eventLedgerPath?: string }
>('command-eve.crm-stage-local');

const crmConsentLocal = bridge.buildProvider<
  IBridgeResponse<ICommandEveCrmConsentLocalResult>,
  { dealId: string; eventLedgerPath?: string }
>('command-eve.crm-consent-local');

const MARKETING_LANE_ORDER: IMarketingLaneKey[] = ['research', 'draft', 'assetGeneration', 'review', 'readyToApprove'];

const MARKETING_BOARD_SLUG = 'marketing';

// Stable per-intent idempotency token so a card create dedupes on retry.
const generateClientToken = (): string => {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `cmd-eve-card-${cryptoApi.randomUUID()}`;
  }
  return `cmd-eve-card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const nextMarketingLane = (lane: IMarketingLaneKey): IMarketingLaneKey | null => {
  const index = MARKETING_LANE_ORDER.indexOf(lane);
  if (index < 0 || index >= MARKETING_LANE_ORDER.length - 1) return null;
  return MARKETING_LANE_ORDER[index + 1];
};

const textOrDash = (value?: string | null): string => {
  const text = String(value || '').trim();
  return text || '-';
};

const formatCount = (value: number | undefined): string => String(Number.isFinite(value) ? value : 0);

const firstReasonCode = (reasonCodes: string[] | undefined, fallback?: string): string =>
  reasonCodes && reasonCodes.length > 0 ? reasonCodes[0] : fallback || '-';

const recordStringField = (record: Record<string, unknown> | undefined, key: string): string => {
  const value = record?.[key];
  return typeof value === 'string' ? value.trim() : '';
};

const dispatchSourceForResult = (result: ICommandEveMarketingDispatchPlanResult): string =>
  textOrDash(
    result.dispatch_source ||
      recordStringField(result.policy, 'implementation') ||
      recordStringField(result.policy, 'dispatch_source') ||
      recordStringField(result.dispatch_plan, 'dispatch_source')
  );

const dispatchHandoffForResult = (
  result: ICommandEveMarketingDispatchPlanResult
): Record<string, unknown> | undefined => {
  if (result.dispatch_handoff_packet) return result.dispatch_handoff_packet;
  const embedded = result.dispatch_plan?.dispatch_handoff_packet;
  return embedded && typeof embedded === 'object' && !Array.isArray(embedded)
    ? embedded as Record<string, unknown>
    : undefined;
};

const stateColor = (state: string): 'blue' | 'green' | 'orange' | 'red' | 'gray' => {
  if (['reported', 'done', 'released', 'pass'].includes(state)) return 'green';
  if (['blocked', 'failed', 'rejected', 'timed_out', 'cancelled'].includes(state)) return 'red';
  if (['required', 'needs_audit', 'waiting_for_human'].includes(state)) return 'orange';
  if (['running', 'in_progress'].includes(state)) return 'blue';
  return 'gray';
};

const statusSurfaceColor = (status?: string): 'green' | 'orange' | 'red' | 'gray' => {
  if (status === 'READY') return 'green';
  if (status === 'CHECK') return 'orange';
  if (status === 'BLOCK') return 'red';
  return 'gray';
};

type BoardColumnKey = 'active' | 'humanGate' | 'blocked' | 'review';

type BoardColumn = {
  key: BoardColumnKey;
  runs: ICommandEveCommandCenterRunCard[];
};

const isBlockedRun = (run: ICommandEveCommandCenterRunCard): boolean =>
  run.blocking_reasons.length > 0 ||
  ['blocked', 'failed', 'rejected', 'timed_out', 'cancelled'].includes(run.worker_state) ||
  ['blocked', 'failed', 'rejected'].includes(run.controller_state) ||
  ['blocked', 'rejected'].includes(run.issue_state_recommendation);

const boardColumnForRun = (run: ICommandEveCommandCenterRunCard): BoardColumnKey => {
  if (isBlockedRun(run)) return 'blocked';
  if (run.human_gate_state === 'required' || run.issue_state_recommendation === 'needs_human') return 'humanGate';
  if (
    ['reported', 'needs_audit'].includes(run.worker_state) ||
    ['needs_audit', 'review'].includes(run.controller_state) ||
    ['needs_audit', 'review'].includes(run.issue_state_recommendation)
  ) {
    return 'review';
  }
  return 'active';
};

const buildBoardColumns = (runs: ICommandEveCommandCenterRunCard[]): BoardColumn[] => {
  const columns: Record<BoardColumnKey, ICommandEveCommandCenterRunCard[]> = {
    active: [],
    humanGate: [],
    blocked: [],
    review: [],
  };
  for (const run of runs) {
    columns[boardColumnForRun(run)].push(run);
  }
  return [
    { key: 'active', runs: columns.active },
    { key: 'humanGate', runs: columns.humanGate },
    { key: 'blocked', runs: columns.blocked },
    { key: 'review', runs: columns.review },
  ];
};

const Section: React.FC<{ title: string; count?: number; id?: string; testId?: string; children: React.ReactNode }> = ({
  title,
  count,
  id,
  testId,
  children,
}) => (
  <section
    id={id}
    data-testid={testId}
    className='flex flex-col gap-10px rounded-14px border border-solid border-[var(--color-border-2)] bg-fill-1 px-16px py-14px'
  >
    <div className='flex items-center justify-between gap-12px'>
      <h2 className='m-0 text-16px font-600 leading-24px text-t-primary'>{title}</h2>
      {typeof count === 'number' ? <Tag color='gray'>{formatCount(count)}</Tag> : null}
    </div>
    {children}
  </section>
);

type OperatingSurfaceStatus = 'ready' | 'check' | 'blocked';

type OperatingSurfaceCard = {
  key: 'marketing' | 'crm' | 'dispatch';
  titleKey: string;
  status: OperatingSurfaceStatus;
  metric: string;
  descriptionKey: string;
  anchorId: string;
  tags: string[];
};

type OperatingReadinessCheck = {
  key: 'marketingReceipts' | 'crmNl5Receipts' | 'dispatchBlocked' | 'workerAutonomyLocked';
  ok: boolean;
  status: OperatingSurfaceStatus;
  titleKey: string;
  descriptionKey: string;
  evidence: string;
};

const operatingSurfaceColor = (status: OperatingSurfaceStatus): 'green' | 'orange' | 'red' => {
  if (status === 'ready') return 'green';
  if (status === 'blocked') return 'red';
  return 'orange';
};

const scrollToSection = (anchorId: string): void => {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const OperatingSurfacesSection: React.FC<{
  marketingResult: ICommandEveMarketingBoardResult | null;
  crmResult: ICommandEveCrmOverlayResult | null;
  dispatchPlanResult: ICommandEveMarketingDispatchPlanResult | null;
}> = ({ marketingResult, crmResult, dispatchPlanResult }) => {
  const { t } = useTranslation();
  const marketingReady = marketingResult?.status === 'ready' && Boolean(marketingResult.model);
  const crmInitialized = crmResult?.status === 'ready' && crmResult.model?.initialized === true;
  const dispatchChecked = dispatchPlanResult?.data_boundary_checked === true;
  const dispatchBlockedBeforeSpawn = dispatchPlanResult?.subprocess_spawned === false;
  const cards: OperatingSurfaceCard[] = [
    {
      key: 'marketing',
      titleKey: 'commandCenter.operatingSurfaces.marketing.title',
      status: marketingReady ? 'ready' : marketingResult?.status === 'failed' ? 'blocked' : 'check',
      metric: formatCount(marketingResult?.model?.summary.total_cards),
      descriptionKey: 'commandCenter.operatingSurfaces.marketing.description',
      anchorId: 'command-eve-marketing-board',
      tags: ['HG-2.5', t('commandCenter.operatingSurfaces.tags.localReceipts')],
    },
    {
      key: 'crm',
      titleKey: 'commandCenter.operatingSurfaces.crm.title',
      status: crmInitialized ? 'ready' : crmResult?.status === 'failed' ? 'blocked' : 'check',
      metric: formatCount(crmResult?.model?.counts.deals),
      descriptionKey: 'commandCenter.operatingSurfaces.crm.description',
      anchorId: 'command-eve-crm-overlay',
      tags: ['HG-4', 'NL-5', t('commandCenter.operatingSurfaces.tags.localOnly')],
    },
    {
      key: 'dispatch',
      titleKey: 'commandCenter.operatingSurfaces.dispatch.title',
      status: dispatchChecked && dispatchBlockedBeforeSpawn ? 'ready' : dispatchPlanResult?.status === 'failed' ? 'blocked' : 'check',
      metric: dispatchChecked ? t('commandCenter.operatingSurfaces.dispatch.checked') : t('commandCenter.operatingSurfaces.dispatch.waiting'),
      descriptionKey: 'commandCenter.operatingSurfaces.dispatch.description',
      anchorId: 'command-eve-marketing-board',
      tags: ['NL-5', t('commandCenter.operatingSurfaces.tags.noAutoSpawn')],
    },
  ];
  return (
    <Section title={t('commandCenter.sections.operatingSurfaces')} testId='command-center-operating-surfaces'>
      <p className='m-0 text-12px leading-18px text-t-secondary'>
        {t('commandCenter.operatingSurfaces.description')}
      </p>
      <div className='grid gap-10px lg:grid-cols-3'>
        {cards.map((card) => (
          <article
            key={card.key}
            className='flex min-h-150px flex-col justify-between gap-12px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px'
            data-testid={`operating-surface-${card.key}`}
          >
            <div className='flex items-start justify-between gap-10px'>
              <div className='min-w-0'>
                <h3 className='m-0 text-14px font-700 leading-22px text-t-primary'>{t(card.titleKey)}</h3>
                <p className='m-0 mt-6px text-12px leading-18px text-t-secondary'>{t(card.descriptionKey)}</p>
              </div>
              <Tag color={operatingSurfaceColor(card.status)}>{t(`commandCenter.operatingSurfaces.status.${card.status}`)}</Tag>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-8px'>
              <div className='flex flex-wrap gap-6px'>
                {card.tags.map((tag) => (
                  <Tag key={`${card.key}-${tag}`} color='gray'>
                    {tag}
                  </Tag>
                ))}
              </div>
              <span className='text-13px font-700 leading-20px text-t-primary'>{card.metric}</span>
            </div>
            <Button shape='round' type='outline' onClick={() => scrollToSection(card.anchorId)}>
              {t('commandCenter.operatingSurfaces.open')}
            </Button>
          </article>
        ))}
      </div>
    </Section>
  );
};

const OperatingReadinessSection: React.FC<{
  marketingResult: ICommandEveMarketingBoardResult | null;
  crmResult: ICommandEveCrmOverlayResult | null;
  dispatchPlanResult: ICommandEveMarketingDispatchPlanResult | null;
  readModel: ICommandEveCommandCenterReadModel;
}> = ({ marketingResult, crmResult, dispatchPlanResult, readModel }) => {
  const { t } = useTranslation();
  const marketingCards = marketingResult?.model?.summary.total_cards ?? 0;
  const marketingAuditCards = marketingResult?.model?.summary.audit_linked_cards ?? 0;
  const crmAuditEvents = crmResult?.model?.counts.audit_events ?? 0;
  const dispatchChecked = dispatchPlanResult?.data_boundary_checked === true;
  const dispatchBlockedBeforeSpawn =
    dispatchChecked &&
    dispatchPlanResult?.subprocess_spawned === false &&
    dispatchPlanResult?.release_blocked !== false;
  const workerAutonomyLocked =
    readModel.blocked_actions.includes('worker_dispatch') ||
    Boolean(marketingResult?.model?.policy && marketingResult.model.policy.dispatcher_enabled === false);
  const checks: OperatingReadinessCheck[] = [
    {
      key: 'marketingReceipts',
      ok: marketingResult?.status === 'ready' && marketingAuditCards >= marketingCards,
      status:
        marketingResult?.status === 'failed'
          ? 'blocked'
          : marketingResult?.status === 'ready' && marketingAuditCards >= marketingCards
            ? 'ready'
            : 'check',
      titleKey: 'commandCenter.operatingReadiness.marketingReceipts.title',
      descriptionKey: 'commandCenter.operatingReadiness.marketingReceipts.description',
      evidence: `${formatCount(marketingAuditCards)} / ${formatCount(marketingCards)}`,
    },
    {
      key: 'crmNl5Receipts',
      ok: crmResult?.status === 'ready' && crmResult.model?.initialized === true && crmAuditEvents > 0,
      status:
        crmResult?.status === 'failed'
          ? 'blocked'
          : crmResult?.status === 'ready' && crmResult.model?.initialized === true && crmAuditEvents > 0
            ? 'ready'
            : 'check',
      titleKey: 'commandCenter.operatingReadiness.crmNl5Receipts.title',
      descriptionKey: 'commandCenter.operatingReadiness.crmNl5Receipts.description',
      evidence: formatCount(crmAuditEvents),
    },
    {
      key: 'dispatchBlocked',
      ok: dispatchBlockedBeforeSpawn,
      status: dispatchPlanResult?.status === 'failed' ? 'blocked' : dispatchBlockedBeforeSpawn ? 'ready' : 'check',
      titleKey: 'commandCenter.operatingReadiness.dispatchBlocked.title',
      descriptionKey: 'commandCenter.operatingReadiness.dispatchBlocked.description',
      evidence: dispatchChecked
        ? dispatchPlanResult?.reason_code || t('commandCenter.operatingReadiness.dispatchBlocked.checked')
        : t('commandCenter.operatingReadiness.dispatchBlocked.waiting'),
    },
    {
      key: 'workerAutonomyLocked',
      ok: workerAutonomyLocked,
      status: workerAutonomyLocked ? 'ready' : 'blocked',
      titleKey: 'commandCenter.operatingReadiness.workerAutonomyLocked.title',
      descriptionKey: 'commandCenter.operatingReadiness.workerAutonomyLocked.description',
      evidence: readModel.blocked_actions.includes('worker_dispatch')
        ? 'worker_dispatch'
        : marketingResult?.model?.policy.dispatcher_enabled === false
          ? 'dispatcher_enabled=false'
          : t('commandCenter.operatingReadiness.workerAutonomyLocked.missing'),
    },
  ];
  const readyCount = checks.filter((check) => check.ok).length;
  return (
    <Section title={t('commandCenter.sections.operatingReadiness')} testId='command-center-operating-readiness'>
      <div className='flex flex-wrap items-start justify-between gap-10px'>
        <p className='m-0 max-w-720px text-12px leading-18px text-t-secondary'>
          {t('commandCenter.operatingReadiness.description')}
        </p>
        <Tag color={readyCount === checks.length ? 'green' : 'orange'}>
          {`${formatCount(readyCount)} / ${formatCount(checks.length)}`}
        </Tag>
      </div>
      <div className='grid gap-10px md:grid-cols-2'>
        {checks.map((check) => (
          <article
            key={check.key}
            className='rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px'
            data-testid={`operating-readiness-${check.key}`}
          >
            <div className='flex items-start justify-between gap-10px'>
              <div className='min-w-0'>
                <h3 className='m-0 text-13px font-700 leading-20px text-t-primary'>{t(check.titleKey)}</h3>
                <p className='m-0 mt-4px text-12px leading-18px text-t-secondary'>{t(check.descriptionKey)}</p>
              </div>
              <Tag color={operatingSurfaceColor(check.status)}>
                {t(`commandCenter.operatingSurfaces.status.${check.status}`)}
              </Tag>
            </div>
            <div className='mt-10px truncate text-11px leading-16px text-t-tertiary'>{check.evidence}</div>
          </article>
        ))}
      </div>
    </Section>
  );
};

const BoardRunCard: React.FC<{ run: ICommandEveCommandCenterRunCard }> = ({ run }) => {
  const { t } = useTranslation();
  const state = textOrDash(run.worker_state);
  return (
    <article className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'>
      <div className='flex items-start justify-between gap-8px'>
        <div className='min-w-0'>
          <div className='truncate text-13px font-600 leading-20px text-t-primary'>
            {textOrDash(run.issue_id || run.run_id)}
          </div>
          <div className='mt-2px truncate text-11px leading-16px text-t-tertiary'>
            {textOrDash(run.department || run.role_owner || run.agent)}
          </div>
        </div>
        <Tag color={stateColor(state)}>{state}</Tag>
      </div>
      <div className='mt-8px grid grid-cols-2 gap-x-8px gap-y-4px text-11px leading-16px'>
        <span className='text-t-tertiary'>{t('commandCenter.labels.humanGate')}</span>
        <span className='truncate text-t-secondary'>{textOrDash(run.human_gate_level || run.human_gate_state)}</span>
        <span className='text-t-tertiary'>{t('commandCenter.labels.events')}</span>
        <span className='truncate text-t-secondary'>{formatCount(run.event_count)}</span>
      </div>
      {run.next_action ? (
        <p className='m-0 mt-8px line-clamp-3 text-11px leading-16px text-t-secondary'>{run.next_action}</p>
      ) : null}
    </article>
  );
};

const BoardColumnView: React.FC<{ column: BoardColumn }> = ({ column }) => {
  const { t } = useTranslation();
  return (
    <div className='flex min-h-180px flex-col gap-10px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-1 px-12px py-12px'>
      <div className='flex items-center justify-between gap-8px'>
        <h3 className='m-0 text-13px font-600 leading-20px text-t-primary'>
          {t(`commandCenter.board.columns.${column.key}`)}
        </h3>
        <Tag color='gray'>{formatCount(column.runs.length)}</Tag>
      </div>
      {column.runs.length > 0 ? (
        <div className='flex flex-col gap-8px'>
          {column.runs.map((run) => (
            <BoardRunCard key={`${column.key}-${run.run_id}`} run={run} />
          ))}
        </div>
      ) : (
        <div className='flex flex-1 items-center justify-center rounded-8px border border-dashed border-border-2 px-10px py-18px text-center text-12px leading-18px text-t-tertiary'>
          {t('commandCenter.board.empty')}
        </div>
      )}
    </div>
  );
};

const MarketingCardView: React.FC<{
  card: ICommandEveMarketingCard;
  movingCardId: string | null;
  dispatchingCardId: string | null;
  actioningCardId: string | null;
  onMoveNext: (card: ICommandEveMarketingCard, toLane: IMarketingLaneKey) => void;
  onPlanDispatch: (card: ICommandEveMarketingCard) => void;
  onOpenComment: (card: ICommandEveMarketingCard) => void;
  onApplyAction: (card: ICommandEveMarketingCard, action: Exclude<IMarketingCardAction, 'comment'>) => void;
}> = ({ card, movingCardId, dispatchingCardId, actioningCardId, onMoveNext, onPlanDispatch, onOpenComment, onApplyAction }) => {
  const { t } = useTranslation();
  const nextLane = nextMarketingLane(card.lane_key);
  const moving = movingCardId === card.card_id;
  const dispatching = dispatchingCardId === card.card_id;
  const actioning = actioningCardId === card.card_id;
  const blocked = card.card_status === 'blocked';
  const completed = card.card_status === 'completed';
  return (
    <article
      data-testid={`marketing-card-${card.card_id}`}
      className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'
    >
      <div className='flex items-start justify-between gap-8px'>
        <div className='min-w-0'>
          <div className='truncate text-13px font-600 leading-20px text-t-primary'>{textOrDash(card.card_title)}</div>
          <div className='mt-2px truncate text-11px leading-16px text-t-tertiary'>{textOrDash(card.card_id)}</div>
        </div>
        <Tag color={stateColor(card.card_status)}>{textOrDash(card.card_status)}</Tag>
      </div>
      <dl className='mt-8px grid grid-cols-2 gap-x-8px gap-y-4px text-11px leading-16px'>
        <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.labels.owner')}</dt>
        <dd className='m-0 truncate text-t-secondary'>{textOrDash(card.card_assignee)}</dd>
        <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.labels.audit')}</dt>
        <dd className='m-0 truncate text-t-secondary'>{textOrDash(card.linked_audit_event_id)}</dd>
      </dl>
      <div className='mt-8px flex flex-wrap items-center justify-end gap-6px'>
        <Button
          size='mini'
          shape='round'
          disabled={actioning}
          data-testid={`marketing-card-comment-${card.card_id}`}
          onClick={() => onOpenComment(card)}
        >
          {t('commandCenter.marketingBoard.actions.comment')}
        </Button>
        <Button
          size='mini'
          shape='round'
          loading={actioning && !blocked}
          disabled={actioning || blocked || completed}
          data-testid={`marketing-card-block-${card.card_id}`}
          onClick={() => onApplyAction(card, 'block')}
        >
          {t('commandCenter.marketingBoard.actions.block')}
        </Button>
        <Button
          size='mini'
          shape='round'
          loading={actioning && blocked}
          disabled={actioning || !blocked}
          data-testid={`marketing-card-unblock-${card.card_id}`}
          onClick={() => onApplyAction(card, 'unblock')}
        >
          {t('commandCenter.marketingBoard.actions.unblock')}
        </Button>
        <Button
          size='mini'
          shape='round'
          loading={actioning && !completed}
          disabled={actioning || completed}
          data-testid={`marketing-card-complete-${card.card_id}`}
          onClick={() => onApplyAction(card, 'complete')}
        >
          {t('commandCenter.marketingBoard.actions.complete')}
        </Button>
        <Button
          size='mini'
          shape='round'
          loading={dispatching}
          disabled={dispatching}
          data-testid={`marketing-card-dispatch-plan-${card.card_id}`}
          onClick={() => onPlanDispatch(card)}
        >
          {t('commandCenter.marketingBoard.actions.checkDispatch')}
        </Button>
        {nextLane ? (
          <Button
            size='mini'
            shape='round'
            loading={moving}
            disabled={moving}
            data-testid={`marketing-card-move-${card.card_id}`}
            onClick={() => onMoveNext(card, nextLane)}
          >
            {`${t('commandCenter.marketingBoard.actions.moveNext')} → ${t(
              `commandCenter.marketingBoard.columns.${nextLane}`
            )}`}
          </Button>
        ) : (
          <span className='text-11px leading-16px text-t-tertiary' data-testid={`marketing-card-final-${card.card_id}`}>
            {t('commandCenter.marketingBoard.actions.finalLane')}
          </span>
        )}
      </div>
    </article>
  );
};

const MarketingColumnView: React.FC<{
  column: ICommandEveMarketingColumn;
  movingCardId: string | null;
  dispatchingCardId: string | null;
  actioningCardId: string | null;
  onMoveNext: (card: ICommandEveMarketingCard, toLane: IMarketingLaneKey) => void;
  onPlanDispatch: (card: ICommandEveMarketingCard) => void;
  onOpenComment: (card: ICommandEveMarketingCard) => void;
  onApplyAction: (card: ICommandEveMarketingCard, action: Exclude<IMarketingCardAction, 'comment'>) => void;
}> = ({ column, movingCardId, dispatchingCardId, actioningCardId, onMoveNext, onPlanDispatch, onOpenComment, onApplyAction }) => {
  const { t } = useTranslation();
  return (
    <div
      data-testid={`marketing-lane-${column.key}`}
      className='flex min-h-180px flex-col gap-10px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-1 px-12px py-12px'
    >
      <div className='flex items-center justify-between gap-8px'>
        <h3 className='m-0 text-13px font-600 leading-20px text-t-primary'>
          {t(`commandCenter.marketingBoard.columns.${column.key}`)}
        </h3>
        <Tag color='gray'>{formatCount(column.cards.length)}</Tag>
      </div>
      {column.cards.length > 0 ? (
        <div className='flex flex-col gap-8px'>
          {column.cards.map((card) => (
            <MarketingCardView
              key={`${column.key}-${card.card_id}`}
              card={card}
              movingCardId={movingCardId}
              dispatchingCardId={dispatchingCardId}
              actioningCardId={actioningCardId}
              onMoveNext={onMoveNext}
              onPlanDispatch={onPlanDispatch}
              onOpenComment={onOpenComment}
              onApplyAction={onApplyAction}
            />
          ))}
        </div>
      ) : (
        <div className='flex flex-1 items-center justify-center rounded-8px border border-dashed border-border-2 px-10px py-18px text-center text-12px leading-18px text-t-tertiary'>
          {t('commandCenter.marketingBoard.emptyColumn')}
        </div>
      )}
    </div>
  );
};

const MarketingCardCreateModal: React.FC<{
  visible: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: { title: string; description: string; lane_key: IMarketingLaneKey }) => void;
}> = ({ visible, submitting, onCancel, onSubmit }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [laneKey, setLaneKey] = useState<IMarketingLaneKey>(MARKETING_LANE_ORDER[0]);
  const [titleError, setTitleError] = useState(false);

  // Reset the form whenever the modal is (re)opened so a new card starts clean.
  useEffect(() => {
    if (visible) {
      setTitle('');
      setDescription('');
      setLaneKey(MARKETING_LANE_ORDER[0]);
      setTitleError(false);
    }
  }, [visible]);

  const handleSubmit = (): void => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError(true);
      return;
    }
    onSubmit({ title: trimmed, description: description.trim(), lane_key: laneKey });
  };

  return (
    <Modal
      title={t('commandCenter.marketingBoard.create.title')}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      maskClosable={!submitting}
      escToExit={!submitting}
      unmountOnExit
    >
      <div className='flex flex-col gap-14px' data-testid='marketing-card-create-modal'>
        <div className='flex flex-col gap-6px'>
          <span className='text-12px leading-18px text-t-secondary'>
            {t('commandCenter.marketingBoard.create.titleLabel')}
          </span>
          <Input
            value={title}
            onChange={(value) => {
              setTitle(value);
              if (value.trim()) setTitleError(false);
            }}
            placeholder={t('commandCenter.marketingBoard.create.titlePlaceholder')}
            data-testid='marketing-card-create-title'
            status={titleError ? 'error' : undefined}
            disabled={submitting}
          />
          {titleError ? (
            <span className='text-11px leading-16px text-danger-6' data-testid='marketing-card-create-title-error'>
              {t('commandCenter.marketingBoard.create.titleRequired')}
            </span>
          ) : null}
        </div>

        <div className='flex flex-col gap-6px'>
          <span className='text-12px leading-18px text-t-secondary'>
            {t('commandCenter.marketingBoard.create.descriptionLabel')}
          </span>
          <Input.TextArea
            value={description}
            onChange={(value) => setDescription(value)}
            placeholder={t('commandCenter.marketingBoard.create.descriptionPlaceholder')}
            autoSize={{ minRows: 3, maxRows: 6 }}
            data-testid='marketing-card-create-description'
            disabled={submitting}
          />
        </div>

        <div className='flex flex-col gap-6px'>
          <span className='text-12px leading-18px text-t-secondary'>
            {t('commandCenter.marketingBoard.create.laneLabel')}
          </span>
          <Select
            value={laneKey}
            onChange={(value) => setLaneKey(value as IMarketingLaneKey)}
            data-testid='marketing-card-create-lane'
            disabled={submitting}
          >
            {MARKETING_LANE_ORDER.map((lane) => (
              <Select.Option key={lane} value={lane}>
                {t(`commandCenter.marketingBoard.columns.${lane}`)}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div className='flex items-center justify-end gap-8px'>
          <Button shape='round' onClick={onCancel} disabled={submitting} data-testid='marketing-card-create-cancel'>
            {t('common.cancel')}
          </Button>
          <Button
            shape='round'
            type='primary'
            loading={submitting}
            onClick={handleSubmit}
            data-testid='marketing-card-create-submit'
          >
            {t('commandCenter.marketingBoard.create.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const MarketingBoardSection: React.FC<{
  result: ICommandEveMarketingBoardResult | null;
  proofResult: ICommandEveMarketingProofCardResult | null;
  proofRunning: boolean;
  createResult: ICommandEveMarketingCardCreateResult | null;
  moveResult: ICommandEveMarketingCardMoveResult | null;
  actionResult: ICommandEveMarketingCardActionResult | null;
  dispatchPlanResult: ICommandEveMarketingDispatchPlanResult | null;
  createModalVisible: boolean;
  createSubmitting: boolean;
  movingCardId: string | null;
  actioningCardId: string | null;
  dispatchingCardId: string | null;
  onCreateProofCard: () => void;
  onOpenCreateModal: () => void;
  onCloseCreateModal: () => void;
  onSubmitCreateCard: (input: { title: string; description: string; lane_key: IMarketingLaneKey }) => void;
  onMoveCardNext: (card: ICommandEveMarketingCard, toLane: IMarketingLaneKey) => void;
  onOpenComment: (card: ICommandEveMarketingCard) => void;
  onApplyAction: (card: ICommandEveMarketingCard, action: Exclude<IMarketingCardAction, 'comment'>) => void;
  onPlanDispatch: (card: ICommandEveMarketingCard) => void;
}> = ({
  result,
  proofResult,
  proofRunning,
  createResult,
  moveResult,
  actionResult,
  dispatchPlanResult,
  createModalVisible,
  createSubmitting,
  movingCardId,
  actioningCardId,
  dispatchingCardId,
  onCreateProofCard,
  onOpenCreateModal,
  onCloseCreateModal,
  onSubmitCreateCard,
  onMoveCardNext,
  onOpenComment,
  onApplyAction,
  onPlanDispatch,
}) => {
  const { t } = useTranslation();
  const model = result?.model;
  const cardCount = model?.summary.total_cards ?? 0;
  const blocked = !result || result.status !== 'ready' || !model;
  return (
    <Section
      id='command-eve-marketing-board'
      testId='command-eve-marketing-board'
      title={t('commandCenter.sections.marketingBoard')}
      count={cardCount}
    >
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <p className='m-0 text-12px leading-18px text-t-secondary'>{t('commandCenter.marketingBoard.description')}</p>
        <div className='flex flex-wrap items-center gap-6px'>
          <Tag color='blue'>{t('commandCenter.marketingBoard.policy.readFirst')}</Tag>
          <Tag color='orange'>{t('commandCenter.marketingBoard.policy.humanGate')}</Tag>
          <Tag color='gray'>{t('commandCenter.marketingBoard.policy.noDispatcher')}</Tag>
        </div>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <span className='text-12px leading-18px text-t-tertiary'>{t('commandCenter.marketingBoard.create.note')}</span>
        <Button
          shape='round'
          type='primary'
          disabled={blocked}
          onClick={onOpenCreateModal}
          data-testid='marketing-card-create-open'
        >
          {t('commandCenter.marketingBoard.actions.createCard')}
        </Button>
      </div>

      {createResult ? (
        <Alert
          type={createResult.ok ? 'success' : 'warning'}
          title={createResult.reason_code || t('commandCenter.marketingBoard.create.resultTitle')}
          content={
            createResult.ok
              ? createResult.card_id || createResult.audit_event_path || '-'
              : createResult.message || createResult.reason_code || '-'
          }
        />
      ) : null}

      {moveResult ? (
        <Alert
          type={moveResult.ok ? 'success' : 'warning'}
          title={moveResult.reason_code || t('commandCenter.marketingBoard.move.resultTitle')}
          content={
            moveResult.ok
              ? `${textOrDash(moveResult.from_lane_key)} → ${textOrDash(moveResult.to_lane_key)}`
              : moveResult.message || moveResult.reason_code || '-'
          }
        />
      ) : null}

      {actionResult ? (
        <Alert
          type={actionResult.ok ? 'success' : actionResult.status === 'failed' ? 'error' : 'warning'}
          title={actionResult.reason_code || t('commandCenter.marketingBoard.action.resultTitle')}
          content={
            actionResult.ok
              ? `${textOrDash(actionResult.action)} · ${textOrDash(actionResult.audit_event_id)}`
              : actionResult.message || actionResult.reason_code || '-'
          }
          data-testid='marketing-card-action-result'
        />
      ) : null}

      {dispatchPlanResult ? (
        <Alert
          type={dispatchPlanResult.ok ? 'success' : dispatchPlanResult.status === 'failed' ? 'error' : 'warning'}
          title={dispatchPlanResult.reason_code || t('commandCenter.marketingBoard.dispatch.resultTitle')}
          content={
            <div className='flex flex-col gap-6px' data-testid='marketing-card-dispatch-plan-detail'>
              <span>{dispatchPlanResult.message || '-'}</span>
              <div className='flex flex-wrap gap-6px'>
                <Tag color={dispatchPlanResult.data_boundary_checked ? 'green' : 'orange'}>
                  {`${t('commandCenter.marketingBoard.dispatch.dataBoundary')}: ${
                    dispatchPlanResult.data_boundary_checked
                      ? t('commandCenter.marketingBoard.dispatch.checked')
                      : t('commandCenter.marketingBoard.dispatch.notChecked')
                  }`}
                </Tag>
                <Tag color={dispatchPlanResult.subprocess_spawned ? 'red' : 'green'}>
                  {`${t('commandCenter.marketingBoard.dispatch.subprocess')}: ${
                    dispatchPlanResult.subprocess_spawned
                      ? t('commandCenter.marketingBoard.dispatch.spawned')
                      : t('commandCenter.marketingBoard.dispatch.notSpawned')
                  }`}
                </Tag>
                <Tag color={dispatchPlanResult.controller_approval_required ? 'orange' : 'green'}>
                  <span data-testid='marketing-card-dispatch-controller-approval'>
                    {`${t('commandCenter.marketingBoard.dispatch.controllerApproval')}: ${
                      dispatchPlanResult.controller_approval_required
                        ? t('commandCenter.marketingBoard.dispatch.required')
                        : t('commandCenter.marketingBoard.dispatch.notRequired')
                    }`}
                  </span>
                </Tag>
                <Tag color={dispatchPlanResult.release_blocked ? 'orange' : 'green'}>
                  <span data-testid='marketing-card-dispatch-release-gate'>
                    {`${t('commandCenter.marketingBoard.dispatch.release')}: ${
                      dispatchPlanResult.release_blocked
                        ? t('commandCenter.marketingBoard.dispatch.blockedByGate')
                        : t('commandCenter.marketingBoard.dispatch.ready')
                    }`}
                  </span>
                </Tag>
                <Tag color='gray'>{`${t('commandCenter.marketingBoard.dispatch.humanGate')}: ${
                  dispatchPlanResult.human_gate || 'HG-2.5'
                }`}</Tag>
                <Tag color='blue'>
                  <span data-testid='marketing-card-dispatch-plan-source'>
                    {dispatchSourceForResult(dispatchPlanResult)}
                  </span>
                </Tag>
              </div>
              <dl className='m-0 grid gap-x-10px gap-y-4px text-11px leading-16px sm:grid-cols-[max-content_1fr]'>
                <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.dispatch.card')}</dt>
                <dd className='m-0 truncate text-t-secondary'>{textOrDash(dispatchPlanResult.card_id)}</dd>
                <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.dispatch.command')}</dt>
                <dd className='m-0 truncate text-t-secondary'>{textOrDash(dispatchPlanResult.command)}</dd>
                <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.dispatch.reason')}</dt>
                <dd className='m-0 truncate text-t-secondary' data-testid='marketing-card-dispatch-plan-reason'>
                  {firstReasonCode(dispatchPlanResult.reason_codes, dispatchPlanResult.reason_code)}
                </dd>
                <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.dispatch.audit')}</dt>
                <dd className='m-0 truncate text-t-secondary'>{textOrDash(dispatchPlanResult.audit_event_id)}</dd>
                <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.dispatch.source')}</dt>
                <dd className='m-0 truncate text-t-secondary'>{dispatchSourceForResult(dispatchPlanResult)}</dd>
                {dispatchHandoffForResult(dispatchPlanResult) ? (
                  <>
                    <dt className='text-t-tertiary'>{t('commandCenter.marketingBoard.dispatch.handoff')}</dt>
                    <dd className='m-0 truncate text-t-secondary' data-testid='marketing-card-dispatch-handoff'>
                      {`${recordStringField(dispatchHandoffForResult(dispatchPlanResult), 'role_label')} / ${recordStringField(
                        dispatchHandoffForResult(dispatchPlanResult),
                        'dispatch'
                      )}`}
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>
          }
          data-testid='marketing-card-dispatch-plan-result'
        />
      ) : null}

      {blocked ? (
        <Alert
          type='warning'
          title={t('commandCenter.marketingBoard.blocked.title')}
          content={`${result?.reason_code || 'KANBAN_MARKETING_BOARD_UNAVAILABLE'}: ${
            result?.message || t('commandCenter.marketingBoard.blocked.description')
          }`}
        />
      ) : (
        <>
          <div className='grid gap-8px text-12px leading-18px text-t-secondary sm:grid-cols-2'>
            <span className='min-w-0 truncate'>{`${t('commandCenter.marketingBoard.labels.board')}: ${model.board.slug}`}</span>
            <span className='min-w-0 truncate'>{`${t('commandCenter.marketingBoard.labels.database')}: ${model.board.db_path}`}</span>
          </div>
          <div className='grid gap-12px md:grid-cols-2 xl:grid-cols-5'>
            {model.columns.map((column) => (
              <MarketingColumnView
                key={column.key}
                column={column}
                movingCardId={movingCardId}
                dispatchingCardId={dispatchingCardId}
                actioningCardId={actioningCardId}
                onMoveNext={onMoveCardNext}
                onPlanDispatch={onPlanDispatch}
                onOpenComment={onOpenComment}
                onApplyAction={onApplyAction}
              />
            ))}
          </div>
        </>
      )}

      {proofResult ? (
        <Alert
          type={proofResult.ok ? 'success' : 'warning'}
          title={proofResult.reason_code || t('commandCenter.marketingBoard.proof.resultTitle')}
          content={proofResult.audit_event_path || proofResult.message || proofResult.card_id || '-'}
        />
      ) : null}

      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <span className='text-12px leading-18px text-t-tertiary'>{t('commandCenter.marketingBoard.proof.note')}</span>
        <Button shape='round' loading={proofRunning} onClick={onCreateProofCard}>
          {t('commandCenter.marketingBoard.actions.createProofCard')}
        </Button>
      </div>

      <MarketingCardCreateModal
        visible={createModalVisible}
        submitting={createSubmitting}
        onCancel={onCloseCreateModal}
        onSubmit={onSubmitCreateCard}
      />
    </Section>
  );
};

const MarketingCardCommentModal: React.FC<{
  card: ICommandEveMarketingCard | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (comment: string) => void;
}> = ({ card, submitting, onCancel, onSubmit }) => {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState(false);

  useEffect(() => {
    if (card) {
      setComment('');
      setCommentError(false);
    }
  }, [card]);

  const handleSubmit = (): void => {
    const trimmed = comment.trim();
    if (!trimmed) {
      setCommentError(true);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Modal
      title={t('commandCenter.marketingBoard.comment.title')}
      visible={Boolean(card)}
      onCancel={onCancel}
      footer={null}
      maskClosable={!submitting}
      escToExit={!submitting}
      unmountOnExit
    >
      <div className='flex flex-col gap-14px' data-testid='marketing-card-comment-modal'>
        <p className='m-0 text-12px leading-18px text-t-secondary'>
          {card ? `${t('commandCenter.marketingBoard.comment.card')}: ${card.card_title}` : ''}
        </p>
        <Input.TextArea
          value={comment}
          onChange={(value) => {
            setComment(value);
            if (value.trim()) setCommentError(false);
          }}
          placeholder={t('commandCenter.marketingBoard.comment.placeholder')}
          autoSize={{ minRows: 3, maxRows: 6 }}
          data-testid='marketing-card-comment-input'
          status={commentError ? 'error' : undefined}
          disabled={submitting}
        />
        {commentError ? (
          <span className='text-11px leading-16px text-danger-6' data-testid='marketing-card-comment-error'>
            {t('commandCenter.marketingBoard.comment.required')}
          </span>
        ) : null}
        <div className='flex items-center justify-end gap-8px'>
          <Button shape='round' onClick={onCancel} disabled={submitting} data-testid='marketing-card-comment-cancel'>
            {t('common.cancel')}
          </Button>
          <Button
            shape='round'
            type='primary'
            loading={submitting}
            onClick={handleSubmit}
            data-testid='marketing-card-comment-submit'
          >
            {t('commandCenter.marketingBoard.comment.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const CrmOverlaySection: React.FC<{
  result: ICommandEveCrmOverlayResult | null;
  initializeResult: ICommandEveCrmOverlayInitializeResult | null;
  draftCreateResult: ICommandEveCrmDraftCreateResult | null;
  stageResult: ICommandEveCrmStageLocalResult | null;
  consentResult: ICommandEveCrmConsentLocalResult | null;
  initializing: boolean;
  creatingDraft: boolean;
  stagingDealId: string | null;
  consentingDealId: string | null;
  onInitialize: () => void;
  onCreateDraft: () => void;
  onStageDeal: (dealId: string) => void;
  onCaptureConsent: (dealId: string) => void;
}> = ({
  result,
  initializeResult,
  draftCreateResult,
  stageResult,
  consentResult,
  initializing,
  creatingDraft,
  stagingDealId,
  consentingDealId,
  onInitialize,
  onCreateDraft,
  onStageDeal,
  onCaptureConsent,
}) => {
  const { t } = useTranslation();
  const model = result?.model;
  const counts = model?.counts ?? { companies: 0, contacts: 0, deals: 0, audit_events: 0 };
  const initialized = result?.status === 'ready' && model?.initialized === true;
  return (
    <Section
      id='command-eve-crm-overlay'
      testId='command-eve-crm-overlay'
      title={t('commandCenter.sections.crmOverlay')}
      count={counts.deals}
    >
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <p className='m-0 text-12px leading-18px text-t-secondary'>{t('commandCenter.crmOverlay.description')}</p>
        <div className='flex flex-wrap items-center gap-6px'>
          <Tag color='green'>{t('commandCenter.crmOverlay.policy.localOnly')}</Tag>
          <Tag color='green'>NL-5</Tag>
          <Tag color='orange'>{t('commandCenter.crmOverlay.policy.hg4')}</Tag>
          <Tag color='gray'>{t('commandCenter.crmOverlay.policy.noOutreach')}</Tag>
        </div>
      </div>

      {result && result.status !== 'ready' ? (
        <Alert
          type={result.status === 'failed' ? 'error' : 'warning'}
          title={result.reason_code || t('commandCenter.crmOverlay.blocked.title')}
          content={result.message || t('commandCenter.crmOverlay.blocked.description')}
          data-testid='crm-overlay-blocked'
        />
      ) : null}

      {initializeResult ? (
        <Alert
          type={initializeResult.ok ? 'success' : 'warning'}
          title={initializeResult.reason_code || t('commandCenter.crmOverlay.initialize.resultTitle')}
          content={
            initializeResult.audit_event_path || initializeResult.message || initializeResult.audit_event_id || '-'
          }
          data-testid='crm-overlay-initialize-result'
        />
      ) : null}

      {draftCreateResult ? (
        <Alert
          type={draftCreateResult.ok ? 'success' : 'warning'}
          title={draftCreateResult.reason_code || t('commandCenter.crmOverlay.draft.resultTitle')}
          content={draftCreateResult.deal_id || draftCreateResult.message || draftCreateResult.audit_event_id || '-'}
          data-testid='crm-draft-create-result'
        />
      ) : null}

      {stageResult ? (
        <Alert
          type={stageResult.ok ? 'success' : 'warning'}
          title={stageResult.reason_code || t('commandCenter.crmOverlay.stage.resultTitle')}
          content={stageResult.deal_id || stageResult.message || stageResult.audit_event_id || '-'}
          data-testid='crm-stage-local-result'
        />
      ) : null}

      {consentResult ? (
        <Alert
          type={consentResult.ok ? 'success' : 'warning'}
          title={consentResult.reason_code || t('commandCenter.crmOverlay.consent.resultTitle')}
          content={consentResult.deal_id || consentResult.message || consentResult.audit_event_id || '-'}
          data-testid='crm-consent-local-result'
        />
      ) : null}

      <div className='grid gap-10px sm:grid-cols-2 lg:grid-cols-4'>
        {(['companies', 'contacts', 'deals', 'audit_events'] as const).map((key) => (
          <div
            key={key}
            className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'
          >
            <div className='text-11px leading-16px text-t-tertiary'>{t(`commandCenter.crmOverlay.counts.${key}`)}</div>
            <div className='mt-4px text-20px font-700 leading-26px text-t-primary'>{formatCount(counts[key])}</div>
          </div>
        ))}
      </div>

      {model?.recent_deals.length ? (
        <div className='grid gap-10px lg:grid-cols-2' data-testid='crm-draft-deal-list'>
          {model.recent_deals.map((deal) => (
            <article
              key={deal.deal_id}
              className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'
              data-testid={`crm-draft-deal-${deal.deal_id}`}
            >
              <div className='flex items-start justify-between gap-10px'>
                <div className='min-w-0'>
                  <div className='truncate text-13px font-600 leading-20px text-t-primary'>{deal.deal_id}</div>
                  <div className='mt-2px truncate text-11px leading-16px text-t-tertiary'>{deal.company_id}</div>
                </div>
                <Tag color='blue'>{deal.stage}</Tag>
              </div>
              <div className='mt-8px flex flex-wrap gap-6px text-11px leading-16px'>
                <Tag color='gray'>{deal.allowed_actions}</Tag>
                <Tag color={deal.consent_status === 'unknown' ? 'orange' : 'green'}>{deal.consent_status}</Tag>
                <Tag color='orange'>{deal.human_gate}</Tag>
                <Tag color='gray'>{deal.data_class}</Tag>
              </div>
              <div className='mt-6px truncate text-11px leading-16px text-t-tertiary'>
                {textOrDash(deal.last_activity_at)}
              </div>
              <div className='mt-10px flex flex-wrap justify-end gap-8px'>
                <Button
                  size='mini'
                  shape='round'
                  type='outline'
                  loading={consentingDealId === deal.deal_id}
                  disabled={Boolean(consentingDealId) || deal.consent_status === 'captured-local'}
                  onClick={() => onCaptureConsent(deal.deal_id)}
                  data-testid={`crm-consent-local-${deal.deal_id}`}
                >
                  {t('commandCenter.crmOverlay.actions.captureConsent')}
                </Button>
                <Button
                  size='mini'
                  shape='round'
                  type='outline'
                  loading={stagingDealId === deal.deal_id}
                  disabled={Boolean(stagingDealId) || deal.stage === 'qualified'}
                  onClick={() => onStageDeal(deal.deal_id)}
                  data-testid={`crm-stage-qualified-${deal.deal_id}`}
                >
                  {t('commandCenter.crmOverlay.actions.qualifyDraft')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {model ? (
        <dl className='m-0 grid gap-x-10px gap-y-4px text-11px leading-16px sm:grid-cols-[max-content_1fr]'>
          <dt className='text-t-tertiary'>{t('commandCenter.crmOverlay.labels.database')}</dt>
          <dd className='m-0 truncate text-t-secondary' data-testid='crm-overlay-db-path'>
            {textOrDash(model.db_path)}
          </dd>
          <dt className='text-t-tertiary'>{t('commandCenter.crmOverlay.labels.ledger')}</dt>
          <dd className='m-0 truncate text-t-secondary'>{textOrDash(model.event_ledger_path)}</dd>
          <dt className='text-t-tertiary'>{t('commandCenter.crmOverlay.labels.defaultClass')}</dt>
          <dd className='m-0 truncate text-t-secondary'>{model.policy.crm_data_class_default}</dd>
          <dt className='text-t-tertiary'>{t('commandCenter.crmOverlay.labels.actionCeiling')}</dt>
          <dd className='m-0 truncate text-t-secondary'>{model.policy.deal_action_ceiling_without_consent}</dd>
        </dl>
      ) : null}

      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <span className='text-12px leading-18px text-t-tertiary'>
          {initialized ? t('commandCenter.crmOverlay.readyNote') : t('commandCenter.crmOverlay.initialize.note')}
        </span>
        <div className='flex flex-wrap items-center gap-8px'>
          <Button
            shape='round'
            loading={initializing}
            disabled={initializing || initialized}
            onClick={onInitialize}
            data-testid='crm-overlay-initialize'
          >
            {t('commandCenter.crmOverlay.actions.initialize')}
          </Button>
          <Button
            shape='round'
            type='outline'
            loading={creatingDraft}
            disabled={creatingDraft || !initialized}
            onClick={onCreateDraft}
            data-testid='crm-draft-create'
          >
            {t('commandCenter.crmOverlay.actions.createDraft')}
          </Button>
        </div>
      </div>
    </Section>
  );
};

const StatusSurfaceSection: React.FC<{ result: ICommandEveStatusSurfaceResult | null }> = ({ result }) => {
  const { t } = useTranslation();
  const surface = result?.surface;
  const status = surface?.status ?? (result?.status === 'failed' ? 'BLOCK' : undefined);
  const blockedActions = surface?.blocked_actions ?? [];
  const emptyStates = surface?.empty_states ?? [];
  const readiness = surface?.readiness;
  const hermesReason = surface?.hermes_status?.available
    ? t('commandCenter.statusSurface.hermesAvailable')
    : surface?.hermes_status?.reason || t('commandCenter.statusSurface.hermesUnavailable');
  return (
    <Section title={t('commandCenter.sections.statusSurface')}>
      <div className='grid gap-12px lg:grid-cols-[1.2fr_1fr]'>
        <div className='rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px'>
          <div className='flex flex-wrap items-center justify-between gap-10px'>
            <div>
              <div className='text-12px leading-18px text-t-tertiary'>{t('commandCenter.statusSurface.label')}</div>
              <div className='mt-4px text-22px font-700 leading-28px text-t-primary'>
                {surface?.status_label || result?.reason_code || t('commandCenter.statusSurface.unavailable')}
              </div>
            </div>
            <Tag color={statusSurfaceColor(status)}>{status || t('commandCenter.statusSurface.unknown')}</Tag>
          </div>
          <p className='m-0 mt-10px text-13px leading-20px text-t-secondary'>
            {surface?.morning_brief?.headline || result?.message || t('commandCenter.statusSurface.description')}
          </p>
          {result && !result.ok ? (
            <Alert
              className='mt-12px'
              type={result.status === 'failed' ? 'error' : 'warning'}
              title={result.reason_code || t('commandCenter.statusSurface.checkRequired')}
              content={result.message || t('commandCenter.statusSurface.checkRequiredDescription')}
            />
          ) : null}
        </div>

        <div className='rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px'>
          <dl className='grid grid-cols-2 gap-x-12px gap-y-8px text-12px leading-18px'>
            <dt className='text-t-tertiary'>{t('commandCenter.statusSurface.readiness')}</dt>
            <dd className='m-0 truncate text-t-secondary'>
              {readiness?.available
                ? `${readiness.status} · ${formatCount(readiness.blocker_count ?? 0)} / ${formatCount(
                    readiness.warning_count ?? 0
                  )}`
                : t('commandCenter.statusSurface.unavailable')}
            </dd>
            <dt className='text-t-tertiary'>{t('commandCenter.statusSurface.hermes')}</dt>
            <dd className='m-0 truncate text-t-secondary'>{hermesReason}</dd>
            <dt className='text-t-tertiary'>{t('commandCenter.labels.generatedAt')}</dt>
            <dd className='m-0 truncate text-t-secondary'>{textOrDash(surface?.generated_at)}</dd>
            <dt className='text-t-tertiary'>{t('commandCenter.labels.ledger')}</dt>
            <dd className='m-0 truncate text-t-secondary'>{textOrDash(surface?.sources?.event_ledger)}</dd>
          </dl>
        </div>
      </div>

      {emptyStates.length > 0 ? (
        <div className='flex flex-wrap gap-6px'>
          {emptyStates.map((state) => (
            <Tag key={state} color='orange'>
              {state}
            </Tag>
          ))}
        </div>
      ) : null}

      {blockedActions.length > 0 ? (
        <div className='flex flex-col gap-6px'>
          <div className='text-12px leading-18px text-t-tertiary'>
            {t('commandCenter.statusSurface.blockedActions')}
          </div>
          <div className='flex flex-wrap gap-6px'>
            {blockedActions.map((action) => (
              <Tag key={action} color='gray'>
                {action}
              </Tag>
            ))}
          </div>
        </div>
      ) : null}
    </Section>
  );
};

const RunCard: React.FC<{ run: ICommandEveCommandCenterRunCard }> = ({ run }) => {
  const { t } = useTranslation();
  const state = textOrDash(run.worker_state);
  return (
    <article className='flex flex-col gap-10px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px'>
      <div className='flex items-start justify-between gap-12px'>
        <div className='min-w-0'>
          <div className='truncate text-14px font-600 leading-22px text-t-primary'>
            {textOrDash(run.issue_id || run.run_id)}
          </div>
          <div className='mt-2px truncate text-12px leading-18px text-t-tertiary'>{textOrDash(run.run_id)}</div>
        </div>
        <Tag color={stateColor(state)}>{state}</Tag>
      </div>
      <dl className='grid grid-cols-2 gap-x-12px gap-y-6px text-12px leading-18px'>
        <dt className='text-t-tertiary'>{t('commandCenter.labels.agent')}</dt>
        <dd className='m-0 truncate text-t-secondary'>{textOrDash(run.agent || run.mode)}</dd>
        <dt className='text-t-tertiary'>{t('commandCenter.labels.humanGate')}</dt>
        <dd className='m-0 truncate text-t-secondary'>{textOrDash(run.human_gate_level || run.human_gate_state)}</dd>
        <dt className='text-t-tertiary'>{t('commandCenter.labels.events')}</dt>
        <dd className='m-0 truncate text-t-secondary'>{formatCount(run.event_count)}</dd>
        <dt className='text-t-tertiary'>{t('commandCenter.labels.lastEvent')}</dt>
        <dd className='m-0 truncate text-t-secondary'>{textOrDash(run.last_event_at)}</dd>
      </dl>
      {run.next_action ? (
        <p className='m-0 break-words rounded-8px bg-fill-1 px-10px py-8px text-12px leading-18px text-t-secondary'>
          {run.next_action}
        </p>
      ) : null}
      {run.blocking_reasons.length > 0 ? (
        <div className='flex flex-wrap gap-6px'>
          {run.blocking_reasons.map((reason) => (
            <Tag key={reason} color='red'>
              {reason}
            </Tag>
          ))}
        </div>
      ) : null}
    </article>
  );
};

const TraceCard: React.FC<{ trace: ICommandEveCommandCenterTraceCard }> = ({ trace }) => (
  <article className='rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px'>
    <div className='flex items-center justify-between gap-12px'>
      <span className='min-w-0 truncate text-13px font-600 leading-20px text-t-primary'>
        {textOrDash(trace.issue_id || trace.run_id)}
      </span>
      <Tag color='blue'>{textOrDash(trace.agent || trace.mode)}</Tag>
    </div>
    <div className='mt-8px flex flex-col gap-4px text-12px leading-18px text-t-secondary'>
      <span className='truncate'>{textOrDash(trace.trace_markdown || trace.trace_json || trace.prompt_result)}</span>
      <span className='truncate text-t-tertiary'>{textOrDash(trace.source_event_id)}</span>
    </div>
  </article>
);

const CommandCenterPage: React.FC = () => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [loading, setLoading] = useState(true);
  const [statusSurface, setStatusSurface] = useState<ICommandEveStatusSurfaceResult | null>(null);
  const [result, setResult] = useState<ICommandEveCommandCenterReadModelResult | null>(null);
  const [marketingResult, setMarketingResult] = useState<ICommandEveMarketingBoardResult | null>(null);
  const [crmResult, setCrmResult] = useState<ICommandEveCrmOverlayResult | null>(null);
  const [crmInitializeResult, setCrmInitializeResult] = useState<ICommandEveCrmOverlayInitializeResult | null>(null);
  const [crmDraftCreateResult, setCrmDraftCreateResult] = useState<ICommandEveCrmDraftCreateResult | null>(null);
  const [crmStageResult, setCrmStageResult] = useState<ICommandEveCrmStageLocalResult | null>(null);
  const [crmConsentResult, setCrmConsentResult] = useState<ICommandEveCrmConsentLocalResult | null>(null);
  const [proofResult, setProofResult] = useState<ICommandEveMarketingProofCardResult | null>(null);
  const [proofRunning, setProofRunning] = useState(false);
  const [createResult, setCreateResult] = useState<ICommandEveMarketingCardCreateResult | null>(null);
  const [moveResult, setMoveResult] = useState<ICommandEveMarketingCardMoveResult | null>(null);
  const [actionResult, setActionResult] = useState<ICommandEveMarketingCardActionResult | null>(null);
  const [dispatchPlanResult, setDispatchPlanResult] = useState<ICommandEveMarketingDispatchPlanResult | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [commentCard, setCommentCard] = useState<ICommandEveMarketingCard | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [actioningCardId, setActioningCardId] = useState<string | null>(null);
  const [dispatchingCardId, setDispatchingCardId] = useState<string | null>(null);
  const [crmInitializing, setCrmInitializing] = useState(false);
  const [crmDraftCreating, setCrmDraftCreating] = useState(false);
  const [crmStagingDealId, setCrmStagingDealId] = useState<string | null>(null);
  const [crmConsentingDealId, setCrmConsentingDealId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!isElectronDesktop()) {
      setStatusSurface({
        version: 'command-eve-status-surface-bridge/v0',
        ok: false,
        status: 'blocked',
        reason_code: 'COMMAND_CENTER_ELECTRON_BRIDGE_REQUIRED',
        message: t('commandCenter.blocked.electronBridgeRequired'),
        source: {
          generated_by: 'company-os-status-surface-cli',
        },
      });
      setResult({
        version: 'command-eve-command-center-read-model/v0',
        ok: false,
        status: 'blocked',
        reason_code: 'COMMAND_CENTER_ELECTRON_BRIDGE_REQUIRED',
        message: t('commandCenter.blocked.electronBridgeRequired'),
        source: {
          generated_by: 'company-os-read-model-cli',
        },
      });
      setMarketingResult(null);
      setCrmResult(null);
      setLoading(false);
      return;
    }
    try {
      const [statusSurfaceResponse, readModelResponse, marketingBoardResponse, crmOverlayResponse] = await Promise.all([
        commandEveStatusSurface.invoke({ maxRuns: MAX_RUNS }),
        commandCenterReadModel.invoke({ maxRuns: MAX_RUNS }),
        kanbanMarketingBoard.invoke({ boardSlug: 'marketing' }),
        crmOverlay.invoke({}),
      ]);
      setStatusSurface(statusSurfaceResponse.data ?? null);
      setResult(readModelResponse.data ?? null);
      setMarketingResult(marketingBoardResponse.data ?? null);
      setCrmResult(crmOverlayResponse.data ?? null);
      if (!readModelResponse.success && !readModelResponse.data) {
        setError(readModelResponse.msg || t('commandCenter.errors.loadFailed'));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('commandCenter.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const model = result?.model;
  const totals = model?.morning_brief?.totals ?? {};
  const totalRows = useMemo(
    () =>
      Object.entries(totals).map(([key, value]) => ({
        key,
        value,
      })),
    [totals]
  );
  const boardColumns = useMemo(() => buildBoardColumns(model?.worker_runs ?? []), [model?.worker_runs]);

  const createProofCard = useCallback(async () => {
    if (!isElectronDesktop()) return;
    setProofRunning(true);
    setProofResult(null);
    try {
      const response = await kanbanMarketingProofCard.invoke({ boardSlug: 'marketing' });
      setProofResult(response.data ?? null);
      if (response.data?.model) {
        setMarketingResult({
          version: 'command-eve-kanban-marketing-board/v0',
          ok: response.data.ok,
          status: response.data.status,
          reason_code: response.data.reason_code,
          message: response.data.message,
          model: response.data.model,
          source: response.data.source,
        });
      } else {
        const nextBoard = await kanbanMarketingBoard.invoke({ boardSlug: 'marketing' });
        setMarketingResult(nextBoard.data ?? null);
      }
    } catch (proofError) {
      setProofResult({
        version: 'command-eve-kanban-marketing-proof-card/v0',
        ok: false,
        status: 'failed',
        reason_code: 'KANBAN_MARKETING_PROOF_CARD_UI_FAILED',
        message: proofError instanceof Error ? proofError.message : t('commandCenter.marketingBoard.proof.failed'),
        source: {
          generated_by: 'command-eve-kanban-marketing-board-core',
          hermes_home: '',
        },
      });
    } finally {
      setProofRunning(false);
    }
  }, [t]);

  const openCreateModal = useCallback(() => {
    setCreateResult(null);
    setActionResult(null);
    setDispatchPlanResult(null);
    setCreateModalVisible(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (createSubmitting) return;
    setCreateModalVisible(false);
  }, [createSubmitting]);

  // Refresh the local board projection from a mutation result's model, falling
  // back to a fresh read if the mutation did not return one.
  const applyBoardModel = useCallback(async (data: IMarketingMutationBoardCarrier | null) => {
    if (data?.model) {
      setMarketingResult({
        version: 'command-eve-kanban-marketing-board/v0',
        ok: data.ok,
        status: data.status,
        reason_code: data.reason_code,
        message: data.message,
        model: data.model,
        source: data.source,
      });
      return;
    }
    const nextBoard = await kanbanMarketingBoard.invoke({ boardSlug: MARKETING_BOARD_SLUG });
    setMarketingResult(nextBoard.data ?? null);
  }, []);

  const submitCreateCard = useCallback(
    async (input: { title: string; description: string; lane_key: IMarketingLaneKey }) => {
      if (!isElectronDesktop()) return;
      setCreateSubmitting(true);
      setMoveResult(null);
      setActionResult(null);
      setDispatchPlanResult(null);
      try {
        const response = await kanbanMarketingCardCreate.invoke({
          title: input.title,
          description: input.description || undefined,
          lane_key: input.lane_key,
          client_token: generateClientToken(),
          boardSlug: MARKETING_BOARD_SLUG,
        });
        const data = response.data ?? null;
        setCreateResult(data);
        await applyBoardModel(data);
        if (data?.ok) {
          setCreateModalVisible(false);
          Message.success(t('commandCenter.marketingBoard.create.success'));
        } else {
          Message.warning(data?.reason_code || t('commandCenter.marketingBoard.create.failed'));
        }
      } catch (createError) {
        const failure: ICommandEveMarketingCardCreateResult = {
          version: 'command-eve-kanban-marketing-card-create/v0',
          ok: false,
          status: 'failed',
          reason_code: 'KANBAN_MARKETING_CARD_CREATE_UI_FAILED',
          message: createError instanceof Error ? createError.message : t('commandCenter.marketingBoard.create.failed'),
          source: {
            generated_by: 'command-eve-kanban-marketing-board-core',
            hermes_home: '',
          },
        };
        setCreateResult(failure);
        Message.error(failure.message || t('commandCenter.marketingBoard.create.failed'));
      } finally {
        setCreateSubmitting(false);
      }
    },
    [applyBoardModel, t]
  );

  const moveCardNext = useCallback(
    async (card: ICommandEveMarketingCard, toLane: IMarketingLaneKey) => {
      if (!isElectronDesktop()) return;
      setMovingCardId(card.card_id);
      setCreateResult(null);
      setActionResult(null);
      setDispatchPlanResult(null);
      try {
        const response = await kanbanMarketingCardMove.invoke({
          task_id: card.card_id,
          to_lane_key: toLane,
          boardSlug: MARKETING_BOARD_SLUG,
        });
        const data = response.data ?? null;
        setMoveResult(data);
        await applyBoardModel(data);
        if (data?.ok) {
          Message.success(t('commandCenter.marketingBoard.move.success'));
        } else {
          Message.warning(data?.reason_code || t('commandCenter.marketingBoard.move.failed'));
        }
      } catch (moveError) {
        const failure: ICommandEveMarketingCardMoveResult = {
          version: 'command-eve-kanban-marketing-card-move/v0',
          ok: false,
          status: 'failed',
          reason_code: 'KANBAN_MARKETING_CARD_MOVE_UI_FAILED',
          message: moveError instanceof Error ? moveError.message : t('commandCenter.marketingBoard.move.failed'),
          source: {
            generated_by: 'command-eve-kanban-marketing-board-core',
            hermes_home: '',
          },
        };
        setMoveResult(failure);
        Message.error(failure.message || t('commandCenter.marketingBoard.move.failed'));
      } finally {
        setMovingCardId(null);
      }
    },
    [applyBoardModel, t]
  );

  const openComment = useCallback((card: ICommandEveMarketingCard) => {
    setCreateResult(null);
    setMoveResult(null);
    setActionResult(null);
    setDispatchPlanResult(null);
    setCommentCard(card);
  }, []);

  const closeComment = useCallback(() => {
    if (commentSubmitting) return;
    setCommentCard(null);
  }, [commentSubmitting]);

  const applyCardAction = useCallback(
    async (
      card: ICommandEveMarketingCard,
      action: IMarketingCardAction,
      comment?: string
    ): Promise<ICommandEveMarketingCardActionResult | null> => {
      if (!isElectronDesktop()) return null;
      setActioningCardId(card.card_id);
      setCreateResult(null);
      setMoveResult(null);
      setDispatchPlanResult(null);
      try {
        const response = await kanbanMarketingCardAction.invoke({
          task_id: card.card_id,
          action,
          comment,
          boardSlug: MARKETING_BOARD_SLUG,
        });
        const data = response.data ?? null;
        setActionResult(data);
        await applyBoardModel(data);
        if (data?.ok) {
          Message.success(t('commandCenter.marketingBoard.action.success'));
        } else {
          Message.warning(data?.reason_code || t('commandCenter.marketingBoard.action.failed'));
        }
        return data;
      } catch (actionError) {
        const failure: ICommandEveMarketingCardActionResult = {
          version: 'command-eve-kanban-marketing-card-action/v0',
          ok: false,
          status: 'failed',
          reason_code: 'KANBAN_MARKETING_CARD_ACTION_UI_FAILED',
          message:
            actionError instanceof Error ? actionError.message : t('commandCenter.marketingBoard.action.failed'),
          card_id: card.card_id,
          action,
          source: {
            generated_by: 'command-eve-kanban-marketing-board-core',
            hermes_home: '',
          },
        };
        setActionResult(failure);
        Message.error(failure.message || t('commandCenter.marketingBoard.action.failed'));
        return failure;
      } finally {
        setActioningCardId(null);
      }
    },
    [applyBoardModel, t]
  );

  const applyNonCommentAction = useCallback(
    (card: ICommandEveMarketingCard, action: Exclude<IMarketingCardAction, 'comment'>) => {
      void applyCardAction(card, action);
    },
    [applyCardAction]
  );

  const submitComment = useCallback(
    async (comment: string) => {
      if (!commentCard) return;
      setCommentSubmitting(true);
      const result = await applyCardAction(commentCard, 'comment', comment);
      setCommentSubmitting(false);
      if (result?.ok) {
        setCommentCard(null);
      }
    },
    [applyCardAction, commentCard]
  );

  const planDispatch = useCallback(
    async (card: ICommandEveMarketingCard) => {
      if (!isElectronDesktop()) return;
      setDispatchingCardId(card.card_id);
      setCreateResult(null);
      setMoveResult(null);
      setActionResult(null);
      try {
        const response = await kanbanMarketingDispatchPlan.invoke({
          task_id: card.card_id,
          command: 'decompose',
          boardSlug: MARKETING_BOARD_SLUG,
        });
        const data = response.data ?? null;
        setDispatchPlanResult(data);
        if (data?.ok) {
          Message.success(t('commandCenter.marketingBoard.dispatch.ready'));
        } else {
          Message.warning(data?.reason_code || t('commandCenter.marketingBoard.dispatch.blocked'));
        }
      } catch (dispatchError) {
        const failure: ICommandEveMarketingDispatchPlanResult = {
          version: 'command-eve-kanban-marketing-dispatch-plan/v0',
          ok: false,
          status: 'failed',
          reason_code: 'KANBAN_MARKETING_DISPATCH_PLAN_UI_FAILED',
          reason_codes: ['KANBAN_MARKETING_DISPATCH_PLAN_UI_FAILED'],
          message:
            dispatchError instanceof Error ? dispatchError.message : t('commandCenter.marketingBoard.dispatch.failed'),
          subprocess_spawned: false,
          data_boundary_checked: false,
          source: {
            generated_by: 'command-eve-kanban-marketing-board-core',
            hermes_home: '',
          },
        };
        setDispatchPlanResult(failure);
        Message.error(failure.message || t('commandCenter.marketingBoard.dispatch.failed'));
      } finally {
        setDispatchingCardId(null);
      }
    },
    [t]
  );

  const initializeCrm = useCallback(async () => {
    if (!isElectronDesktop()) return;
    setCrmInitializing(true);
    setCrmInitializeResult(null);
    try {
      const response = await crmOverlayInitialize.invoke({});
      const data = response.data ?? null;
      setCrmInitializeResult(data);
      if (data?.model) {
        setCrmResult({
          version: 'command-eve-crm-overlay/v0',
          ok: data.ok,
          status: data.status,
          reason_code: data.reason_code,
          message: data.message,
          model: data.model,
          source: data.source,
        });
      } else {
        const nextCrm = await crmOverlay.invoke({});
        setCrmResult(nextCrm.data ?? null);
      }
      if (data?.ok) {
        Message.success(t('commandCenter.crmOverlay.initialize.success'));
      } else {
        Message.warning(data?.reason_code || t('commandCenter.crmOverlay.initialize.failed'));
      }
    } catch (crmError) {
      const failure: ICommandEveCrmOverlayInitializeResult = {
        version: 'command-eve-crm-overlay-initialize/v0',
        ok: false,
        status: 'failed',
        reason_code: 'CRM_OVERLAY_INITIALIZE_UI_FAILED',
        message: crmError instanceof Error ? crmError.message : t('commandCenter.crmOverlay.initialize.failed'),
        source: {
          generated_by: 'command-eve-crm-overlay-core',
          hermes_home: '',
        },
      };
      setCrmInitializeResult(failure);
      Message.error(failure.message || t('commandCenter.crmOverlay.initialize.failed'));
    } finally {
      setCrmInitializing(false);
    }
  }, [t]);

  const createCrmDraft = useCallback(async () => {
    if (!isElectronDesktop()) return;
    setCrmDraftCreating(true);
    setCrmDraftCreateResult(null);
    try {
      const response = await crmDraftCreate.invoke({});
      const data = response.data ?? null;
      setCrmDraftCreateResult(data);
      if (data?.model) {
        setCrmResult({
          version: 'command-eve-crm-overlay/v0',
          ok: data.ok,
          status: data.status,
          reason_code: data.reason_code,
          message: data.message,
          model: data.model,
          source: data.source,
        });
      } else {
        const nextCrm = await crmOverlay.invoke({});
        setCrmResult(nextCrm.data ?? null);
      }
      if (data?.ok) {
        Message.success(t('commandCenter.crmOverlay.draft.success'));
      } else {
        Message.warning(data?.reason_code || t('commandCenter.crmOverlay.draft.failed'));
      }
    } catch (draftError) {
      const failure: ICommandEveCrmDraftCreateResult = {
        version: 'command-eve-crm-draft-create/v0',
        ok: false,
        status: 'failed',
        reason_code: 'CRM_DRAFT_CREATE_UI_FAILED',
        message: draftError instanceof Error ? draftError.message : t('commandCenter.crmOverlay.draft.failed'),
        source: {
          generated_by: 'command-eve-crm-overlay-core',
          hermes_home: '',
        },
      };
      setCrmDraftCreateResult(failure);
      Message.error(failure.message || t('commandCenter.crmOverlay.draft.failed'));
    } finally {
      setCrmDraftCreating(false);
    }
  }, [t]);

  const stageCrmDeal = useCallback(
    async (dealId: string) => {
      if (!isElectronDesktop()) return;
      setCrmStagingDealId(dealId);
      setCrmStageResult(null);
      try {
        const response = await crmStageLocal.invoke({ dealId, targetStage: 'qualified' });
        const data = response.data ?? null;
        setCrmStageResult(data);
        if (data?.model) {
          setCrmResult({
            version: 'command-eve-crm-overlay/v0',
            ok: data.ok,
            status: data.status,
            reason_code: data.reason_code,
            message: data.message,
            model: data.model,
            source: data.source,
          });
        } else {
          const nextCrm = await crmOverlay.invoke({});
          setCrmResult(nextCrm.data ?? null);
        }
        if (data?.ok) {
          Message.success(t('commandCenter.crmOverlay.stage.success'));
        } else {
          Message.warning(data?.reason_code || t('commandCenter.crmOverlay.stage.failed'));
        }
      } catch (stageError) {
        const failure: ICommandEveCrmStageLocalResult = {
          version: 'command-eve-crm-stage-local/v0',
          ok: false,
          status: 'failed',
          reason_code: 'CRM_STAGE_LOCAL_UI_FAILED',
          message: stageError instanceof Error ? stageError.message : t('commandCenter.crmOverlay.stage.failed'),
          source: {
            generated_by: 'command-eve-crm-overlay-core',
            hermes_home: '',
          },
        };
        setCrmStageResult(failure);
        Message.error(failure.message || t('commandCenter.crmOverlay.stage.failed'));
      } finally {
        setCrmStagingDealId(null);
      }
    },
    [t]
  );

  const captureCrmConsent = useCallback(
    async (dealId: string) => {
      if (!isElectronDesktop()) return;
      setCrmConsentingDealId(dealId);
      setCrmConsentResult(null);
      try {
        const response = await crmConsentLocal.invoke({ dealId });
        const data = response.data ?? null;
        setCrmConsentResult(data);
        if (data?.model) {
          setCrmResult({
            version: 'command-eve-crm-overlay/v0',
            ok: data.ok,
            status: data.status,
            reason_code: data.reason_code,
            message: data.message,
            model: data.model,
            source: data.source,
          });
        } else {
          const nextCrm = await crmOverlay.invoke({});
          setCrmResult(nextCrm.data ?? null);
        }
        if (data?.ok) {
          Message.success(t('commandCenter.crmOverlay.consent.success'));
        } else {
          Message.warning(data?.reason_code || t('commandCenter.crmOverlay.consent.failed'));
        }
      } catch (consentError) {
        const failure: ICommandEveCrmConsentLocalResult = {
          version: 'command-eve-crm-consent-local/v0',
          ok: false,
          status: 'failed',
          reason_code: 'CRM_CONSENT_LOCAL_UI_FAILED',
          message: consentError instanceof Error ? consentError.message : t('commandCenter.crmOverlay.consent.failed'),
          source: {
            generated_by: 'command-eve-crm-overlay-core',
            hermes_home: '',
          },
        };
        setCrmConsentResult(failure);
        Message.error(failure.message || t('commandCenter.crmOverlay.consent.failed'));
      } finally {
        setCrmConsentingDealId(null);
      }
    },
    [t]
  );

  return (
    <div
      className={classNames(
        'w-full min-h-full box-border overflow-y-auto',
        isMobile ? 'px-16px py-14px' : 'px-12px py-24px md:px-40px md:py-32px'
      )}
    >
      <div className='mx-auto flex w-full max-w-1040px flex-col gap-16px'>
        <header className='flex flex-wrap items-start justify-between gap-12px'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-8px'>
              <h1 className='m-0 text-28px font-700 leading-34px text-t-primary'>{t('commandCenter.title')}</h1>
              <Tag color='gray'>{t('commandCenter.readOnly')}</Tag>
            </div>
            <p className='m-0 mt-8px max-w-720px text-14px leading-22px text-t-secondary'>
              {t('commandCenter.subtitle')}
            </p>
          </div>
          <Button shape='round' onClick={() => void refresh()} loading={loading}>
            {t('commandCenter.refresh')}
          </Button>
        </header>

        {!loading ? <StatusSurfaceSection result={statusSurface} /> : null}

        {loading ? (
          <div className='flex min-h-260px items-center justify-center rounded-16px border border-dashed border-border-2 bg-fill-1'>
            <Spin />
          </div>
        ) : error ? (
          <Alert type='error' title={t('commandCenter.errors.loadFailed')} content={error} />
        ) : !result || result.status !== 'ready' || !model ? (
          <Alert
            type='warning'
            title={t('commandCenter.blocked.title')}
            content={`${result?.reason_code || 'READ_MODEL_UNAVAILABLE'}: ${result?.message || t('commandCenter.blocked.description')}`}
          />
        ) : (
          <>
            <Section title={t('commandCenter.sections.source')}>
              <div className='grid gap-8px text-12px leading-18px text-t-secondary sm:grid-cols-2'>
                <span className='min-w-0 truncate'>{`${t('commandCenter.labels.generatedAt')}: ${textOrDash(model.generated_at)}`}</span>
                <span className='min-w-0 truncate'>{`${t('commandCenter.labels.ledger')}: ${textOrDash(model.sources.event_ledger)}`}</span>
              </div>
            </Section>

            <section className='grid gap-12px sm:grid-cols-2 lg:grid-cols-4'>
              {totalRows.length > 0 ? (
                totalRows.map((row) => (
                  <div
                    key={row.key}
                    className='rounded-14px border border-solid border-[var(--color-border-2)] bg-fill-1 px-16px py-14px'
                  >
                    <div className='text-12px leading-18px text-t-tertiary'>{row.key}</div>
                    <div className='mt-6px text-24px font-700 leading-30px text-t-primary'>
                      {formatCount(row.value)}
                    </div>
                  </div>
                ))
              ) : (
                <div className='rounded-14px border border-solid border-[var(--color-border-2)] bg-fill-1 px-16px py-14px text-t-secondary'>
                  {model.morning_brief.headline}
                </div>
              )}
            </section>

            <OperatingSurfacesSection
              marketingResult={marketingResult}
              crmResult={crmResult}
              dispatchPlanResult={dispatchPlanResult}
            />
            <OperatingReadinessSection
              marketingResult={marketingResult}
              crmResult={crmResult}
              dispatchPlanResult={dispatchPlanResult}
              readModel={model}
            />

            <Section title={t('commandCenter.sections.board')} count={model.worker_runs.length}>
              <p className='m-0 text-12px leading-18px text-t-secondary'>{t('commandCenter.board.description')}</p>
              <div className='grid gap-12px md:grid-cols-2 xl:grid-cols-4'>
                {boardColumns.map((column) => (
                  <BoardColumnView key={column.key} column={column} />
                ))}
              </div>
            </Section>

            <MarketingBoardSection
              result={marketingResult}
              proofResult={proofResult}
              proofRunning={proofRunning}
              createResult={createResult}
              moveResult={moveResult}
              actionResult={actionResult}
              dispatchPlanResult={dispatchPlanResult}
              createModalVisible={createModalVisible}
              createSubmitting={createSubmitting}
              movingCardId={movingCardId}
              actioningCardId={actioningCardId}
              dispatchingCardId={dispatchingCardId}
              onCreateProofCard={createProofCard}
              onOpenCreateModal={openCreateModal}
              onCloseCreateModal={closeCreateModal}
              onSubmitCreateCard={submitCreateCard}
              onMoveCardNext={moveCardNext}
              onOpenComment={openComment}
              onApplyAction={applyNonCommentAction}
              onPlanDispatch={planDispatch}
            />
            <MarketingCardCommentModal
              card={commentCard}
              submitting={commentSubmitting}
              onCancel={closeComment}
              onSubmit={submitComment}
            />

            <CrmOverlaySection
              result={crmResult}
              initializeResult={crmInitializeResult}
              draftCreateResult={crmDraftCreateResult}
              stageResult={crmStageResult}
              consentResult={crmConsentResult}
              initializing={crmInitializing}
              creatingDraft={crmDraftCreating}
              stagingDealId={crmStagingDealId}
              consentingDealId={crmConsentingDealId}
              onInitialize={initializeCrm}
              onCreateDraft={createCrmDraft}
              onStageDeal={stageCrmDeal}
              onCaptureConsent={captureCrmConsent}
            />

            <Section title={t('commandCenter.sections.workerRuns')} count={model.worker_runs.length}>
              {model.worker_runs.length > 0 ? (
                <div className='grid gap-12px lg:grid-cols-2'>
                  {model.worker_runs.map((run) => (
                    <RunCard key={run.run_id} run={run} />
                  ))}
                </div>
              ) : (
                <Empty description={t('commandCenter.empty.workerRuns')} />
              )}
            </Section>

            <Section title={t('commandCenter.sections.humanGates')} count={model.human_gate_queue.length}>
              {model.human_gate_queue.length > 0 ? (
                <div className='grid gap-12px lg:grid-cols-2'>
                  {model.human_gate_queue.map((run) => (
                    <RunCard key={run.run_id} run={run} />
                  ))}
                </div>
              ) : (
                <Empty description={t('commandCenter.empty.humanGates')} />
              )}
            </Section>

            <Section title={t('commandCenter.sections.ceoCriticalReleases')} count={model.ceo_critical_releases.length}>
              {model.ceo_critical_releases.length > 0 ? (
                <div className='grid gap-12px lg:grid-cols-2'>
                  {model.ceo_critical_releases.map((run) => (
                    <RunCard key={run.run_id} run={run} />
                  ))}
                </div>
              ) : (
                <Empty description={t('commandCenter.empty.ceoCriticalReleases')} />
              )}
            </Section>

            <Section title={t('commandCenter.sections.eveHg35Packets')} count={model.eve_hg35_packets.length}>
              {model.eve_hg35_packets.length > 0 ? (
                <div className='grid gap-12px lg:grid-cols-2'>
                  {model.eve_hg35_packets.map((run) => (
                    <RunCard key={run.run_id} run={run} />
                  ))}
                </div>
              ) : (
                <Empty description={t('commandCenter.empty.eveHg35Packets')} />
              )}
            </Section>

            <Section title={t('commandCenter.sections.traces')} count={model.trace_summary_cards.length}>
              {model.trace_summary_cards.length > 0 ? (
                <div className='grid gap-12px lg:grid-cols-2'>
                  {model.trace_summary_cards.map((trace) => (
                    <TraceCard key={`${trace.run_id}-${trace.source_event_id}`} trace={trace} />
                  ))}
                </div>
              ) : (
                <Empty description={t('commandCenter.empty.traces')} />
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
};

export default CommandCenterPage;
