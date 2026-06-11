/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Empty, Spin, Tag } from '@arco-design/web-react';
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

type IMarketingLaneKey = 'research' | 'draft' | 'assetGeneration' | 'review' | 'readyToApprove';

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

const commandCenterReadModel = bridge.buildProvider<
  IBridgeResponse<ICommandEveCommandCenterReadModelResult>,
  { maxRuns?: number } | undefined
>('command-eve.command-center-read-model');

const kanbanMarketingBoard = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingBoardResult>,
  { boardSlug?: string } | undefined
>('command-eve.kanban-marketing-board');

const kanbanMarketingProofCard = bridge.buildProvider<
  IBridgeResponse<ICommandEveMarketingProofCardResult>,
  { boardSlug?: string } | undefined
>('command-eve.kanban-marketing-proof-card');

const textOrDash = (value?: string | null): string => {
  const text = String(value || '').trim();
  return text || '-';
};

const formatCount = (value: number | undefined): string => String(Number.isFinite(value) ? value : 0);

const stateColor = (state: string): 'blue' | 'green' | 'orange' | 'red' | 'gray' => {
  if (['reported', 'done', 'released', 'pass'].includes(state)) return 'green';
  if (['blocked', 'failed', 'rejected', 'timed_out', 'cancelled'].includes(state)) return 'red';
  if (['required', 'needs_audit', 'waiting_for_human'].includes(state)) return 'orange';
  if (['running', 'in_progress'].includes(state)) return 'blue';
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

const Section: React.FC<{ title: string; count?: number; children: React.ReactNode }> = ({
  title,
  count,
  children,
}) => (
  <section className='flex flex-col gap-10px rounded-14px border border-solid border-[var(--color-border-2)] bg-fill-1 px-16px py-14px'>
    <div className='flex items-center justify-between gap-12px'>
      <h2 className='m-0 text-16px font-600 leading-24px text-t-primary'>{title}</h2>
      {typeof count === 'number' ? <Tag color='gray'>{formatCount(count)}</Tag> : null}
    </div>
    {children}
  </section>
);

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

const MarketingCardView: React.FC<{ card: ICommandEveMarketingCard }> = ({ card }) => {
  const { t } = useTranslation();
  return (
    <article className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'>
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
    </article>
  );
};

const MarketingColumnView: React.FC<{ column: ICommandEveMarketingColumn }> = ({ column }) => {
  const { t } = useTranslation();
  return (
    <div className='flex min-h-180px flex-col gap-10px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-1 px-12px py-12px'>
      <div className='flex items-center justify-between gap-8px'>
        <h3 className='m-0 text-13px font-600 leading-20px text-t-primary'>
          {t(`commandCenter.marketingBoard.columns.${column.key}`)}
        </h3>
        <Tag color='gray'>{formatCount(column.cards.length)}</Tag>
      </div>
      {column.cards.length > 0 ? (
        <div className='flex flex-col gap-8px'>
          {column.cards.map((card) => (
            <MarketingCardView key={`${column.key}-${card.card_id}`} card={card} />
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

const MarketingBoardSection: React.FC<{
  result: ICommandEveMarketingBoardResult | null;
  proofResult: ICommandEveMarketingProofCardResult | null;
  proofRunning: boolean;
  onCreateProofCard: () => void;
}> = ({ result, proofResult, proofRunning, onCreateProofCard }) => {
  const { t } = useTranslation();
  const model = result?.model;
  const cardCount = model?.summary.total_cards ?? 0;
  const blocked = !result || result.status !== 'ready' || !model;
  return (
    <Section title={t('commandCenter.sections.marketingBoard')} count={cardCount}>
      <div className='flex flex-wrap items-center justify-between gap-10px'>
        <p className='m-0 text-12px leading-18px text-t-secondary'>{t('commandCenter.marketingBoard.description')}</p>
        <div className='flex flex-wrap items-center gap-6px'>
          <Tag color='blue'>{t('commandCenter.marketingBoard.policy.readFirst')}</Tag>
          <Tag color='orange'>{t('commandCenter.marketingBoard.policy.humanGate')}</Tag>
          <Tag color='gray'>{t('commandCenter.marketingBoard.policy.noDispatcher')}</Tag>
        </div>
      </div>

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
              <MarketingColumnView key={column.key} column={column} />
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
        <Button shape='round' type='primary' loading={proofRunning} onClick={onCreateProofCard}>
          {t('commandCenter.marketingBoard.actions.createProofCard')}
        </Button>
      </div>
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
  const [result, setResult] = useState<ICommandEveCommandCenterReadModelResult | null>(null);
  const [marketingResult, setMarketingResult] = useState<ICommandEveMarketingBoardResult | null>(null);
  const [proofResult, setProofResult] = useState<ICommandEveMarketingProofCardResult | null>(null);
  const [proofRunning, setProofRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!isElectronDesktop()) {
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
      setLoading(false);
      return;
    }
    try {
      const [readModelResponse, marketingBoardResponse] = await Promise.all([
        commandCenterReadModel.invoke({ maxRuns: MAX_RUNS }),
        kanbanMarketingBoard.invoke({ boardSlug: 'marketing' }),
      ]);
      setResult(readModelResponse.data ?? null);
      setMarketingResult(marketingBoardResponse.data ?? null);
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
              onCreateProofCard={createProofCard}
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
