/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Empty, Spin, Tag } from '@arco-design/web-react';
import { bridge } from '@office-ai/platform';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { isElectronDesktop } from '@renderer/utils/platform';

type TierStatus = 'selected' | 'available' | 'opt_in' | 'pro';

type BridgeResponse<D = unknown> = {
  success: boolean;
  msg?: string;
  data?: D;
};

type LocalRuntimeTier = {
  id: string;
  label: string;
  model_ref: string;
  runtime_model_ref: string;
  context_length: number;
  max_tokens: number;
  min_unified_memory_gb: number;
  min_free_disk_gb: number;
  status: TierStatus;
};

type LocalRuntimeModel = {
  schema_version: 'command-eve-local-runtime-status/v0';
  generated_at: string;
  read_only: true;
  release: string;
  hermes: {
    package: string;
    version: string;
  };
  provider: {
    type: 'ollama';
    base_url: string;
    egress_proxy_url: string;
  };
  selected_tier_id: string;
  selected_model_ref: string;
  receipt?: {
    path: string;
    status: 'ready' | 'blocked' | 'failed' | 'skipped';
    default_model: string;
    base_model?: string;
    next_action: string;
    completed_at: string;
  };
  model_warmup?: {
    path: string;
    status: 'running' | 'ready' | 'failed' | 'skipped';
    model: string;
    base_url: string;
    started_at: string;
    completed_at?: string;
    elapsed_ms: number;
    error?: string;
  };
  tiers: LocalRuntimeTier[];
  warnings: string[];
};

type LocalRuntimeResult = {
  version: 'command-eve-local-runtime-status/v0';
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  model?: LocalRuntimeModel;
  source: {
    manifest_path?: string;
    receipt_path?: string;
    generated_by: 'command-eve-local-runtime-status-core';
  };
};

type KanbanPreflightModule = {
  name: string;
  ok: boolean;
  error?: string;
};

type KanbanPreflightResult = {
  version: 'command-eve-kanban-preflight/v0';
  ok: boolean;
  status: 'ready' | 'blocked' | 'failed';
  reason_code?: string;
  message?: string;
  model?: {
    schema_version: 'command-eve-kanban-preflight/v0';
    generated_at: string;
    read_only: true;
    hermes: {
      min_required_version: string;
      installed_version: string;
      version_ok: boolean;
    };
    modules: KanbanPreflightModule[];
    board: {
      slug: string;
      db_path: string;
      db_exists: boolean;
      table_count: number;
      task_count?: number;
      read_only_opened: boolean;
    };
    governance: {
      runtime_reconciliation_path: string;
      dispatcher_disabled: boolean;
      auto_decompose_disabled: boolean;
      mcp_servers_disabled: boolean;
    };
    warnings: string[];
  };
  source: {
    generated_by: 'command-eve-kanban-preflight-core';
    hermes_home?: string;
    python_path?: string;
  };
};

const localRuntimeBridge = bridge.buildProvider<
  BridgeResponse<LocalRuntimeResult>,
  { manifestPath?: string; receiptPath?: string } | undefined
>('command-eve.local-runtime-status');

const kanbanPreflightBridge = bridge.buildProvider<
  BridgeResponse<KanbanPreflightResult>,
  { boardSlug?: string } | undefined
>('command-eve.kanban-preflight');

const tierColor = (status: TierStatus): 'green' | 'blue' | 'orange' | 'purple' => {
  if (status === 'selected') return 'green';
  if (status === 'available') return 'blue';
  if (status === 'pro') return 'purple';
  return 'orange';
};

const formatNumber = (value: number): string => new Intl.NumberFormat().format(value);

const textOrDash = (value?: string | null): string => {
  const text = String(value || '').trim();
  return text || '-';
};

const TierCard: React.FC<{ tier: LocalRuntimeTier }> = ({ tier }) => {
  const { t } = useTranslation();
  return (
    <article className='rounded-14px border border-solid border-[var(--color-border-2)] bg-fill-1 px-16px py-14px'>
      <div className='flex items-start justify-between gap-12px'>
        <div className='min-w-0'>
          <div className='truncate text-16px font-700 leading-24px text-t-primary'>{tier.label}</div>
          <div className='mt-2px truncate text-12px leading-18px text-t-tertiary'>{tier.model_ref}</div>
        </div>
        <Tag color={tierColor(tier.status)}>{t(`localRuntime.tierStatus.${tier.status}`)}</Tag>
      </div>
      <dl className='mt-12px grid gap-x-12px gap-y-7px text-12px leading-18px sm:grid-cols-[145px_minmax(0,1fr)]'>
        <dt className='text-t-tertiary'>{t('localRuntime.labels.runtimeModel')}</dt>
        <dd className='m-0 break-words text-t-secondary'>{tier.runtime_model_ref}</dd>
        <dt className='text-t-tertiary'>{t('localRuntime.labels.context')}</dt>
        <dd className='m-0 text-t-secondary'>{formatNumber(tier.context_length)}</dd>
        <dt className='text-t-tertiary'>{t('localRuntime.labels.requirements')}</dt>
        <dd className='m-0 text-t-secondary'>
          {t('localRuntime.requirements', {
            memory: tier.min_unified_memory_gb,
            disk: tier.min_free_disk_gb,
          })}
        </dd>
      </dl>
    </article>
  );
};

