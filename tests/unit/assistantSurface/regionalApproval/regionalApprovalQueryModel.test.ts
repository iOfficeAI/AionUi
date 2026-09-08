import { describe, expect, it } from 'vitest';
import {
  SALES_PLAN_STATUS_BY_STAGE,
  addExactDecimals,
  aggregateRegionalApprovalLiveCategories,
  approvalStageForSalesPlanStatus,
  approvalStageProgressForSalesPlanStatusTotals,
  chooseInitialSalesPlanPeriod,
  formatExactDecimal,
  projectRegionalApprovalLiveDimension,
  toRegionalApprovalLiveRow,
} from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/regionalApprovalQueryModel';

describe('regionalApprovalQueryModel', () => {
  it('maps all five approval stages to the frozen GEA page status semantics', () => {
    expect(SALES_PLAN_STATUS_BY_STAGE).toEqual({ customer: 1, region: 2, province: 3, area: 4, category: 5 });
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(approvalStageForSalesPlanStatus)).toEqual([
      'customer',
      'region',
      'province',
      'area',
      'category',
      'customer',
      'region',
      'province',
      'area',
      'category',
    ]);
  });

  it('does not mark a node complete while one plan remains pending', () => {
    expect(approvalStageProgressForSalesPlanStatusTotals(201, { 10: 200, 5: 1 }).category).toBe(99);
    expect(approvalStageProgressForSalesPlanStatusTotals(201, { 10: 201 }).category).toBe(100);
  });

  it('counts completed nodes cumulatively using V1.11 statuses within the readable scope', () => {
    expect(
      approvalStageProgressForSalesPlanStatusTotals(10, {
        1: 2,
        2: 2,
        3: 1,
        4: 1,
        5: 1,
        6: 1,
        7: 0,
        8: 0,
        9: 0,
        10: 2,
      })
    ).toEqual({ customer: 70, region: 50, province: 40, area: 30, category: 20 });
    expect(approvalStageProgressForSalesPlanStatusTotals(1, { 1: 1 })).toEqual({
      customer: 0,
      region: 0,
      province: 0,
      area: 0,
      category: 0,
    });
    expect(approvalStageProgressForSalesPlanStatusTotals(1, { 5: 1 })).toEqual({
      customer: 100,
      region: 100,
      province: 100,
      area: 100,
      category: 0,
    });
    expect(approvalStageProgressForSalesPlanStatusTotals(1, { 10: 1 })).toEqual({
      customer: 100,
      region: 100,
      province: 100,
      area: 100,
      category: 100,
    });
    expect(approvalStageProgressForSalesPlanStatusTotals(0, {})).toEqual({
      customer: 0,
      region: 0,
      province: 0,
      area: 0,
      category: 0,
    });
  });

  it('keeps category approval pending until status 10', () => {
    const source = {
      planId: 'plan',
      versionId: 'v1',
      seq: 1,
      periodId: 'period',
      planTypeCode: 'Y',
      dealerCode: '1',
      status: 5,
      targetQty: '1',
      targetAmount: '1',
      skuCount: 1,
      currentQty: '1',
      currentAmount: '1',
    };
    expect(toRegionalApprovalLiveRow(source).approvalState).toBe('pending');
    expect(toRegionalApprovalLiveRow({ ...source, status: 10 }).approvalState).toBe('approved');
  });

  it('chooses an open period without coercing its Long identifiers', () => {
    const selected = chooseInitialSalesPlanPeriod([
      {
        periodId: '9007199254740993',
        tenantId: '9007199254740994',
        periodMonth: '2026-08',
        planType: '月度计划',
        planTypeCode: 'MONTHLY',
        status: 'CLOSED',
      },
      {
        periodId: '9007199254740995',
        tenantId: '9007199254740994',
        periodMonth: '2026-09',
        planType: '月度计划',
        planTypeCode: 'MONTHLY',
        status: 'OPEN',
      },
    ]);

    expect(selected?.periodId).toBe('9007199254740995');
  });

  it('adds and formats decimal text exactly beyond the JavaScript safe integer range', () => {
    expect(addExactDecimals(['9999999999999999.99', '0.01', '123456789012.345'])).toBe('10000123456789012.345');
    expect(formatExactDecimal('10000123456789012.345')).toBe('10,000,123,456,789,012.345');
  });

  it('aggregates live SKU rows into official-order category comparison rows', () => {
    const categories = aggregateRegionalApprovalLiveCategories([
      {
        id: 'sku-2',
        versionId: 'version-1',
        skuCode: '20002',
        productCategName: '汤圆',
        baseQty: '10',
        qty: '12',
        price: '2',
        amt: '24',
        amtBase: '20',
      },
      {
        id: 'sku-1',
        versionId: 'version-1',
        skuCode: '10001',
        productCategName: '水饺',
        baseQty: '9999999999999999.9',
        qty: '9999999999999999.8',
        price: '1',
        amt: '9999999999999999.8',
        amtBase: '9999999999999999.9',
      },
      {
        id: 'sku-3',
        versionId: 'version-1',
        skuCode: '10002',
        productCategName: '水饺',
        baseQty: '0.1',
        qty: '0.2',
        price: '1',
        amt: '0.2',
        amtBase: '0.1',
      },
    ]);

    expect(categories.map((category) => category.categoryName)).toEqual(['水饺', '汤圆']);
    expect(categories[0]).toMatchObject({
      skuCount: 2,
      quantity: '10000000000000000.0',
      amount: '10000000000000000.0',
      baseQuantity: '10000000000000000.0',
      baseAmount: '10000000000000000.0',
      quantityDelta: '0.0',
      amountDelta: '0.0',
      quantityProgress: 100,
      amountProgress: 100,
    });
    expect(categories[1]).toMatchObject({
      quantity: '12',
      amount: '24',
      baseQuantity: '10',
      baseAmount: '20',
      quantityDelta: '2',
      amountDelta: '4',
      quantityProgress: 120,
      amountProgress: 120,
    });
  });

  it('keeps the wire identifiers and decimals unchanged in the shared live-row domain model', () => {
    const row = toRegionalApprovalLiveRow({
      planId: 'plan-1',
      versionId: 'version-1',
      seq: 1,
      periodId: '9007199254740993',
      planTypeCode: 'MONTHLY',
      dealerCode: '9007199254740997',
      status: 4,
      targetQty: '123456789012.345',
      targetAmount: '9999999999999999.99',
      skuCount: 1,
      currentQty: '123456789012.340',
      currentAmount: '9999999999999999.90',
    });

    expect(row).toMatchObject({
      source: 'gea',
      periodId: '9007199254740993',
      dealerCode: '9007199254740997',
      targetAmount: '9999999999999999.99',
      approvalState: 'pending',
    });
  });

  it('projects localized organization names and parent chains for each live queue dimension', () => {
    const row = toRegionalApprovalLiveRow({
      planId: 'plan-1',
      versionId: 'version-1',
      seq: 1,
      periodId: 'period-1',
      planTypeCode: 'MONTHLY',
      dealerCode: '10070026',
      areaCode: 'AREA-01',
      provinceCode: 'PROVINCE-01',
      orgCode: 'ORG-01',
      areaName: '华东大区',
      provinceName: '浙江省区',
      orgName: '杭州经销分区',
      baseName: '杭州基地',
      dealerName: '杭州经销商',
      status: 2,
      targetQty: '1',
      targetAmount: '1',
      skuCount: 1,
      currentQty: '1',
      currentAmount: '1',
    });

    expect(projectRegionalApprovalLiveDimension(row, 'province')).toEqual({
      name: '浙江省区',
      context: ['华东大区', '杭州基地'],
    });
    expect(projectRegionalApprovalLiveDimension(row, 'region')).toEqual({
      name: '杭州经销分区',
      context: ['浙江省区', '华东大区', '杭州基地'],
    });
    expect(projectRegionalApprovalLiveDimension(row, 'customer')).toEqual({
      name: '杭州经销商',
      customerCode: '10070026',
      context: ['杭州经销分区', '浙江省区', '华东大区', '杭州基地'],
    });
  });

  it('does not substitute a code or another hierarchy name when the selected level has no display name', () => {
    const row = toRegionalApprovalLiveRow({
      planId: 'plan-1',
      versionId: 'version-1',
      seq: 1,
      periodId: 'period-1',
      planTypeCode: 'MONTHLY',
      dealerCode: '10070026',
      areaCode: 'AREA-01',
      provinceCode: 'PROVINCE-01',
      orgCode: 'ORG-01',
      baseName: '华东',
      status: 2,
      targetQty: '1',
      targetAmount: '1',
      skuCount: 1,
      currentQty: '1',
      currentAmount: '1',
    });

    expect(projectRegionalApprovalLiveDimension(row, 'province')).toEqual({
      name: undefined,
      context: ['华东'],
    });
  });

  it('treats status 5 as pending category approval under V1.11', () => {
    const row = toRegionalApprovalLiveRow({
      planId: 'plan-1',
      versionId: 'version-1',
      seq: 1,
      periodId: 'period-1',
      planTypeCode: 'MONTHLY',
      dealerCode: 'dealer-1',
      status: 5,
      targetQty: '1',
      targetAmount: '1',
      skuCount: 1,
      currentQty: '1',
      currentAmount: '1',
    });

    expect(row.approvalState).toBe('pending');
  });

  it('keeps legacy completed status 10 visible and read-only', () => {
    const row = toRegionalApprovalLiveRow({
      planId: 'plan-10',
      versionId: 'version-10',
      seq: 1,
      periodId: 'period-1',
      planTypeCode: 'MONTHLY',
      dealerCode: 'dealer-1',
      status: 10,
      targetQty: '1',
      targetAmount: '1',
      skuCount: 1,
      currentQty: '1',
      currentAmount: '1',
    });

    expect(row.approvalState).toBe('approved');
  });
});
