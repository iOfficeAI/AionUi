import { describe, expect, it } from 'vitest';
import { salesPlanAccessForRow } from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/models/salesPlanAccessModel';
import {
  salesPlanDraftMatches,
  salesPlanDraftSnapshot,
} from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/models/salesPlanLocalDraftModel';
import type { GeaSalesPlanDetail, GeaSalesPlanListItem, GeaSalesPlanSku } from '@/common/adapter/ipcBridge';

const row = { planId: 'p', versionId: 'v', status: 5 } as GeaSalesPlanListItem;
const sku = { id: 's', versionId: 'v', skuCode: '10001', price: '2', areaConfirmedQty: '12' } as GeaSalesPlanSku;
const detail = {
  currentVersion: { id: 'v', planId: 'p', status: 5, effective: true },
  skus: [sku],
  versions: [],
  logs: [],
} as GeaSalesPlanDetail;
const permission = ['sales-plan:plan:category-approve'];

describe('role and status action projection', () => {
  it('allows local saving with the node permission, and requires generic permission for approval', () => {
    expect(salesPlanAccessForRow(row, detail, permission)?.allowedActions).toEqual(['SAVE']);
    expect(salesPlanAccessForRow(row, detail, [...permission, 'sales-plan:plan:approve'])?.allowedActions).toEqual([
      'SAVE',
      'APPROVE',
    ]);
    expect(salesPlanAccessForRow(row, detail, ['sales-plan:plan:approve'])).toBeUndefined();
    expect(salesPlanAccessForRow(row, detail)).toBeUndefined();
    expect(
      salesPlanAccessForRow(
        { ...row, status: 10 },
        { ...detail, currentVersion: { ...detail.currentVersion, status: 10 } },
        permission
      )?.allowedActions
    ).toEqual(['SAVE']);
  });
  it('rejects another version, changed status and historical detail', () => {
    expect(salesPlanAccessForRow({ ...row, versionId: 'other' }, detail, permission)).toBeUndefined();
    expect(salesPlanAccessForRow({ ...row, status: 4 }, detail, permission)).toBeUndefined();
    expect(
      salesPlanAccessForRow(
        row,
        { ...detail, currentVersion: { ...detail.currentVersion, effective: false } },
        permission
      )
    ).toBeUndefined();
  });
});

describe('local draft freshness', () => {
  const draft = {
    planId: 'p',
    versionId: 'v',
    status: 5,
    sourceSnapshot: salesPlanDraftSnapshot(row, detail)!,
    adjustments: [{ skuCode: '10001', adjustQty: '2.125' }],
    remark: '',
  };
  it('restores only a matching plan, version, status and upstream quantity/price snapshot', () => {
    expect(salesPlanDraftMatches(draft, row, detail)).toBe(true);
    expect(salesPlanDraftMatches(draft, { ...row, planId: 'other' }, detail)).toBe(false);
    expect(salesPlanDraftMatches(draft, { ...row, status: 10 }, detail)).toBe(false);
    expect(salesPlanDraftMatches(draft, row, { ...detail, skus: [{ ...sku, areaConfirmedQty: '13' }] })).toBe(false);
    expect(salesPlanDraftMatches(draft, row, { ...detail, skus: [{ ...sku, price: '3' }] })).toBe(false);
    expect(salesPlanDraftMatches(draft, row, { ...detail, skus: [{ ...sku, categoryConfirmedQty: '14' }] })).toBe(
      false
    );
  });
  it('rejects malformed, duplicate, unknown and negative-result adjustments', () => {
    for (const adjustments of [
      [{ skuCode: 'other', adjustQty: '1' }],
      [{ skuCode: '10001', adjustQty: '-13' }],
      [{ skuCode: '10001', adjustQty: 'NaN' }],
      [...draft.adjustments, ...draft.adjustments],
    ]) {
      expect(salesPlanDraftMatches({ ...draft, adjustments }, row, detail)).toBe(false);
    }
  });
});
