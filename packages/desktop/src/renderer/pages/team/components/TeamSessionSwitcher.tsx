// src/renderer/pages/team/components/TeamSessionSwitcher.tsx
//
// Header control that lets the user pick, create, rename, and delete working
// sessions for a team (migration 030). The active session drives which
// conversation each agent slot displays.

import { Dropdown, Input, Menu, Message, Modal } from '@arco-design/web-react';
import { Down, Plus, Edit, Delete } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TTeamSession } from '@/common/types/team/teamTypes';
import { useTeamActiveSession } from '../hooks/useTeamActiveSession';
import styles from './TeamSessionSwitcher.module.css';

type Props = {
  teamId: string;
  activeSessionId: string | undefined;
  /** Notified after a session switch so the parent can refresh team state. */
  onSessionChanged?: () => void;
};

const TeamSessionSwitcher: React.FC<Props> = ({ teamId, activeSessionId, onSessionChanged }) => {
  const { t } = useTranslation();
  const { sessions, createSession, renameSession, deleteSession, switchSession } = useTeamActiveSession(
    teamId,
    activeSessionId
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameTarget, setRenameTarget] = useState<TTeamSession | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TTeamSession | null>(null);

  const activeSession = useMemo(() => sessions.find((s) => s.id === activeSessionId), [sessions, activeSessionId]);

  // Backends that predate multi-session support expose no sessions list (the
  // /sessions endpoints exist but the team has no session rows). In that case
  // show nothing — the team behaves as single-session, exactly as before.
  if (sessions.length === 0) return null;

  const handleSwitch = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      try {
        await switchSession(sessionId);
        onSessionChanged?.();
      } catch (error) {
        Message.error(t('team.session.switchFailed'));
      }
    },
    [activeSessionId, switchSession, onSessionChanged, t]
  );

  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    try {
      await createSession(name || undefined);
      setCreateOpen(false);
      setCreateName('');
      onSessionChanged?.();
    } catch (error) {
      Message.error(t('team.session.createFailed'));
    }
  }, [createName, createSession, onSessionChanged, t]);

  const handleRename = useCallback(async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      await renameSession(renameTarget.id, name);
      setRenameTarget(null);
      setRenameValue('');
    } catch (error) {
      Message.error(t('team.session.renameFailed'));
    }
  }, [renameTarget, renameValue, renameSession, t]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteSession(deleteTarget.id);
      setDeleteTarget(null);
      onSessionChanged?.();
    } catch (error) {
      Message.error(t('team.session.deleteFailed'));
    }
  }, [deleteTarget, deleteSession, onSessionChanged, t]);

  const menu = (
    <Menu onClickMenuItem={(key) => handleSwitch(key)}>
      {sessions.map((session) => (
        <Menu.Item key={session.id} className={session.id === activeSessionId ? styles.activeItem : undefined}>
          <div className={styles.itemRow}>
            <span className={styles.itemName}>
              {session.name}
              {session.is_primary ? <span className={styles.primaryTag}>{t('team.session.primary')}</span> : null}
            </span>
            {!session.is_primary ? (
              <span className={styles.itemActions}>
                <Edit
                  className={styles.iconAction}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setRenameTarget(session);
                    setRenameValue(session.name);
                  }}
                />
                <Delete
                  className={styles.iconAction}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setDeleteTarget(session);
                  }}
                />
              </span>
            ) : null}
          </div>
        </Menu.Item>
      ))}
      <Menu.Item
        key='__new__'
        onClick={() => {
          setCreateOpen(true);
        }}
      >
        <span className={styles.newItem}>
          <Plus />
          {t('team.session.new')}
        </span>
      </Menu.Item>
    </Menu>
  );

  return (
    <div className={styles.wrapper}>
      <Dropdown trigger='click' droplist={menu} position='bl'>
        <button type='button' className={styles.trigger} title={t('team.session.switchTo')}>
          <span className={styles.triggerLabel}>{activeSession?.name ?? t('team.session.primary')}</span>
          <Down className={styles.triggerCaret} />
        </button>
      </Dropdown>

      <Modal
        title={t('team.session.new')}
        visible={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setCreateName('');
        }}
        onOk={handleCreate}
        okText={t('team.session.createOk')}
        cancelText={t('team.session.cancel')}
      >
        <Input
          placeholder={t('team.session.namePlaceholder')}
          value={createName}
          onChange={setCreateName}
          onPressEnter={handleCreate}
        />
      </Modal>

      <Modal
        title={t('team.session.rename')}
        visible={Boolean(renameTarget)}
        onCancel={() => {
          setRenameTarget(null);
          setRenameValue('');
        }}
        onOk={handleRename}
        okText={t('common.ok')}
        cancelText={t('team.session.cancel')}
      >
        <Input
          placeholder={t('team.session.namePlaceholder')}
          value={renameValue}
          onChange={setRenameValue}
          onPressEnter={handleRename}
        />
      </Modal>

      <Modal
        title={t('team.session.delete')}
        visible={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onOk={handleDelete}
        okText={t('team.session.deleteOk')}
        cancelText={t('team.session.cancel')}
      >
        <p>{t('team.session.deleteConfirm', { name: deleteTarget?.name ?? '' })}</p>
      </Modal>
    </div>
  );
};

export default TeamSessionSwitcher;
