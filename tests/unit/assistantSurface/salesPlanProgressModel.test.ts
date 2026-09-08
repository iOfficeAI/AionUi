import { describe, expect, it } from 'vitest';
import type { GeaSalesPlanListItem } from '@/common/adapter/ipcBridge';
import { buildSalesPlanProgressTree } from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/models/salesPlanProgressModel';

const row = (planId: string, status = 5): GeaSalesPlanListItem => ({
  planId,
  versionId: `${planId}-1`,
  seq: 1,
  periodId: '202609',
  planTypeCode: 'Y',
  dealerCode: planId,
  dealerName: `客户${planId}`,
  areaCode: 'A',
  areaName: '华东',
  provinceCode: 'P',
  provinceName: '省区一',
  orgCode: 'R',
  orgName: '区域一',
  status,
  targetQty: '1',
  targetAmount: '1',
  skuCount: 1,
  currentQty: '1',
  currentAmount: '1',
});

describe('sales plan progress from existing permission-scoped list records', () => {
  it('drills through returned area, province, region and customer without treating status 5 as complete', () => {
    const tree = buildSalesPlanProgressTree([row('1'), row('2', 10)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ level: 'area', code: 'A', name: '华东', total: 2, pending: 1, completed: 1 });
    const province = tree[0].children[0];
    expect(province).toMatchObject({ level: 'province', code: 'P', total: 2 });
    const region = province.children[0];
    expect(region).toMatchObject({ level: 'region', code: 'R', total: 2 });
    expect(region.children.map((node) => [node.level, node.code, node.pending])).toEqual([
      ['customer', '1', 1],
      ['customer', '2', 0],
    ]);
  });

  it('separates equal names and codes beneath different parents and preserves missing data', () => {
    const tree = buildSalesPlanProgressTree([
      row('1'),
      { ...row('2'), areaCode: 'B', areaName: '华南' },
      { ...row('3'), areaCode: undefined, areaName: undefined },
    ]);
    expect(new Set(tree.map((node) => node.key)).size).toBe(3);
    expect(tree.find((node) => !node.code)).toMatchObject({ name: undefined, total: 1 });
    expect(new Set(tree.map((node) => node.children[0].key)).size).toBe(3);
  });

  it('counts returned plans as pending and does not synthesize unsubmitted customers', () => {
    const tree = buildSalesPlanProgressTree([row('1', 7)]);
    expect(tree[0]).toMatchObject({ total: 1, pending: 1, completed: 0 });
    expect(buildSalesPlanProgressTree([])).toEqual([]);
  });
});
