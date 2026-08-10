/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { adminAudit } from '@/common/adapter/ipcBridge';
import type { AdminAuditEntry } from '@/common/types/platform/auth';
import { Alert, Button, Message, Table, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { accountErrorMessage, isAccountFeatureUnavailable, isAccountRateLimited } from './accountUi';

const ACTION_LABELS: Record<string, string> = {
  'user.created': 'settings.account.audit.actions.userCreated',
  'user.username_changed': 'settings.account.audit.actions.usernameChanged',
  'user.role_changed': 'settings.account.audit.actions.roleChanged',
  'user.site_role_changed': 'settings.account.audit.actions.roleChanged',
  'user.status_changed': 'settings.account.audit.actions.statusChanged',
  'user.password_reset': 'settings.account.audit.actions.passwordReset',
  'user.password_changed': 'settings.account.audit.actions.passwordChanged',
  'user.sessions_revoked': 'settings.account.audit.actions.sessionsRevoked',
  'bootstrap.credentials_set': 'settings.account.audit.actions.bootstrapCredentialsSet',
};

const AuditPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadAudit = useCallback(
    async (cursor?: string) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      try {
        const page = await adminAudit.list.invoke({ cursor, limit: 50 });
        setEntries((current) => (cursor ? [...current, ...(page.items ?? [])] : (page.items ?? [])));
        setNextCursor(page.next_cursor ?? null);
        setUnavailable(false);
        setLoadError(null);
      } catch (error) {
        if (isAccountFeatureUnavailable(error)) {
          setUnavailable(true);
          setLoadError(null);
        } else {
          setUnavailable(false);
          setLoadError(accountErrorMessage(error, t));
          if (!isAccountRateLimited(error) && !cursor) {
            Message.error(accountErrorMessage(error, t));
          }
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingRef.current = false;
      }
    },
    [t]
  );

  useEffect(() => {
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load
  }, []);

  const columns = useMemo(
    () => [
      {
        title: t('settings.account.audit.time'),
        dataIndex: 'occurred_at',
        width: 180,
        render: (value: number) => new Date(value).toLocaleString(i18n.language),
      },
      {
        title: t('settings.account.audit.actor'),
        dataIndex: 'actor_username',
        width: 140,
        render: (value: string | null) => value ?? t('common.system'),
      },
      {
        title: t('settings.account.audit.action'),
        dataIndex: 'action',
        render: (value: string) => (ACTION_LABELS[value] ? t(ACTION_LABELS[value]) : value),
      },
      {
        title: t('settings.account.audit.target'),
        dataIndex: 'target_username',
        width: 140,
        render: (value: string | null) => value ?? '—',
      },
    ],
    [i18n.language, t]
  );

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex flex-wrap items-start justify-between gap-12px'>
        <div className='min-w-0'>
          <Typography.Text className='text-16px font-500 text-t-primary'>
            {t('settings.account.audit.title')}
          </Typography.Text>
          <div className='mt-4px text-13px text-t-secondary'>{t('settings.account.audit.description')}</div>
        </div>
        <Button icon={<Refresh theme='outline' size={15} />} onClick={() => void loadAudit()} disabled={loading}>
          {t('common.refresh')}
        </Button>
      </div>

      {unavailable ? <Alert type='info' content={t('settings.account.errors.featureUnavailable')} /> : null}
      {loadError ? <Alert type='error' content={loadError} closable onClose={() => setLoadError(null)} /> : null}

      {!unavailable ? (
        <div className='overflow-hidden rd-12px border border-border-2 bg-bg-2'>
          <Table
            rowKey='id'
            loading={loading}
            columns={columns}
            data={entries}
            pagination={false}
            scroll={{ x: 720 }}
            noDataElement={
              <div className='py-32px text-center text-t-secondary'>{t('settings.account.audit.empty')}</div>
            }
          />
        </div>
      ) : null}

      {nextCursor ? (
        <div className='flex justify-center'>
          <Button loading={loadingMore} onClick={() => void loadAudit(nextCursor)}>
            {t('settings.account.audit.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default AuditPanel;
