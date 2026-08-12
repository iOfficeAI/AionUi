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

type SharedKnowledgeBaseResponse = {
  Total?: number;
  Rows?: SharedKnowledgeBaseRemoteRow[];
};

const mapRemoteRowToItem = (row: SharedKnowledgeBaseRemoteRow): KnowledgeBaseItem => ({
  id: row.id,
  name: row.name,
  isShared: true,
  source: 'builtin',
  description: row.flgPublicDesc ?? row.storageBaseDesc ?? '',
  owner: row.shareObject,
  documentCount: typeof row.fileCount === 'number' ? row.fileCount : undefined,
  createdAt: row.createTime,
});

/**
 * Manages the knowledge base list: loading from backend, tracking active selection.
 * Personal items remain mocked; shared items are fetched from the AIPaaS backend.
 */
export const useKnowledgeBaseList = () => {
  const { user } = useAuth();
  const token = user?.token;

  const [personalItems, setPersonalItems] = useState<KnowledgeBaseItem[]>([
    {
      id: 'p1',
      name: '产品文档',
      description: '产品相关的需求文档和设计稿',
      isShared: false,
      source: 'user',
      documentCount: 12,
      updatedAt: '2026-07-15',
    },
    {
      id: 'p2',
      name: '学习笔记',
      description: '读书笔记和技术学习记录',
      isShared: false,
      source: 'user',
      documentCount: 8,
      updatedAt: '2026-07-10',
    },
  ]);
  const [sharedItems, setSharedItems] = useState<KnowledgeBaseItem[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [activeKnowledgeBaseId, setActiveKnowledgeBaseId] = useState<string | null>(null);

  const loadSharedKnowledgeBases = useCallback(async (authToken: string) => {
    setSharedLoading(true);
    setSharedError(null);
    try {
      const response = await fetch(
        `${AIPAAS_BASE_URL}/jdbc/common/basecommonlist/listJSON.do?mdCode=share_knowledge_base`,
        {
          method: 'GET',
          headers: {
            Token: authToken,
          },
          credentials: 'include',
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as SharedKnowledgeBaseResponse;
      const rows = Array.isArray(data?.Rows) ? data.Rows : [];
      setSharedItems(rows.map(mapRemoteRowToItem));
    } catch (error) {
      console.error('[useKnowledgeBaseList] failed to load shared knowledge bases:', error);
      setSharedError((error as Error).message || 'unknown error');
      setSharedItems([]);
    } finally {
      setSharedLoading(false);
    }
  }, []);

  const loadKnowledgeBases = useCallback(async () => {
    if (!token) return;
    await loadSharedKnowledgeBases(token);
  }, [loadSharedKnowledgeBases, token]);

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
    sharedLoading,
    sharedError,
    activeKnowledgeBaseId,
    setActiveKnowledgeBaseId,
    activeKnowledgeBase,
    loadKnowledgeBases,
  };
};
