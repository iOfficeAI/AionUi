/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BgProcessPanel — drawer that lists every background process the
 * current remote OpenCode agent is tracking, with a per-row "view
 * output" affordance and a "stop" action for running ones.
 *
 * The drawer is purely presentational: it forwards everything via
 * `useBgProcesses`, so the parent only needs to provide a
 * `remoteAgentId` and an `open` / `onClose` pair. Toggling `open` to
 * `true` enables the hook's "poll while open" mode, so even an
 * idle list gets a fresh read when the user re-opens it.
 */

import type { BgProcessUiInfo } from '@/common/types/agent/bgProcessTypes';
import { Button, Drawer, Empty, Popconfirm, Table, Tag, Tooltip, Typography } from '@arco-design/web-react';
import type { ColumnProps } from '@arco-design/web-react/es/Table';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBgProcesses } from '../../hooks/useBgProcesses';
import BgProcessOutputViewer from './BgProcessOutputViewer';

const STATUS_COLOR: Record<BgProcessUiInfo['status'], string> = {
  running: 'green',
  exited: 'gray',
  killed: 'orange',
};

const formatUptime = (
  startedAtMs: number,
  endedAtMs: number | undefined,
  status: BgProcessUiInfo['status']
): string => {
  const end = status === 'running' ? Date.now() : (endedAtMs ?? Date.now());
  const total = Math.max(0, Math.floor((end - startedAtMs) / 1000));
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
};

const truncateCommand = (cmd: string, max = 40): string => {
  if (cmd.length <= max) return cmd;
  const keep = Math.floor((max - 1) / 2);
  return `${cmd.slice(0, keep)}…${cmd.slice(-keep)}`;
};

export type BgProcessPanelProps = {
  remoteAgentId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Override the per-process output viewer's poll cadence. Default
   * 1 s. Tests pass a smaller value to keep suite runtime bounded.
   */
  outputPollIntervalMs?: number;
};

