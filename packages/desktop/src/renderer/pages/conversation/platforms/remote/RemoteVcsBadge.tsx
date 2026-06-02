/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AionModal from '@/renderer/components/base/AionModal';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Button, Tag, Tooltip } from '@arco-design/web-react';
import { Branch } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type VcsInfo = { branch?: string; default_branch?: string };
type VcsFileStatus = {
  file: string;
  additions: number;
  deletions: number;
  status: 'added' | 'deleted' | 'modified';
};
type VcsFileDiff = {
  file: string;
  patch?: string;
  additions: number;
  deletions: number;
  status?: 'added' | 'deleted' | 'modified';
};

/**
 * M16 — conversation-header pill showing the remote OpenCode server's VCS
 * state: current branch name and a "(N)" suffix when there are uncommitted
 * changes. Renders nothing for non-opencode remote agents or when the server's
 * working tree isn't a git repo (no branch returned).
 *
 * Clicking opens a modal that lists changed files and lets the user toggle
 * each entry's per-file unified-diff inline. The patch is read from the
 * structured `/vcs/diff?mode=git` response; `/vcs/apply` is intentionally
 * NOT exposed here because the M16 plan flags it as potentially destructive
 * (overwrite working tree) and asks for a separate confirm-twice flow.
 */
const RemoteVcsBadge: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const [isOpencodeServerMode, setIsOpencodeServerMode] = useState(false);
  const [info, setInfo] = useState<VcsInfo | null>(null);
  const [statusRows, setStatusRows] = useState<VcsFileStatus[] | null>(null);
  const [diffRows, setDiffRows] = useState<VcsFileDiff[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getConversationOrNull(conversation_id).then(async (res) => {
      const extra = res?.extra as { remoteAgentId?: string; remote_agent_id?: string } | undefined;
      const remoteAgentId = extra?.remoteAgentId || extra?.remote_agent_id;
      if (!remoteAgentId) return;
      const agent = await ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId });
      if (cancelled) return;
      // M16 is meaningful only in server-tools mode: `/vcs` reports the
      // OpenCode server's own working-tree state, not the user's local
      // project (which the server can't see). Per the plan §3.3, this
      // indicator is gated to server mode.
      setIsOpencodeServerMode(agent?.protocol === 'opencode' && agent?.tool_host === 'server');
    });
    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vcsInfo, rows, diff] = await Promise.all([
        ipcBridge.conversation.getRemoteVcsInfo.invoke({ conversation_id }).catch(() => ({}) as VcsInfo),
        ipcBridge.conversation.getRemoteVcsStatus.invoke({ conversation_id }).catch(() => [] as VcsFileStatus[]),
        ipcBridge.conversation.getRemoteVcsDiff.invoke({ conversation_id, mode: 'git' }).catch(() => [] as VcsFileDiff[]),
      ]);
      setInfo(vcsInfo ?? {});
      setStatusRows(Array.isArray(rows) ? rows : []);
      setDiffRows(Array.isArray(diff) ? diff : []);
    } finally {
      setLoading(false);
    }
  }, [conversation_id]);

  useEffect(() => {
    if (!isOpencodeServerMode) return;
    void fetchAll();
  }, [isOpencodeServerMode, fetchAll]);

  if (!isOpencodeServerMode || !info?.branch) return null;

  const changeCount = statusRows?.length ?? 0;
  const label = changeCount > 0 ? `${info.branch} (${changeCount})` : info.branch;
  const tooltip = changeCount > 0
    ? t('conversation.remoteVcs.tooltipWithChanges', {
        branch: info.branch,
        count: changeCount,
        defaultValue: `${info.branch} — ${changeCount} uncommitted change${changeCount === 1 ? '' : 's'}`,
      })
    : t('conversation.remoteVcs.tooltipClean', {
        branch: info.branch,
        defaultValue: `${info.branch} — working tree clean`,
      });

  const findPatchFor = (file: string) => diffRows?.find((d) => d.file === file)?.patch ?? '';

  return (
    <>
      <Tooltip content={tooltip}>
        <Tag
          size='small'
          color={changeCount > 0 ? 'orange' : 'arcoblue'}
          checkable
          icon={<Branch theme='outline' size='12' />}
          onClick={() => {
            setOpen(true);
            void fetchAll();
          }}
        >
          {label}
        </Tag>
      </Tooltip>
      <AionModal
        visible={open}
        size='medium'
        style={{ width: 720, height: 'auto' }}
        header={{
          title: t('conversation.remoteVcs.modalTitle', { defaultValue: 'Server repository status' }),
          showClose: true,
        }}
        contentStyle={{ padding: '16px 24px 24px' }}
        onCancel={() => {
          setOpen(false);
          setExpanded(null);
        }}
        footer={{
          render: () => (
            <div className='flex justify-end gap-10px pt-20px'>
              <Button
                className='px-20px min-w-80px'
                style={{ borderRadius: 'var(--radius-control)' }}
                loading={loading}
                onClick={() => void fetchAll()}
              >
                {t('common.refresh', { defaultValue: 'Refresh' })}
              </Button>
              <Button
                type='primary'
                className='px-20px min-w-80px'
                style={{ borderRadius: 'var(--radius-control)' }}
                onClick={() => {
                  setOpen(false);
                  setExpanded(null);
                }}
              >
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
            </div>
          ),
        }}
      >
        <div className='flex flex-col gap-12px'>
          <div className='text-13px text-t-secondary leading-20px'>
            {info.branch}
            {info.default_branch && info.default_branch !== info.branch ? (
              <span className='ml-8px text-t-tertiary'>
                {t('conversation.remoteVcs.defaultBranch', {
                  defaultBranch: info.default_branch,
                  defaultValue: `(default: ${info.default_branch})`,
                })}
              </span>
            ) : null}
          </div>
          {(statusRows?.length ?? 0) === 0 ? (
            <div className='text-13px text-t-secondary leading-20px'>
              {t('conversation.remoteVcs.clean', { defaultValue: 'Working tree clean.' })}
            </div>
          ) : (
            <ul className='flex flex-col gap-6px m-0 p-0 list-none'>
              {statusRows!.map((row) => {
                const isOpen = expanded === row.file;
                const patch = findPatchFor(row.file);
                return (
                  <li key={row.file} className='flex flex-col gap-4px'>
                    <button
                      type='button'
                      className='flex items-center justify-between gap-12px py-4px px-8px rounded-6px hover:bg-fill-1 bg-transparent border-none cursor-pointer text-left'
                      onClick={() => setExpanded(isOpen ? null : row.file)}
                    >
                      <span className='flex items-center gap-8px min-w-0 flex-1'>
                        <Tag
                          size='small'
                          color={row.status === 'added' ? 'green' : row.status === 'deleted' ? 'red' : 'orange'}
                        >
                          {row.status}
                        </Tag>
                        <span className='text-13px truncate' title={row.file}>
                          {row.file}
                        </span>
                      </span>
                      <span className='text-12px shrink-0'>
                        <span className='text-success'>+{row.additions}</span>{' '}
                        <span className='text-danger'>-{row.deletions}</span>
                      </span>
                    </button>
                    {isOpen && patch ? (
                      <pre className='m-0 p-12px rounded-6px bg-fill-1 text-12px leading-18px font-mono whitespace-pre overflow-x-auto'>
                        {patch}
                      </pre>
                    ) : null}
                    {isOpen && !patch ? (
                      <div className='px-12px py-8px text-12px text-t-secondary'>
                        {t('conversation.remoteVcs.noPatch', {
                          defaultValue: '(no patch available for this file)',
                        })}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AionModal>
    </>
  );
};

export default RemoteVcsBadge;
