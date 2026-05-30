/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import AionModal from '@/renderer/components/base/AionModal';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { findShadowedPaths } from './configShadowDiff';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Input, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Branch, Copy, More, Refresh, ShareTwo, FileText, Setting } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { emitter } from '@/renderer/utils/emitter';
import { copyText } from '@/renderer/utils/ui/clipboard';

/** One file entry from OpenCode's `GET /session/{id}/diff` (`SnapshotFileDiff`). */
type SessionDiffEntry = {
  path?: string;
  file?: string;
  status?: string;
  additions?: number;
  deletions?: number;
  diff?: string;
};

/**
 * Session-level OpenCode actions surfaced in the conversation header (M01–M05):
 * fork, summarize/compact, share/unshare, restore reverted, and a file-changes
 * (diff) viewer. OpenCode remote conversations only.
 */
const RemoteSessionActions: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const conversation_id = conversation.id;

  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffEntries, setDiffEntries] = useState<SessionDiffEntry[]>([]);
  const [toolHost, setToolHost] = useState<'local' | 'server' | undefined>(undefined);
  const [protocol, setProtocol] = useState<string | undefined>(undefined);

  // M19: server global-config editor state.
  const [configOpen, setConfigOpen] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configText, setConfigText] = useState('');
  // Stash of the last server-confirmed config (pretty-printed). Used by the
  // "Revert changes" affordance so a bad edit never has to be reconstructed by
  // hand, and so we always PATCH from a known-good baseline (M19 §6).
  const [lastGoodConfig, setLastGoodConfig] = useState('');
  // M19 (Option A): dotted paths of the last save that were persisted to the
  // global layer but are overridden by a higher-precedence layer (project /
  // agent files), so they won't change behavior. Empty = all edits took effect.
  const [shadowedPaths, setShadowedPaths] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const extra = conversation.extra as { remoteAgentId?: string; remote_agent_id?: string } | undefined;
    const remoteAgentId = extra?.remoteAgentId || extra?.remote_agent_id;
    if (!remoteAgentId) return;
    void ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId }).then((agent) => {
      if (!cancelled) {
        setToolHost(agent?.tool_host ?? 'local');
        setProtocol(agent?.protocol);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [conversation.extra]);

  const runExclusive = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  // M01: fork the server session and open a new local conversation bound to it.
  const handleFork = () =>
    runExclusive(async () => {
      try {
        const { session_id } = await ipcBridge.conversation.forkRemoteSession.invoke({ conversation_id });
        const id = uuid();
        const source = (await getConversationOrNull(conversation_id)) || conversation;
        const created = await ipcBridge.conversation.createWithConversation.invoke({
          conversation: {
            ...source,
            id,
            name: t('conversation.session.forkName', { name: source.name, defaultValue: `Fork of ${source.name}` }),
            created_at: Date.now(),
            modified_at: Date.now(),
            extra: { ...source.extra, sessionKey: session_id, history_loaded: false },
          } as unknown as TChatConversation,
          preserve_session_key: true,
        });
        void navigate(`/conversation/${created.id}`);
        emitter.emit('chat.history.refresh');
        Message.success(t('conversation.session.forkSuccess', { defaultValue: 'Forked session' }));
      } catch (error) {
        Message.error(t('conversation.session.forkFailed', { defaultValue: 'Failed to fork session' }));
        console.error('[RemoteSessionActions] fork failed:', error);
      }
    });

  // M04: summarize/compact the session using its current model.
  const handleSummarize = () =>
    runExclusive(async () => {
      try {
        Message.info(t('conversation.session.summarizeStarted', { defaultValue: 'Summarizing session…' }));
        await ipcBridge.conversation.summarizeRemoteSession.invoke({ conversation_id });
        Message.success(
          t('conversation.session.summarizeSuccess', {
            defaultValue: 'Session summarized. Future replies will use the compacted context.',
          })
        );
      } catch (error) {
        Message.error(t('conversation.session.summarizeFailed', { defaultValue: 'Failed to summarize' }));
        console.error('[RemoteSessionActions] summarize failed:', error);
      }
    });

  // M02: restore all reverted messages.
  const handleUnrevert = () =>
    runExclusive(async () => {
      try {
        await ipcBridge.conversation.unrevertRemoteSession.invoke({ conversation_id });
        Message.success(t('conversation.session.unrevertSuccess', { defaultValue: 'Restored reverted messages' }));
      } catch (error) {
        Message.error(t('conversation.session.unrevertFailed', { defaultValue: 'Failed to restore messages' }));
        console.error('[RemoteSessionActions] unrevert failed:', error);
      }
    });

  // M03: share / unshare.
  const handleShare = () =>
    runExclusive(async () => {
      try {
        const { url } = await ipcBridge.conversation.shareRemoteSession.invoke({ conversation_id });
        setShareUrl(url);
      } catch (error) {
        Message.error(t('conversation.session.shareFailed', { defaultValue: 'Failed to share session' }));
        console.error('[RemoteSessionActions] share failed:', error);
      }
    });

  const handleUnshare = () =>
    runExclusive(async () => {
      try {
        await ipcBridge.conversation.unshareRemoteSession.invoke({ conversation_id });
        setShareUrl(null);
        Message.success(t('conversation.session.unshareSuccess', { defaultValue: 'Sharing disabled' }));
      } catch (error) {
        Message.error(t('conversation.session.unshareFailed', { defaultValue: 'Failed to unshare' }));
        console.error('[RemoteSessionActions] unshare failed:', error);
      }
    });

  // M05: load + show the session file diff.
  const handleViewChanges = () =>
    runExclusive(async () => {
      if (toolHost !== 'server') {
        Message.info(
          t('conversation.session.diffLocalMode', {
            defaultValue: 'Server diff is unavailable for local tool-host sessions.',
          })
        );
        return;
      }
      setDiffOpen(true);
      setDiffLoading(true);
      try {
        const result = await ipcBridge.conversation.remoteSessionDiff.invoke({ conversation_id });
        setDiffEntries(Array.isArray(result) ? (result as SessionDiffEntry[]) : []);
      } catch (error) {
        setDiffEntries([]);
        Message.error(t('conversation.session.diffFailed', { defaultValue: 'Failed to load changes' }));
        console.error('[RemoteSessionActions] diff failed:', error);
      } finally {
        setDiffLoading(false);
      }
    });

  // M19: load the server's global config into the editor (stashing a known-good
  // baseline). Discards any unsaved local edits.
  const loadConfig = async () => {
    setConfigLoading(true);
    setShadowedPaths([]);
    try {
      const config = await ipcBridge.conversation.getRemoteConfig.invoke({ conversation_id });
      const pretty = JSON.stringify(config ?? {}, null, 2);
      setConfigText(pretty);
      setLastGoodConfig(pretty);
    } catch (error) {
      Message.error(t('conversation.session.configLoadFailed', { defaultValue: 'Failed to load server config' }));
      console.error('[RemoteSessionActions] config load failed:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  const handleOpenConfig = () =>
    runExclusive(async () => {
      setConfigOpen(true);
      await loadConfig();
    });

  // M19: parse the editor JSON and PATCH it (shallow-merged server-side). The
  // server returns the new effective config, which becomes the new baseline.
  const handleSaveConfig = async () => {
    let partial: Record<string, unknown>;
    try {
      partial = JSON.parse(configText) as Record<string, unknown>;
    } catch {
      Message.error(t('conversation.session.configInvalidJson', { defaultValue: 'Config is not valid JSON' }));
      return;
    }
    if (typeof partial !== 'object' || partial === null || Array.isArray(partial)) {
      Message.error(t('conversation.session.configNotObject', { defaultValue: 'Config must be a JSON object' }));
      return;
    }
    // Baseline (pre-edit) used to compute exactly which paths the user changed.
    let baseline: Record<string, unknown> = {};
    try {
      baseline = JSON.parse(lastGoodConfig) as Record<string, unknown>;
    } catch {
      baseline = {};
    }
    setConfigSaving(true);
    try {
      const next = await ipcBridge.conversation.patchRemoteConfig.invoke({ conversation_id, partial });
      const pretty = JSON.stringify(next ?? {}, null, 2);
      setConfigText(pretty);
      setLastGoodConfig(pretty);
      Message.success(t('conversation.session.configSaved', { defaultValue: 'Server config saved' }));
      // Option A: detect edits shadowed by a higher-precedence config layer.
      // Best-effort — a failed effective-config read must not mask the save.
      try {
        const effective = await ipcBridge.conversation.getRemoteEffectiveConfig.invoke({ conversation_id });
        setShadowedPaths(findShadowedPaths(baseline, partial, effective));
      } catch (effErr) {
        setShadowedPaths([]);
        console.error('[RemoteSessionActions] effective-config read failed:', effErr);
      }
    } catch (error) {
      // The server body (e.g. read-only field rejection) is surfaced verbatim.
      Message.error(t('conversation.session.configSaveFailed', { defaultValue: 'Failed to save server config' }));
      console.error('[RemoteSessionActions] config save failed:', error);
    } finally {
      setConfigSaving(false);
    }
  };

  const menu = (
    <Menu
      onClickMenuItem={(key) => {
        switch (key) {
          case 'fork':
            void handleFork();
            break;
          case 'summarize':
            void handleSummarize();
            break;
          case 'changes':
            void handleViewChanges();
            break;
          case 'share':
            void handleShare();
            break;
          case 'unshare':
            void handleUnshare();
            break;
          case 'unrevert':
            void handleUnrevert();
            break;
          case 'config':
            void handleOpenConfig();
            break;
        }
      }}
    >
      <Menu.Item key='fork'>
        <div className='flex items-center gap-8px'>
          <Branch theme='outline' size='14' fill={iconColors.secondary} />
          <span>{t('conversation.session.fork', { defaultValue: 'Fork session' })}</span>
        </div>
      </Menu.Item>
      {toolHost === 'server' && (
        <Menu.Item key='changes'>
          <div className='flex items-center gap-8px'>
            <FileText theme='outline' size='14' fill={iconColors.secondary} />
            <span>{t('conversation.session.viewChanges', { defaultValue: 'View changes' })}</span>
          </div>
        </Menu.Item>
      )}
      <Menu.Item key='summarize'>
        <div className='flex items-center gap-8px'>
          <Refresh theme='outline' size='14' fill={iconColors.secondary} />
          <span>{t('conversation.session.summarize', { defaultValue: 'Summarize / compact' })}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='unrevert'>
        <div className='flex items-center gap-8px'>
          <Refresh theme='outline' size='14' fill={iconColors.secondary} />
          <span>{t('conversation.session.unrevert', { defaultValue: 'Restore reverted' })}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='share'>
        <div className='flex items-center gap-8px'>
          <ShareTwo theme='outline' size='14' fill={iconColors.secondary} />
          <span>{t('conversation.session.share', { defaultValue: 'Share session' })}</span>
        </div>
      </Menu.Item>
      <Menu.Item key='unshare'>
        <div className='flex items-center gap-8px'>
          <ShareTwo theme='outline' size='14' fill={iconColors.secondary} />
          <span>{t('conversation.session.unshare', { defaultValue: 'Unshare session' })}</span>
        </div>
      </Menu.Item>
      {protocol === 'opencode' && (
        <Menu.Item key='config'>
          <div className='flex items-center gap-8px'>
            <Setting theme='outline' size='14' fill={iconColors.secondary} />
            <span>{t('conversation.session.serverConfig', { defaultValue: 'Server config' })}</span>
          </div>
        </Menu.Item>
      )}
    </Menu>
  );

  return (
    <>
      <Dropdown droplist={menu} trigger='click' position='br'>
        <Tooltip content={t('conversation.session.actions', { defaultValue: 'Session actions' })}>
          <Button
            size='small'
            shape='circle'
            loading={busy}
            type='secondary'
            icon={<More theme='outline' size='16' fill={iconColors.secondary} />}
          />
        </Tooltip>
      </Dropdown>

      {/* M03: share URL modal */}
      <AionModal
        visible={shareUrl !== null}
        size='small'
        style={{ width: 460, height: 'auto' }}
        header={{ title: t('conversation.session.shareTitle', { defaultValue: 'Session shared' }), showClose: true }}
        contentStyle={{ padding: '20px 24px 0' }}
        onCancel={() => setShareUrl(null)}
        footer={{
          render: () => (
            <div className='flex justify-end gap-10px pt-20px'>
              <Button className='px-20px min-w-80px' style={{ borderRadius: 8 }} onClick={() => setShareUrl(null)}>
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
              <Button
                type='primary'
                className='px-20px min-w-80px'
                style={{ borderRadius: 8 }}
                onClick={() => {
                  if (shareUrl) {
                    void copyText(shareUrl).then(() => Message.success(t('messages.copySuccess')));
                  }
                }}
              >
                <span className='flex items-center gap-6px'>
                  <Copy theme='outline' size='14' />
                  {t('common.copy', { defaultValue: 'Copy' })}
                </span>
              </Button>
            </div>
          ),
        }}
      >
        <div className='flex flex-col gap-10px'>
          <div className='text-13px text-t-secondary leading-20px'>
            {t('conversation.session.shareHint', {
              defaultValue: 'Anyone with this link on the server network can view this conversation.',
            })}
          </div>
          <Input readOnly value={shareUrl ?? ''} />
        </div>
      </AionModal>

      {/* M05: changes / diff modal */}
      <AionModal
        visible={diffOpen}
        size='medium'
        header={{ title: t('conversation.session.changesTitle', { defaultValue: 'Session changes' }), showClose: true }}
        contentStyle={{ padding: '16px 24px', maxHeight: '60vh', overflow: 'auto' }}
        onCancel={() => setDiffOpen(false)}
        footer={{
          render: () => (
            <div className='flex justify-end pt-16px'>
              <Button className='px-20px min-w-80px' style={{ borderRadius: 8 }} onClick={() => setDiffOpen(false)}>
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
            </div>
          ),
        }}
      >
        {diffLoading ? (
          <div className='text-13px text-t-secondary py-20px text-center'>
            {t('common.loading', { defaultValue: 'Loading…' })}
          </div>
        ) : diffEntries.length === 0 ? (
          <div className='text-13px text-t-secondary py-20px text-center'>
            {t('conversation.session.noChanges', { defaultValue: 'No file changes in this session.' })}
          </div>
        ) : (
          <div className='flex flex-col gap-6px'>
            {diffEntries.map((entry, i) => {
              const path = entry.path ?? entry.file ?? '(unknown)';
              return (
                <div key={`${path}-${i}`} className='flex items-center justify-between gap-12px text-13px'>
                  <span className='font-mono truncate text-t-primary'>{path}</span>
                  <span className='shrink-0 font-mono text-12px'>
                    {typeof entry.additions === 'number' && (
                      <span className='text-[rgb(var(--success-6))]'>+{entry.additions}</span>
                    )}{' '}
                    {typeof entry.deletions === 'number' && (
                      <span className='text-[rgb(var(--danger-6))]'>-{entry.deletions}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </AionModal>

      {/* M19: server global-config editor */}
      <AionModal
        visible={configOpen}
        size='medium'
        header={{ title: t('conversation.session.serverConfigTitle', { defaultValue: 'Server config' }), showClose: true }}
        contentStyle={{ padding: '16px 24px' }}
        onCancel={() => setConfigOpen(false)}
        footer={{
          render: () => (
            <div className='flex items-center justify-between pt-16px'>
              <Button
                type='text'
                disabled={configLoading || configSaving}
                onClick={() => void loadConfig()}
              >
                <span className='flex items-center gap-6px'>
                  <Refresh theme='outline' size='14' />
                  {t('conversation.session.configReload', { defaultValue: 'Reload' })}
                </span>
              </Button>
              <div className='flex gap-10px'>
                <Button
                  className='px-20px min-w-80px'
                  style={{ borderRadius: 8 }}
                  disabled={configSaving || configText === lastGoodConfig}
                  onClick={() => {
                    setConfigText(lastGoodConfig);
                    setShadowedPaths([]);
                  }}
                >
                  {t('conversation.session.configRevert', { defaultValue: 'Revert changes' })}
                </Button>
                <Button
                  type='primary'
                  className='px-20px min-w-80px'
                  style={{ borderRadius: 8 }}
                  loading={configSaving}
                  disabled={configLoading || configText === lastGoodConfig}
                  onClick={() => void handleSaveConfig()}
                >
                  {t('common.save', { defaultValue: 'Save' })}
                </Button>
              </div>
            </div>
          ),
        }}
      >
        <div className='flex flex-col gap-10px'>
          <div className='text-12px text-t-secondary leading-18px'>
            {t('conversation.session.configRestartHint', {
              defaultValue: 'Edits are shallow-merged into the server config. Some changes (e.g. model defaults) may require restarting the OpenCode server to take effect.',
            })}
          </div>
          {shadowedPaths.length > 0 && (
            <div
              className='flex flex-col gap-4px rounded-8px px-12px py-10px text-12px leading-18px'
              style={{ background: 'rgb(var(--warning-1))', border: '1px solid rgb(var(--warning-3))' }}
            >
              <span className='font-medium text-[rgb(var(--warning-6))]'>
                {t('conversation.session.configShadowedTitle', {
                  defaultValue: 'Saved, but overridden by a higher-precedence config — these will NOT take effect:',
                })}
              </span>
              <ul className='m-0 pl-16px'>
                {shadowedPaths.map((p) => (
                  <li key={p} className='font-mono text-t-primary'>
                    {p}
                  </li>
                ))}
              </ul>
              <span className='text-t-secondary'>
                {t('conversation.session.configShadowedHint', {
                  defaultValue: 'A project-level opencode.json or an agent file defines these. Edit them at that layer (and restart the OpenCode server) for changes to apply.',
                })}
              </span>
            </div>
          )}
          {configLoading ? (
            <div className='text-13px text-t-secondary py-20px text-center'>
              {t('common.loading', { defaultValue: 'Loading…' })}
            </div>
          ) : (
            <Input.TextArea
              value={configText}
              onChange={(v) => {
                setConfigText(v);
                if (shadowedPaths.length > 0) setShadowedPaths([]);
              }}
              autoSize={{ minRows: 14, maxRows: 24 }}
              spellCheck={false}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
            />
          )}
        </div>
      </AionModal>
    </>
  );
};

export default RemoteSessionActions;
