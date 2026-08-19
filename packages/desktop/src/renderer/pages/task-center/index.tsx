/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button, Message } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import type { ITaskCenterRow } from '@/common/adapter/ipcBridge';
import { useTaskCenterList } from './useTaskCenterList';
import TaskCenterFilterBar, { type ProjectOption } from './TaskCenterFilterBar';
import TaskCenterTable from './TaskCenterTable';
import TaskCenterDetailModal from './TaskCenterDetailModal';
import styles from './TaskCenter.module.css';

const TaskCenterPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  const token = user?.token ?? '';
  const list = useTaskCenterList(token);
  const [detailItem, setDetailItem] = useState<ITaskCenterRow | null>(null);

  const projects = useMemo<ProjectOption[]>(() => {
    const seen = new Map<string, ProjectOption>();
    for (const item of list.items) {
      if (item.projectId && !seen.has(item.projectId)) {
        seen.set(item.projectId, { id: item.projectId, name: item.projectName || item.projectId });
      }
    }
    return Array.from(seen.values());
  }, [list.items]);

  if (status === 'checking') {
    return <div className='flex size-full items-center justify-center' />;
  }

  return (
    <div className={styles.taskCenter}>
      <div className={styles.taskCenter__scroll}>
        <div className={styles.taskCenter__inner}>
          <div className={styles.taskCenter__header}>
            <h1 className={styles.taskCenter__title}>{String(t('taskCenter.title'))}</h1>
            <p className={styles.taskCenter__subtitle}>{String(t('taskCenter.subtitle'))}</p>
          </div>

          <TaskCenterFilterBar
            keyword={list.keyword}
            urgency={list.urgency}
            projectId={list.projectId}
            type={list.type}
            projects={projects}
            onKeywordChange={list.setKeyword}
            onUrgencyChange={list.setUrgency}
            onProjectChange={list.setProjectId}
            onTypeChange={list.setType}
            onReset={list.reset}
          />

          {list.error && (
            <div className={styles.taskCenter__error}>
              <Message type='error' content={list.error} />
              <Button className='mt-8px' onClick={list.reload}>
                {String(t('taskCenter.retry'))}
              </Button>
            </div>
          )}

          <div className='mt-12px'>
            <TaskCenterTable
              items={list.items}
              total={list.total}
              pageNo={list.pageNo}
              perPageSize={list.perPageSize}
              loading={list.loading}
              onPageChange={list.setPageNo}
              onPerPageSizeChange={list.setPerPageSize}
              onView={setDetailItem}
            />
          </div>
        </div>
      </div>

      <TaskCenterDetailModal
        visible={detailItem !== null}
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </div>
  );
};

export default TaskCenterPage;