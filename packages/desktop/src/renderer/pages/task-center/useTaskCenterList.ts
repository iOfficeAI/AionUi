/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type { ITaskCenterRow } from '@/common/adapter/ipcBridge';
import { TASK_CENTER_DEFAULT_PER_PAGE_SIZE } from '@/common/config/taskCenter.config';

export interface UseTaskCenterListResult {
  items: ITaskCenterRow[];
  total: number;
  loading: boolean;
  error: string | null;
  keyword: string;
  urgency: number | 'all';
  projectId: string | 'all';
  type: number | 'all';
  pageNo: number;
  perPageSize: number;
  setKeyword: (v: string) => void;
  setUrgency: (v: number | 'all') => void;
  setProjectId: (v: string | 'all') => void;
  setType: (v: number | 'all') => void;
  setPageNo: (v: number) => void;
  setPerPageSize: (v: number) => void;
  reset: () => void;
  reload: () => void;
  loadMore: () => void;
}

const DEBOUNCE_MS = 300;

export const useTaskCenterList = (token: string): UseTaskCenterListResult => {
  const [items, setItems] = useState<ITaskCenterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeywordState] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [urgency, setUrgency] = useState<number | 'all'>('all');
  const [projectId, setProjectId] = useState<string | 'all'>('all');
  const [type, setType] = useState<number | 'all'>('all');
  const [pageNo, setPageNo] = useState(1);
  const [perPageSize, setPerPageSize] = useState(TASK_CENTER_DEFAULT_PER_PAGE_SIZE);

  const setKeyword = useCallback((v: string) => {
    setKeywordState(v);
  }, []);

  // Debounce keyword propagation + reset to page 1
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPageNo(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [keyword]);

  // Reset to page 1 on non-pagination filter changes
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false;
      return;
    }
    setPageNo(1);
  }, [urgency, projectId, type]);

  const fetchOnce = useCallback(
    async (mode: 'replace' | 'append' = 'replace', overridePage?: number) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await ipcBridge.taskCenter.list.invoke({
          token,
          filters: { keyword: debouncedKeyword, urgency, projectId, type },
          pageNo: overridePage ?? pageNo,
          perPageSize,
        });
        if (res.ok === true) {
          setItems((prev) => (mode === 'append' ? [...prev, ...res.data.items] : res.data.items));
          setTotal(res.data.total);
          setError(null);
        } else {
          if (mode === 'replace') {
            setItems([]);
            setTotal(0);
          }
          if (res.ok === false) setError(res.message);
          else setError('Unknown error');
        }
      } catch (e) {
        if (mode === 'replace') {
          setItems([]);
          setTotal(0);
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [token, debouncedKeyword, urgency, projectId, type, pageNo, perPageSize]
  );

  // The auto effect below refetches when filters/pageNo change. loadMore
  // also advances pageNo, but we don't want that to trigger a re-replace.
  // We use this flag to skip the next auto-effect run right after loadMore
  // bumped pageNo.
  const skipNextAutoFetchRef = useRef(false);

  useEffect(() => {
    if (skipNextAutoFetchRef.current) {
      skipNextAutoFetchRef.current = false;
      return;
    }
    void fetchOnce('replace');
  }, [fetchOnce]);

  const reload = useCallback(() => {
    void fetchOnce('replace');
  }, [fetchOnce]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    const nextPage = pageNo + 1;
    skipNextAutoFetchRef.current = true;
    await fetchOnce('append', nextPage);
    setPageNo(nextPage);
  }, [fetchOnce, loading, pageNo]);

  const reset = useCallback(() => {
    setKeywordState('');
    setDebouncedKeyword('');
    setUrgency('all');
    setProjectId('all');
    setType('all');
    setPageNo(1);
  }, []);

  return useMemo(
    () => ({
      items,
      total,
      loading,
      error,
      keyword,
      urgency,
      projectId,
      type,
      pageNo,
      perPageSize,
      setKeyword,
      setUrgency,
      setProjectId,
      setType,
      setPageNo,
      setPerPageSize,
      reset,
      reload,
      loadMore,
    }),
    [
      items,
      total,
      loading,
      error,
      keyword,
      urgency,
      projectId,
      type,
      pageNo,
      perPageSize,
      setKeyword,
      reset,
      reload,
      loadMore,
    ]
  );
};