const LocalRuntimePage: React.FC = () => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LocalRuntimeResult | null>(null);
  const [kanbanResult, setKanbanResult] = useState<KanbanPreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kanbanError, setKanbanError] = useState<string | null>(null);
  const [warmupPollCount, setWarmupPollCount] = useState(0);

  const load = useCallback(async () => {
    if (!isElectronDesktop()) {
      setResult({
        version: 'command-eve-local-runtime-status/v0',
        ok: false,
        status: 'blocked',
        reason_code: 'ELECTRON_BRIDGE_REQUIRED',
        message: t('localRuntime.blocked.electronBridgeRequired'),
        source: {
          generated_by: 'command-eve-local-runtime-status-core',
        },
      });
      setKanbanResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setKanbanError(null);
    try {
      const [response, kanbanResponse] = await Promise.all([
        localRuntimeBridge.invoke(undefined),
        kanbanPreflightBridge.invoke({ boardSlug: 'default' }),
      ]);
      const data = response.data;
      setResult(data ?? null);
      if (!response.success) {
        setError(response.msg || data?.message || t('localRuntime.errors.loadFailed'));
      }
      const kanbanData = kanbanResponse.data;
      setKanbanResult(kanbanData ?? null);
      if (!kanbanResponse.success) {
        setKanbanError(kanbanResponse.msg || kanbanData?.message || t('localRuntime.errors.kanbanLoadFailed'));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('localRuntime.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const model = result?.model;
  const warmupStatus = model?.model_warmup?.status;
  const warmupMissing = Boolean(model?.warnings.includes('model_warmup_receipt_missing'));

  useEffect(() => {
    if (loading || !model) return undefined;
    if (!warmupMissing && warmupStatus !== 'running') {
      setWarmupPollCount(0);
      return undefined;
    }
    if (warmupPollCount >= 12) return undefined;
    const timer = setTimeout(() => {
      setWarmupPollCount((count) => count + 1);
      void load();
    }, 2500);
    return () => clearTimeout(timer);
  }, [load, loading, model, warmupMissing, warmupPollCount, warmupStatus]);

  return (
    <div className='size-full overflow-y-auto bg-bg-1'>
      <div className={classNames('mx-auto flex max-w-1280px flex-col gap-18px px-24px py-28px', isMobile && 'px-16px')}>
        <header className='flex flex-wrap items-start justify-between gap-12px'>
          <div className='min-w-0'>
            <div className='flex items-center gap-8px'>
              <h1 className='m-0 text-28px font-700 leading-34px text-t-primary'>{t('localRuntime.title')}</h1>
              <Tag color='gray'>{t('localRuntime.readOnly')}</Tag>
            </div>
            <p className='m-0 mt-8px max-w-820px text-14px leading-22px text-t-secondary'>
              {t('localRuntime.subtitle')}
            </p>
          </div>
          <Button type='secondary' loading={loading} onClick={() => void load()}>
            {t('localRuntime.refresh')}
          </Button>
        </header>

        {error ? <Alert type='warning' title={t('localRuntime.errors.loadFailed')} content={error} /> : null}
        {kanbanError ? (
          <Alert type='warning' title={t('localRuntime.errors.kanbanLoadFailed')} content={kanbanError} />
        ) : null}
        {result && !result.ok ? (
          <Alert
            type={result.status === 'blocked' ? 'warning' : 'error'}
            title={t('localRuntime.blocked.title')}
            content={`${result.reason_code || 'LOCAL_RUNTIME_UNAVAILABLE'}: ${result.message || t('localRuntime.blocked.description')}`}
          />
        ) : null}

        {loading ? (
          <div className='min-h-240px flex items-center justify-center'>
            <Spin size={32} />
          </div>
        ) : model ? (
          <>
            {model.warnings.length ? (
              <Alert
                type='info'
                title={t('localRuntime.warnings.title')}
                content={model.warnings.map((warning) => t(`localRuntime.warnings.${warning}`, warning)).join(' · ')}
              />
            ) : null}

            <section className='rounded-16px border border-solid border-[var(--color-border-2)] bg-bg-2 px-18px py-16px'>
              <div className='mb-12px text-16px font-700 leading-24px text-t-primary'>
                {t('localRuntime.sections.runtimeTruth')}
              </div>
              <div className='grid gap-x-12px gap-y-8px text-12px leading-18px lg:grid-cols-[180px_minmax(0,1fr)]'>
                <span className='text-t-tertiary'>{t('localRuntime.labels.release')}</span>
                <span className='text-t-secondary'>{model.release}</span>
                <span className='text-t-tertiary'>{t('localRuntime.labels.hermes')}</span>
                <span className='text-t-secondary'>{`${model.hermes.package} ${model.hermes.version}`}</span>
                <span className='text-t-tertiary'>{t('localRuntime.labels.provider')}</span>
                <span className='text-t-secondary'>{model.provider.type}</span>
                <span className='text-t-tertiary'>{t('localRuntime.labels.ollamaUrl')}</span>
                <span className='break-words text-t-secondary'>{model.provider.base_url}</span>
                <span className='text-t-tertiary'>{t('localRuntime.labels.egressProxy')}</span>
                <span className='break-words text-t-secondary'>{model.provider.egress_proxy_url}</span>
                <span className='text-t-tertiary'>{t('localRuntime.labels.selectedModel')}</span>
                <span className='break-words text-t-secondary'>{model.selected_model_ref}</span>
              </div>
            </section>

            <section className='grid gap-12px lg:grid-cols-3'>
              {model.tiers.map((tier) => (
                <TierCard key={tier.id} tier={tier} />
              ))}
            </section>

            <section className='rounded-16px border border-solid border-[var(--color-border-2)] bg-bg-2 px-18px py-16px'>
              <div className='mb-12px flex flex-wrap items-center gap-8px'>
                <span className='text-16px font-700 leading-24px text-t-primary'>
                  {t('localRuntime.sections.kanban')}
                </span>
                {kanbanResult ? (
                  <Tag color={kanbanResult.ok ? 'green' : kanbanResult.status === 'blocked' ? 'orange' : 'red'}>
                    {kanbanResult.ok ? t('localRuntime.kanban.ready') : t('localRuntime.kanban.notReady')}
                  </Tag>
                ) : null}
                <Tag color='gray'>{t('localRuntime.readOnly')}</Tag>
              </div>
              {kanbanResult?.model ? (
                <>
                  <div className='grid gap-x-12px gap-y-8px text-12px leading-18px lg:grid-cols-[180px_minmax(0,1fr)]'>
                    <span className='text-t-tertiary'>{t('localRuntime.labels.hermes')}</span>
                    <span className='text-t-secondary'>
                      {`${kanbanResult.model.hermes.installed_version} / ${kanbanResult.model.hermes.min_required_version}`}
                    </span>
                    <span className='text-t-tertiary'>{t('localRuntime.kanban.labels.board')}</span>
                    <span className='text-t-secondary'>{kanbanResult.model.board.slug}</span>
                    <span className='text-t-tertiary'>{t('localRuntime.kanban.labels.db')}</span>
                    <span className='break-words text-t-secondary'>{kanbanResult.model.board.db_path}</span>
                    <span className='text-t-tertiary'>{t('localRuntime.kanban.labels.dbState')}</span>
                    <span className='text-t-secondary'>
                      {kanbanResult.model.board.db_exists
                        ? t('localRuntime.kanban.dbPresent.yes')
                        : t('localRuntime.kanban.dbPresent.no')}
                    </span>
                    <span className='text-t-tertiary'>{t('localRuntime.kanban.labels.tasks')}</span>
                    <span className='text-t-secondary'>
                      {typeof kanbanResult.model.board.task_count === 'number'
                        ? formatNumber(kanbanResult.model.board.task_count)
                        : '-'}
                    </span>
                    <span className='text-t-tertiary'>{t('localRuntime.kanban.labels.modules')}</span>
                    <span className='text-t-secondary'>
                      {t('localRuntime.kanban.moduleCount', {
                        ready: kanbanResult.model.modules.filter((module) => module.ok).length,
                        total: kanbanResult.model.modules.length,
                      })}
                    </span>
                    <span className='text-t-tertiary'>{t('localRuntime.kanban.labels.governance')}</span>
                    <span className='text-t-secondary'>
                      {kanbanResult.model.governance.dispatcher_disabled &&
                      kanbanResult.model.governance.auto_decompose_disabled &&
                      kanbanResult.model.governance.mcp_servers_disabled
                        ? t('localRuntime.kanban.governanceLocked')
                        : t('localRuntime.kanban.governanceOpen')}
                    </span>
                    <span className='text-t-tertiary'>{t('localRuntime.kanban.labels.reconciliation')}</span>
                    <span className='break-words text-t-secondary'>
                      {kanbanResult.model.governance.runtime_reconciliation_path}
                    </span>
                  </div>
                  {kanbanResult.model.warnings.length ? (
                    <Alert
                      className='mt-12px'
                      type='info'
                      title={t('localRuntime.warnings.title')}
                      content={kanbanResult.model.warnings
                        .map((warning) => t(`localRuntime.warnings.${warning}`, warning))
                        .join(' · ')}
                    />
                  ) : null}
                </>
              ) : (
                <Empty description={t('localRuntime.empty.noKanban')} />
              )}
            </section>

            <section className='rounded-16px border border-solid border-[var(--color-border-2)] bg-bg-2 px-18px py-16px'>
              <div className='mb-12px text-16px font-700 leading-24px text-t-primary'>
                {t('localRuntime.sections.receipt')}
              </div>
              {model.receipt ? (
                <div className='grid gap-x-12px gap-y-8px text-12px leading-18px lg:grid-cols-[180px_minmax(0,1fr)]'>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.status')}</span>
                  <span className='text-t-secondary'>{model.receipt.status}</span>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.baseModel')}</span>
                  <span className='text-t-secondary'>{textOrDash(model.receipt.base_model)}</span>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.nextAction')}</span>
                  <span className='text-t-secondary'>{model.receipt.next_action}</span>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.receiptPath')}</span>
                  <span className='break-words text-t-secondary'>{model.receipt.path}</span>
                </div>
              ) : (
                <Empty description={t('localRuntime.empty.noReceipt')} />
              )}
            </section>

            <section className='rounded-16px border border-solid border-[var(--color-border-2)] bg-bg-2 px-18px py-16px'>
              <div className='mb-12px flex items-center gap-8px'>
                <span className='text-16px font-700 leading-24px text-t-primary'>
                  {t('localRuntime.sections.warmup')}
                </span>
                {model.model_warmup ? (
                  <Tag
                    color={
                      model.model_warmup.status === 'ready'
                        ? 'green'
                        : model.model_warmup.status === 'running'
                          ? 'blue'
                          : model.model_warmup.status === 'skipped'
                            ? 'gray'
                            : 'red'
                    }
                  >
                    {t(`localRuntime.warmupStatus.${model.model_warmup.status}`)}
                  </Tag>
                ) : null}
              </div>
              {model.model_warmup ? (
                <div className='grid gap-x-12px gap-y-8px text-12px leading-18px lg:grid-cols-[180px_minmax(0,1fr)]'>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.model')}</span>
                  <span className='break-words text-t-secondary'>{model.model_warmup.model}</span>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.baseUrl')}</span>
                  <span className='break-words text-t-secondary'>{model.model_warmup.base_url}</span>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.elapsed')}</span>
                  <span className='text-t-secondary'>
                    {t('localRuntime.elapsedMs', { elapsed: model.model_warmup.elapsed_ms })}
                  </span>
                  <span className='text-t-tertiary'>{t('localRuntime.labels.startedAt')}</span>
                  <span className='text-t-secondary'>{model.model_warmup.started_at}</span>
                  {model.model_warmup.completed_at ? (
                    <>
                      <span className='text-t-tertiary'>{t('localRuntime.labels.completedAt')}</span>
                      <span className='text-t-secondary'>{model.model_warmup.completed_at}</span>
                    </>
                  ) : null}
                  {model.model_warmup.error ? (
                    <>
                      <span className='text-t-tertiary'>{t('localRuntime.labels.error')}</span>
                      <span className='break-words text-t-secondary'>{model.model_warmup.error}</span>
                    </>
                  ) : null}
                  <span className='text-t-tertiary'>{t('localRuntime.labels.receiptPath')}</span>
                  <span className='break-words text-t-secondary'>{model.model_warmup.path}</span>
                </div>
              ) : (
                <Empty description={t('localRuntime.empty.noWarmup')} />
              )}
            </section>
          </>
        ) : (
          <Empty description={t('localRuntime.empty.noRuntime')} />
        )}
      </div>
    </div>
  );
};

export default LocalRuntimePage;
