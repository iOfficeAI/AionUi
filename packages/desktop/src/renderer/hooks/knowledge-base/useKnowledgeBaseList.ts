/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnowledgeBaseItem } from '@/renderer/pages/knowledge-base/types';
import { AIPAAS_BASE_URL } from '@/renderer/api';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useCallback, useEffect, useState } from 'react';

/**
 * 后端共享知识库原始记录结构。
 * 字段命名以后端 listJSON.do 响应为准；后续若新增字段可在此扩展。
 */
type SharedKnowledgeBaseRemoteRow = {
  id: string;
  name: string;
  flgPublicDesc?: string;
  statusDesc?: string;
  storageBase?: number;
  storageBaseDesc?: string;
  queryCount?: number | null;
  fileCount?: number | null;
  flgPublic?: number;
  capacity?: number | null;
  createTime?: string;
  scope?: string | null;
  relatedIndustry?: string | null;
  rowCount?: number | null;
  shareObject?: string;
  status?: number;
};

/**
 * 后端个人知识库原始记录结构。
 * 与共享列表共用同一字段子集；若服务端字段差异较大，后续按需扩展。
 */
type PersonalKnowledgeBaseRemoteRow = {
  id: string;
  name: string;
  flgPublicDesc?: string;
  statusDesc?: string;
  storageBaseDesc?: string;
  fileCount?: number | null;
  createTime?: string;
  shareObject?: string;
};

type ListEnvelope<TRow> = {
  Total?: number;
  Rows?: TRow[];
};

const mapSharedRemoteRowToItem = (row: SharedKnowledgeBaseRemoteRow): KnowledgeBaseItem => ({
  id: row.id,
  name: row.name,
  isShared: true,
  source: 'builtin',
  description: row.flgPublicDesc ?? row.storageBaseDesc ?? '',
  owner: row.shareObject,
  documentCount: typeof row.fileCount === 'number' ? row.fileCount : undefined,
  createdAt: row.createTime,
});

const mapPersonalRemoteRowToItem = (row: PersonalKnowledgeBaseRemoteRow): KnowledgeBaseItem => ({
  id: row.id,
  name: row.name,
  isShared: false,
  source: 'user',
  description: row.flgPublicDesc ?? row.storageBaseDesc ?? '',
  owner: row.shareObject,
  documentCount: typeof row.fileCount === 'number' ? row.fileCount : undefined,
  createdAt: row.createTime,
});

/**
 * Manages the knowledge base list: loading personal + shared entries from the
 * AIPaaS backend, tracking active selection. Both lists are fetched in
 * parallel on mount and on `loadKnowledgeBases()`.
 */
export const useKnowledgeBaseList = () => {
  const { user } = useAuth();
  const token = user?.token;

  const [personalItems, setPersonalItems] = useState<KnowledgeBaseItem[]>([]);
  const [sharedItems, setSharedItems] = useState<KnowledgeBaseItem[]>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [activeKnowledgeBaseId, setActiveKnowledgeBaseId] = useState<string | null>(null);

  const fetchList = async <TRow>(
    authToken: string,
    url: string,
    setLoading: (loading: boolean) => void,
    setError: (error: string | null) => void,
    setItems: (items: KnowledgeBaseItem[]) => void,
    map: (row: TRow) => KnowledgeBaseItem
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Token: authToken,
        },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as ListEnvelope<TRow>;
      const rows = Array.isArray(data?.Rows) ? data.Rows : [];
      setItems(rows.map(map));
    } catch (error) {
      console.error('[useKnowledgeBaseList] failed to load knowledge bases:', error);
      setError((error as Error).message || 'unknown error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSharedKnowledgeBases = useCallback(async (authToken: string) => {
    await fetchList<SharedKnowledgeBaseRemoteRow>(
      authToken,
      `${AIPAAS_BASE_URL}/jdbc/common/basecommonlist/listJSON.do?mdCode=share_knowledge_base`,
      setSharedLoading,
      setSharedError,
      setSharedItems,
      mapSharedRemoteRowToItem
    );
  }, []);

  const loadPersonalKnowledgeBases = useCallback(async (authToken: string) => {
    await fetchList<PersonalKnowledgeBaseRemoteRow>(
      authToken,
      `${AIPAAS_BASE_URL}/project/aiknowledge/aiknowledgebaselist/listJSON.do?mdCode=view_knowledge_user`,
      setPersonalLoading,
      setPersonalError,
      setPersonalItems,
      mapPersonalRemoteRowToItem
    );
  }, []);

  const loadKnowledgeBases = useCallback(async () => {
    if (!token) return;
    await Promise.all([loadPersonalKnowledgeBases(token), loadSharedKnowledgeBases(token)]);
  }, [loadPersonalKnowledgeBases, loadSharedKnowledgeBases, token]);

  useEffect(() => {
    void loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  const allItems = [...personalItems, ...sharedItems];
  const activeKnowledgeBase = allItems.find((item) => item.id === activeKnowledgeBaseId) ?? null;

  return {
    personalItems,
    setPersonalItems,
    sharedItems,
    setSharedItems,
    personalLoading,
    sharedLoading,
    personalError,
    sharedError,
    activeKnowledgeBaseId,
    setActiveKnowledgeBaseId,
    activeKnowledgeBase,
    loadKnowledgeBases,
    loadPersonalKnowledgeBases,
    loadSharedKnowledgeBases,
  };
};
