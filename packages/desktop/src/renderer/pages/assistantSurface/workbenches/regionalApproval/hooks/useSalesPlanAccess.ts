import { useEffect, useState } from 'react';
import type { GeaSalesPlanDetail } from '@/common/adapter/ipcBridge';
import type { RegionalApprovalLiveRow } from '../regionalApprovalQueryModel';
import type { SalesPlanDetailClient } from './useSalesPlanDetail';
import { salesPlanDraftSnapshot } from '../models/salesPlanLocalDraftModel';

export const useSalesPlanAccess = (
  rows: readonly RegionalApprovalLiveRow[],
  client: SalesPlanDetailClient | undefined,
  enabled: boolean
) => {
  const [entries, setEntries] = useState<Record<string, GeaSalesPlanDetail>>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setEntries({});
    if (!enabled || !client || rows.length === 0) return;
    const controller = new AbortController();
    let cursor = 0;
    const worker = async () => {
      while (cursor < rows.length && !controller.signal.aborted) {
        const row = rows[cursor++];
        try {
          // oxlint-disable-next-line no-await-in-loop -- cap detail reads at four concurrent requests.
          const detail = await client.detail.invoke({ planId: row.planId, signal: controller.signal });
          if (!controller.signal.aborted && salesPlanDraftSnapshot(row, detail)) {
            setEntries((current) => ({ ...current, [row.versionId]: detail }));
          }
        } catch {
          // Missing, denied or failed capability reads leave this object read-only.
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
    return () => controller.abort();
  }, [rows, client, enabled, revision]);
  return { entries, refresh: () => setRevision((value) => value + 1) };
};
