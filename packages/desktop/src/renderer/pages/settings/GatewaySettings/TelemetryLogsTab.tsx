/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Input, Message, Popconfirm, Select, Table, Tag } from '@arco-design/web-react';
import { Clear, History, Refresh, Search, Time } from '@icon-park/react';
import type { GatewayTelemetryLog } from './types';

export const TelemetryLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<GatewayTelemetryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'fallback_success' | 'failed'>('all');
  const [selectedLog, setSelectedLog] = useState<GatewayTelemetryLog | null>(null);

  const fetchLogs = async () => {
    if (!window.electronAPI?.gatewayGetLogs) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.gatewayGetLogs({ limit: 200 });
      if (res.success && res.data) {
        setLogs(res.data.logs || []);
      }
    } catch (err) {
      console.error('[TelemetryLogsTab] Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Listen for live incoming logs from Gateway
    if (window.electronAPI?.onGatewayLogAdded) {
      const unsubscribe = window.electronAPI.onGatewayLogAdded((newLog) => {
        setLogs((prev) => [newLog as GatewayTelemetryLog, ...prev.slice(0, 499)]);
      });
      return () => {
        unsubscribe();
      };
    }
    return undefined;
  }, []);

  const handleClearLogs = async () => {
    if (!window.electronAPI?.gatewayClearLogs) return;
    try {
      await window.electronAPI.gatewayClearLogs();
      setLogs([]);
      Message.success('Telemetry logs cleared');
    } catch {
      Message.error('Failed to clear logs');
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (statusFilter !== 'all' && log.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchModel = log.requestedModelOrCombo.toLowerCase().includes(q);
        const matchAcc = log.resolvedAccountName.toLowerCase().includes(q);
        const matchResolvedModel = log.resolvedModel.toLowerCase().includes(q);
        if (!matchModel && !matchAcc && !matchResolvedModel) return false;
      }
      return true;
    });
  }, [logs, search, statusFilter]);

  const columns = [
    {
      title: 'Time',
      dataIndex: 'timestamp',
      width: 100,
      render: (ts: number) => {
        const d = new Date(ts);
        return <span className='text-12px font-mono text-t-secondary'>{d.toLocaleTimeString()}</span>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 140,
      render: (status: string, record: GatewayTelemetryLog) => {
        if (status === 'fallback_success') {
          return (
            <Tag color='gold' size='small' className='cursor-pointer' onClick={() => setSelectedLog(record)}>
              FALLBACK ({record.fallbackAttempts.length})
            </Tag>
          );
        }
        if (status === 'success') {
          return (
            <Tag color='green' size='small'>
              200 OK
            </Tag>
          );
        }
        return (
          <Tag color='red' size='small' className='cursor-pointer' onClick={() => setSelectedLog(record)}>
            FAILED ({record.statusCode || 500})
          </Tag>
        );
      },
    },
    {
      title: 'Requested Combo / Model',
      dataIndex: 'requestedModelOrCombo',
      render: (val: string) => <span className='font-mono font-medium text-13px text-t-primary'>{val}</span>,
    },
    {
      title: 'Resolved Provider & Model',
      render: (_: unknown, record: GatewayTelemetryLog) => (
        <div className='flex items-center gap-6px text-12px'>
          <span className='font-semibold text-primary-6'>{record.resolvedAccountName}</span>
          <span className='opacity-40'>➔</span>
          <span className='font-mono text-t-secondary'>{record.resolvedModel}</span>
        </div>
      ),
    },
    {
      title: 'Tokens Breakdown',
      width: 220,
      render: (_: unknown, record: GatewayTelemetryLog) => {
        const { promptTokens, completionTokens, cachedTokens, thoughtTokens, totalTokens } = record.tokens;
        return (
          <div className='flex flex-col gap-2px text-11px font-mono'>
            <div className='flex items-center justify-between font-semibold text-t-primary'>
              <span>Total: {totalTokens.toLocaleString()}</span>
              <span className='text-t-secondary'>
                ({promptTokens} in / {completionTokens} out)
              </span>
            </div>
            {(Boolean(cachedTokens && cachedTokens > 0) || Boolean(thoughtTokens && thoughtTokens > 0)) && (
              <div className='flex items-center gap-4px mt-2px'>
                {cachedTokens && cachedTokens > 0 ? (
                  <Tag color='cyan' size='small'>
                    Cache: {cachedTokens.toLocaleString()}
                  </Tag>
                ) : null}
                {thoughtTokens && thoughtTokens > 0 ? (
                  <Tag color='purple' size='small'>
                    Reasoning: {thoughtTokens.toLocaleString()}
                  </Tag>
                ) : null}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Latency',
      dataIndex: 'latencyMs',
      width: 100,
      render: (ms: number) => {
        const color = ms < 1500 ? 'text-green-6' : ms < 4000 ? 'text-orange-6' : 'text-red-6';
        return <span className={`text-12px font-mono font-medium ${color}`}>{(ms / 1000).toFixed(2)}s</span>;
      },
    },
    {
      title: 'Trace',
      width: 80,
      render: (_: unknown, record: GatewayTelemetryLog) => (
        <Button type='text' size='mini' icon={<History />} onClick={() => setSelectedLog(record)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex items-center justify-between flex-wrap gap-8px'>
        <div>
          <div className='text-16px font-600 text-t-primary'>Token Observability & Execution Logs</div>
          <div className='text-12px text-t-secondary'>
            Real-time per-request telemetry just like OmniRoute, displaying exact input, output, prompt cache, reasoning
            tokens, and fallback waterfall traces.
          </div>
        </div>
        <div className='flex items-center gap-8px'>
          <Button type='secondary' size='small' icon={<Refresh />} loading={loading} onClick={fetchLogs}>
            Refresh
          </Button>
          <Popconfirm title='Clear all telemetry logs?' onOk={handleClearLogs}>
            <Button type='outline' status='danger' size='small' icon={<Clear />} disabled={logs.length === 0}>
              Clear Logs
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* Filter Bar */}
      <div className='flex items-center gap-12px flex-wrap bg-fill-1 p-10px rd-8px border border-border-1'>
        <div className='w-240px'>
          <Input
            size='small'
            prefix={<Search />}
            placeholder='Search combo or model...'
            value={search}
            onChange={setSearch}
            allowClear
          />
        </div>
        <div className='w-160px'>
          <Select size='small' value={statusFilter} onChange={setStatusFilter}>
            <Select.Option value='all'>All Statuses</Select.Option>
            <Select.Option value='success'>Success (200)</Select.Option>
            <Select.Option value='fallback_success'>Fallback Succeeded</Select.Option>
            <Select.Option value='failed'>Failed</Select.Option>
          </Select>
        </div>
        <div className='text-12px text-t-secondary ms-auto'>
          Showing {filteredLogs.length} of {logs.length} logged requests
        </div>
      </div>

      {/* Table */}
      <Table
        rowKey='id'
        data={filteredLogs}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 15, size: 'small', showTotal: true }}
        border={{ wrapper: true, cell: false }}
        className='rd-8px overflow-hidden shadow-xs'
      />

      {/* Detail Drawer */}
      <Drawer
        title='Request Execution & Fallback Trace'
        visible={Boolean(selectedLog)}
        onCancel={() => setSelectedLog(null)}
        footer={null}
        width={520}
      >
        {selectedLog && (
          <div className='flex flex-col gap-16px text-13px'>
            <div className='p-12px bg-fill-1 rd-8px border border-border-1'>
              <div className='text-11px uppercase font-semibold text-t-secondary mb-4px'>Requested Target</div>
              <div className='font-mono font-bold text-16px text-t-primary mb-6px'>
                {selectedLog.requestedModelOrCombo}
              </div>
              <div className='flex items-center gap-8px text-12px'>
                <span className='text-t-secondary'>Final Provider:</span>
                <span className='font-semibold text-primary-6'>{selectedLog.resolvedAccountName}</span>
                <span className='text-t-secondary'>Model:</span>
                <span className='font-mono text-t-primary'>{selectedLog.resolvedModel}</span>
              </div>
            </div>

            {/* Fallback Attempts */}
            <div>
              <div className='text-13px font-600 text-t-primary mb-8px flex items-center gap-6px'>
                <Time /> Routing & Waterfall Trace
              </div>
              {selectedLog.fallbackAttempts.length === 0 ? (
                <div className='p-10px bg-green-1 text-green-7 border border-green-3 rd-8px text-12px'>
                  Primary target responded successfully on first attempt (No fallback required).
                </div>
              ) : (
                <div className='flex flex-col gap-8px'>
                  {selectedLog.fallbackAttempts.map((att, i) => (
                    <div key={i} className='p-10px bg-red-1 border border-red-2 rd-8px text-12px'>
                      <div className='flex items-center justify-between font-semibold text-red-7 mb-4px'>
                        <span>
                          Step #{i + 1}: {att.accountName} ({att.model})
                        </span>
                        <span>HTTP {att.statusCode || 'Err'}</span>
                      </div>
                      <div className='font-mono text-11px text-red-6 break-all bg-white dark:bg-black p-6px rd-4px border border-red-2'>
                        {att.error}
                      </div>
                    </div>
                  ))}
                  <div className='p-10px bg-green-1 text-green-7 border border-green-3 rd-8px text-12px font-medium'>
                    Step #{selectedLog.fallbackAttempts.length + 1}: {selectedLog.resolvedAccountName} (
                    {selectedLog.resolvedModel}) answered successfully!
                  </div>
                </div>
              )}
            </div>

            {/* Token Detail Breakdown */}
            <div className='p-12px bg-fill-1 rd-8px border border-border-1'>
              <div className='text-13px font-600 text-t-primary mb-8px'>Token Telemetry Breakdown</div>
              <div className='grid grid-cols-2 gap-8px font-mono text-12px'>
                <div className='p-8px bg-fill-2 rd-6px'>
                  <div className='text-t-secondary text-10px uppercase'>Prompt Tokens</div>
                  <div className='font-bold text-14px'>{selectedLog.tokens.promptTokens.toLocaleString()}</div>
                </div>
                <div className='p-8px bg-fill-2 rd-6px'>
                  <div className='text-t-secondary text-10px uppercase'>Completion Tokens</div>
                  <div className='font-bold text-14px'>{selectedLog.tokens.completionTokens.toLocaleString()}</div>
                </div>
                <div className='p-8px bg-fill-2 rd-6px'>
                  <div className='text-t-secondary text-10px uppercase'>Cached Prompt Tokens</div>
                  <div className='font-bold text-14px text-cyan-6'>
                    {(selectedLog.tokens.cachedTokens || 0).toLocaleString()}
                  </div>
                </div>
                <div className='p-8px bg-fill-2 rd-6px'>
                  <div className='text-t-secondary text-10px uppercase'>Reasoning Tokens</div>
                  <div className='font-bold text-14px text-purple-6'>
                    {(selectedLog.tokens.thoughtTokens || 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className='mt-8px pt-8px border-t border-border-1 flex items-center justify-between text-13px font-bold'>
                <span>Total Tokens:</span>
                <span>{selectedLog.tokens.totalTokens.toLocaleString()}</span>
              </div>
            </div>

            <div className='text-11px font-mono text-t-secondary'>
              Request ID: {selectedLog.id} · Timestamp: {new Date(selectedLog.timestamp).toISOString()}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
