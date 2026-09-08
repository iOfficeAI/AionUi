import { describe, expect, it } from 'vitest';
import type { GeaSalesPlanSku } from '@/common/adapter/ipcBridge';
import { aggregateSalesPlanExportAmounts } from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/models/salesPlanExportModel';

const sku = (id: string, overrides: Partial<GeaSalesPlanSku> = {}): GeaSalesPlanSku => ({
  id,
  skuCode: id,
  versionId: 'version-1',
  productCategName: 'Test',
  baseQty: '1',
  price: '10',
  amtBase: '10',
  qty: '0.1',
  amt: '1.01',
  regionConfirmedQty: '2.125',
  regionConfirmedAmount: '21.25',
  provinceConfirmedQty: '3.125',
  provinceConfirmedAmount: '31.25',
  areaConfirmedQty: '4.125',
  areaConfirmedAmount: '41.25',
  categoryConfirmedQty: '5.125',
  categoryConfirmedAmount: '51.25',
  ...overrides,
});
const row = { versionId: 'version-1', skuCount: 2 };

describe('sales-plan export node amounts', () => {
  it('sums all five independent pairs exactly without substituting a later node', () => {
    const totals = aggregateSalesPlanExportAmounts(row, [
      sku('01'),
      sku('02', { qty: '0.2', amt: '9999999999999999.99' }),
    ]);
    expect(totals).toEqual({
      qty: '0.3',
      amt: '10000000000000001.00',
      regionConfirmedQty: '4.250',
      regionConfirmedAmount: '42.50',
      provinceConfirmedQty: '6.250',
      provinceConfirmedAmount: '62.50',
      areaConfirmedQty: '8.250',
      areaConfirmedAmount: '82.50',
      categoryConfirmedQty: '10.250',
      categoryConfirmedAmount: '102.50',
    });
  });

  it('keeps confirmed zero separate from unreached NULL values', () => {
    const skus = ['01', '02'].map((id) =>
      sku(id, {
        areaConfirmedQty: '0',
        areaConfirmedAmount: '0',
        categoryConfirmedQty: null,
        categoryConfirmedAmount: null,
      })
    );
    expect(aggregateSalesPlanExportAmounts(row, skus)).toMatchObject({
      areaConfirmedQty: '0',
      areaConfirmedAmount: '0',
      categoryConfirmedQty: null,
      categoryConfirmedAmount: null,
    });
  });

  it.each([
    [sku('01')],
    [sku('01'), sku('02', { versionId: 'other-version' })],
    [sku('01'), sku('01')],
    [sku('01'), sku('02', { skuCode: '01' })],
    [sku('01'), sku('02', { id: '' })],
    [sku('01'), sku('02'), sku('03')],
  ])('rejects incomplete, duplicate or mismatched SKU sets %#', (...skus) => {
    expect(() => aggregateSalesPlanExportAmounts(row, skus)).toThrow();
  });

  it.each([
    { qty: '' },
    { amt: 'invalid' },
    { regionConfirmedQty: null, regionConfirmedAmount: '10' },
    { categoryConfirmedQty: null, categoryConfirmedAmount: null },
    { provinceConfirmedAmount: 'NaN' },
  ])('rejects partial node confirmations or invalid numbers: %j', (overrides) => {
    expect(() => aggregateSalesPlanExportAmounts(row, [sku('01'), sku('02', overrides)])).toThrow();
  });

  it('exports an explicitly empty plan as zero submitted amounts and blank confirmations', () => {
    expect(aggregateSalesPlanExportAmounts({ ...row, skuCount: 0 }, [])).toEqual({
      qty: '0',
      amt: '0',
      regionConfirmedQty: null,
      regionConfirmedAmount: null,
      provinceConfirmedQty: null,
      provinceConfirmedAmount: null,
      areaConfirmedQty: null,
      areaConfirmedAmount: null,
      categoryConfirmedQty: null,
      categoryConfirmedAmount: null,
    });
  });
});