const BgProcessPanel: React.FC<BgProcessPanelProps> = ({ remoteAgentId, open, onClose, outputPollIntervalMs }) => {
  const { t } = useTranslation();
  const { processes, loading, stop } = useBgProcesses(remoteAgentId, { pollWhileOpen: open });
  const [outputPid, setOutputPid] = useState<string | null>(null);

  // When the user closes the drawer, also close any open output viewer.
  // The viewer unmounts, which stops its 1 s poll.
  useEffect(() => {
    if (!open) setOutputPid(null);
  }, [open]);

  // When the process list changes (e.g. via WS push) and the user is
  // looking at a process that no longer exists, gracefully close the
  // viewer so the user doesn't see a stale output panel.
  useEffect(() => {
    if (!outputPid) return;
    if (!processes.some((p) => p.id === outputPid)) {
      setOutputPid(null);
    }
  }, [processes, outputPid]);

  const outputProcess = useMemo<BgProcessUiInfo | null>(() => {
    if (!outputPid) return null;
    return processes.find((p) => p.id === outputPid) ?? null;
  }, [processes, outputPid]);

  const columns = useMemo<ColumnProps<BgProcessUiInfo>[]>(() => {
    return [
      {
        title: t('agent.bgProcess.panel.column.name', { defaultValue: 'Name' }),
        dataIndex: 'name',
        key: 'name',
        width: 240,
        render: (_: unknown, record) => (
          <div className='flex flex-col min-w-0'>
            {record.name ? (
              <Typography.Text className='truncate' style={{ maxWidth: 220 }}>
                {record.name}
              </Typography.Text>
            ) : null}
            <Tooltip content={record.command} position='top'>
              <Typography.Text type='secondary' className='text-12px font-mono truncate' style={{ maxWidth: 220 }}>
                {truncateCommand(record.command, 48)}
              </Typography.Text>
            </Tooltip>
          </div>
        ),
      },
      {
        title: t('agent.bgProcess.panel.column.status', { defaultValue: 'Status' }),
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: (status: BgProcessUiInfo['status']) => (
          <Tag size='small' color={STATUS_COLOR[status]} data-testid={`bg-process-status-${status}`}>
            {t('agent.bgProcess.panel.status.' + status, { defaultValue: status })}
          </Tag>
        ),
      },
      {
        title: t('agent.bgProcess.panel.column.uptime', { defaultValue: 'Uptime' }),
        key: 'uptime',
        width: 110,
        render: (_: unknown, record) => (
          <Typography.Text className='text-12px text-t-secondary' style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatUptime(record.started_at_ms, record.ended_at_ms, record.status)}
          </Typography.Text>
        ),
      },
      {
        title: t('agent.bgProcess.panel.column.exitCode', { defaultValue: 'Exit Code' }),
        key: 'exitCode',
        width: 100,
        render: (_: unknown, record) =>
          record.status === 'running' ? (
            <Typography.Text type='secondary'>—</Typography.Text>
          ) : (
            <Typography.Text className='font-mono text-12px'>{record.exit_code ?? '—'}</Typography.Text>
          ),
      },
      {
        title: t('agent.bgProcess.panel.column.actions', { defaultValue: 'Actions' }),
        key: 'actions',
        width: 200,
        render: (_: unknown, record) => (
          <div className='flex items-center gap-8px'>
            <Button
              size='mini'
              type='secondary'
              onClick={() => setOutputPid((cur) => (cur === record.id ? null : record.id))}
              data-testid={`bg-process-view-output-${record.id}`}
            >
              {t('agent.bgProcess.panel.viewOutput', { defaultValue: 'View output' })}
            </Button>
            {record.status === 'running' ? (
              <Popconfirm
                title={t('agent.bgProcess.panel.stopConfirm', { defaultValue: 'Stop this background process?' })}
                onOk={() => {
                  void stop(record.id);
                }}
              >
                <Button size='mini' status='danger' data-testid={`bg-process-stop-${record.id}`}>
                  {t('agent.bgProcess.panel.stop', { defaultValue: 'Stop' })}
                </Button>
              </Popconfirm>
            ) : null}
          </div>
        ),
      },
    ];
  }, [t, stop]);

  return (
    <Drawer
      visible={open}
      onCancel={onClose}
      onOk={onClose}
      width={760}
      title={t('agent.bgProcess.panel.title', { defaultValue: 'Background Processes' })}
      okText={t('common.close', { defaultValue: 'Close' })}
      cancelText={null}
      footer={null}
      data-testid='bg-process-panel-drawer'
    >
      <div className='flex flex-col gap-12px'>
        {processes.length === 0 && !loading ? (
          <Empty description={t('agent.bgProcess.panel.empty', { defaultValue: 'No background processes running' })} />
        ) : (
          <Table
            rowKey='id'
            size='small'
            pagination={false}
            data={processes}
            columns={columns}
            data-testid='bg-process-table'
          />
        )}
        {outputProcess ? (
          <div
            className='mt-8px p-12px bg-1 border border-b-light rd-6px flex flex-col gap-8px'
            data-testid='bg-process-output-section'
          >
            <div className='flex items-center justify-between'>
              <Typography.Text className='text-13px font-medium'>
                {t('agent.bgProcess.panel.outputTitle', {
                  name: outputProcess.name || truncateCommand(outputProcess.command, 32),
                  defaultValue: `Output: ${outputProcess.name || truncateCommand(outputProcess.command, 32)}`,
                })}
              </Typography.Text>
              <Button size='mini' type='text' onClick={() => setOutputPid(null)} data-testid='bg-process-output-close'>
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
            </div>
            <BgProcessOutputViewer
              remoteAgentId={remoteAgentId}
              process={outputProcess}
              pollIntervalMs={outputPollIntervalMs}
            />
          </div>
        ) : null}
      </div>
    </Drawer>
  );
};

export default BgProcessPanel;
