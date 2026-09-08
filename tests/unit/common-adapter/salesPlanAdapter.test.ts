/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  salesPlan,
  type GeaSalesPlanPage,
  type GeaSalesPlanPeriod,
  type GeaSalesPlanActionParams,
  type GeaSalesPlanSubmitParams,
} from '@/common/adapter/ipcBridge';

describe('sales-plan submit adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves exact ID/decimal strings and sends idempotency headers without logging the body', async () => {
    const receipt = {
      planId: '9007199254740993',
      versionId: '9007199254740995',
      seq: 1,
      status: 1,
      replayed: false,
      requestId: 'request-1',
      traceId: 'trace-1',
      auditId: 'audit-1',
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: receipt }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', { __backendPort: 43123 });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const params: GeaSalesPlanSubmitParams = {
      idempotencyKey: 'idempotency-1',
      requestId: 'request-1',
      request: {
        periodId: '9007199254740993',
        periodMonth: '2026-08',
        planTypeCode: 'MONTHLY',
        channelCode: 'DIRECT',
        dealerCode: '9007199254740997',
        targetQty: '123456789012.345',
        targetAmount: '999999999999.99',
        submitterCode: 'service-account',
        items: [
          {
            skuCode: '9007199254740999',
            productCategName: 'Category',
            baseQty: '0.001',
            qty: '123456789012.345',
            price: '8.10',
          },
        ],
      },
    };

    await expect(salesPlan.submit.invoke(params)).resolves.toEqual(receipt);

    expect(fetchSpy).toHaveBeenCalledWith('aionui-core://trusted/api/gea/sales-plan/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idempotency-1',
        'X-Request-Id': 'request-1',
      },
      body: JSON.stringify(params.request),
    });
    expect(fetchSpy.mock.calls[0][1]?.headers).not.toHaveProperty('X-AionCore-Bootstrap-Secret');
    const logOutput = debugSpy.mock.calls.flat().join(' ');
    expect(logOutput).toContain('(body omitted)');
    expect(logOutput).not.toContain('9007199254740993');
    expect(logOutput).not.toContain('idempotency-1');
    expect(logOutput).not.toContain('request-1');
  });
});

describe('sales-plan user query adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { __backendPort: 43123 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the protected period query and preserves Long identifiers as strings', async () => {
    const page: GeaSalesPlanPage<GeaSalesPlanPeriod> = {
      records: [
        {
          periodId: '9007199254740993',
          tenantId: '9007199254740995',
          periodMonth: '2026-09',
          planType: '月度计划',
          planTypeCode: 'MONTHLY',
          status: 'OPEN',
          submitDeadline: null,
        },
      ],
      total: 1,
      size: 20,
      current: 1,
      pages: 1,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: page }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const controller = new AbortController();

    await expect(
      salesPlan.periods.invoke({
        periodMonth: '2026-09',
        planType: 'MONTHLY',
        status: 'OPEN',
        pageNo: 1,
        pageSize: 100,
        signal: controller.signal,
      })
    ).resolves.toEqual(page);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:43123/api/gea/sales-plan/periods?periodMonth=2026-09&planType=MONTHLY&status=OPEN&pageNo=1&pageSize=100',
      {
        method: 'GET',
        headers: {},
        body: undefined,
        signal: controller.signal,
      }
    );
    expect(page.records[0].periodId).toBe('9007199254740993');
  });

  it('normalizes safe JSON number IDs and decimals before Renderer business logic sees them', async () => {
    const numericPeriod = {
      records: [
        {
          periodId: 20260901,
          tenantId: 1,
          periodMonth: '2026-09',
          planType: '月度计划',
          planTypeCode: 'Y',
          status: 'OPEN',
        },
      ],
      total: 1,
      size: 20,
      current: 1,
      pages: 1,
    };
    const numericDetail = {
      currentVersion: {
        id: 'p-jxs-2026-09-00017-1',
        planId: 'p-jxs-2026-09-00017',
        seq: 1,
        periodId: 20260901,
        planTypeCode: 'Y',
        dealerCode: 10151759,
        status: 7,
        effective: true,
        targetAmount: 127145.49,
        targetQty: 1458,
      },
      actionContext: {
        versionId: 'p-jxs-2026-09-00017-1',
        status: 7,
        nodeOrder: 2,
        allowedActions: ['SAVE'],
        snapshotHash: 'a'.repeat(64),
      },
      skus: [],
      versions: [],
      logs: [],
    };
    const numericSku = {
      id: 1174,
      versionId: 'p-jxs-2026-09-00017-1',
      skuCode: 10000075,
      productCategName: '汤圆',
      baseQty: 1,
      qty: 1,
      price: 113.27,
      amt: 113.27,
      amtBase: 113.27,
      regionConfirmedQty: null,
      regionConfirmedAmount: null,
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: numericPeriod }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: numericDetail }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [numericSku] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchSpy);

    const periodResult = await salesPlan.periods.invoke();
    const detailResult = await salesPlan.detail.invoke({ planId: numericDetail.currentVersion.planId });
    const skuResult = await salesPlan.versionSkus.invoke({ versionId: numericSku.versionId });

    expect(periodResult.records[0]).toMatchObject({ periodId: '20260901', tenantId: '1' });
    expect(detailResult.actionContext).toEqual(numericDetail.actionContext);
    expect(detailResult.currentVersion).toMatchObject({
      periodId: '20260901',
      dealerCode: '10151759',
      targetQty: '1458',
      targetAmount: '127145.49',
    });
    expect(skuResult[0]).toMatchObject({
      id: '1174',
      skuCode: '10000075',
      qty: '1',
      price: '113.27',
      regionConfirmedQty: null,
    });
  });

  it('maps paging, approval status, and every supported organization scope without numeric coercion', async () => {
    const page = {
      records: [
        {
          planId: 'plan-1',
          versionId: 'version-1',
          seq: 1,
          periodId: '9007199254740993',
          planTypeCode: 'MONTHLY',
          dealerCode: '9007199254740997',
          orgCode: 'ORG-001',
          orgName: '上海网点经销组',
          provinceCode: 'PROVINCE-01',
          provinceName: '上海省区',
          areaCode: 'AREA-01',
          areaName: '华东经销业务',
          baseName: '华中基地',
          status: 4,
          returnReason: null,
          targetQty: '123456789012.345',
          targetAmount: '9999999999999999.99',
          skuCount: 3,
          currentQty: '123456789012.340',
          currentAmount: '9999999999999999.90',
        },
      ],
      total: 1,
      size: 5,
      current: 2,
      pages: 3,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: page }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      salesPlan.list.invoke({
        periodId: '9007199254740993',
        planTypeCode: 'MONTHLY',
        dealerCode: '9007199254740997',
        areaCode: 'AREA-01',
        provinceCode: 'PROVINCE-01',
        orgCode: 'ORG-001',
        baseName: '华中基地',
        status: 4,
        pageNo: 2,
        pageSize: 5,
      })
    ).resolves.toEqual(page);

    expect(fetchSpy.mock.calls[0][0]).toBe(
      'http://127.0.0.1:43123/api/gea/sales-plan/plans?periodId=9007199254740993&planTypeCode=MONTHLY&dealerCode=9007199254740997&areaCode=AREA-01&provinceCode=PROVINCE-01&orgCode=ORG-001&baseName=%E5%8D%8E%E4%B8%AD%E5%9F%BA%E5%9C%B0&status=4&pageNo=2&pageSize=5'
    );
    expect(page.records[0].targetAmount).toBe('9999999999999999.99');
  });

  it('normalizes snake-case organization names returned by the live GEA endpoint', async () => {
    const page = {
      records: [
        {
          planId: 'plan-1',
          versionId: 'version-1',
          seq: 1,
          periodId: 20260901,
          planTypeCode: 'Y',
          dealerCode: 10070026,
          orgCode: '167',
          orgName: '上海网点经销组',
          provinceCode: '0034',
          province_name: '上海经销直管区',
          areaCode: '27',
          areaName: '浙沪经销业务(不用)',
          baseName: '华东',
          dealer_name: '上海冠申食品有限公司',
          status: 5,
          targetQty: 26445,
          targetAmount: 1539999.99,
          skuCount: 205,
          currentQty: 26445,
          currentAmount: 2064404.28,
        },
      ],
      total: 1,
      size: 20,
      current: 1,
      pages: 1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: page }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await salesPlan.list.invoke();

    expect(result.records[0]).toMatchObject({
      provinceName: '上海经销直管区',
      dealerName: '上海冠申食品有限公司',
    });
    expect(result.records[0]).not.toHaveProperty('province_name');
    expect(result.records[0]).not.toHaveProperty('dealer_name');
  });

  it('maps detail, versions, logs, version SKU, and comparison to the protected read endpoints', async () => {
    const controller = new AbortController();
    const fetchSpy = vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(input);
      const data = url.pathname.endsWith('/versions')
        ? []
        : url.pathname.endsWith('/logs')
          ? []
          : url.pathname.endsWith('/skus')
            ? []
            : url.pathname.endsWith('/compare')
              ? []
              : {
                  currentVersion: {
                    id: 'version/current 1',
                    planId: 'plan/1',
                    seq: 2,
                    periodId: '9007199254740993',
                    planTypeCode: 'MONTHLY',
                    dealerCode: '9007199254740997',
                    status: 4,
                    effective: true,
                    targetAmount: '9999999999999999.99',
                    targetQty: '123456789012.345',
                  },
                  skus: [],
                  versions: [],
                  logs: [],
                };
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    await salesPlan.detail.invoke({ planId: 'plan/1', signal: controller.signal });
    await salesPlan.versions.invoke({ planId: 'plan/1', signal: controller.signal });
    await salesPlan.logs.invoke({ planId: 'plan/1', signal: controller.signal });
    await salesPlan.versionSkus.invoke({ versionId: 'version/current 1', signal: controller.signal });
    await salesPlan.compare.invoke({
      planId: 'plan/1',
      fromVersionId: 'version/previous 1',
      toVersionId: 'version/current 1',
      signal: controller.signal,
    });

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      'http://127.0.0.1:43123/api/gea/sales-plan/plans/plan%2F1',
      'http://127.0.0.1:43123/api/gea/sales-plan/plans/plan%2F1/versions',
      'http://127.0.0.1:43123/api/gea/sales-plan/plans/plan%2F1/logs',
      'http://127.0.0.1:43123/api/gea/sales-plan/plans/versions/version%2Fcurrent%201/skus',
      'http://127.0.0.1:43123/api/gea/sales-plan/plans/plan%2F1/compare?fromVersionId=version%2Fprevious+1&toVersionId=version%2Fcurrent+1',
    ]);
    expect(fetchSpy.mock.calls.every(([, init]) => init?.signal === controller.signal)).toBe(true);
  });

  it('posts a user action to the exact version with correlation headers and no identity fields or body log', async () => {
    const receipt = {
      planId: 'plan-1',
      versionId: 'version/current 1',
      fromStatus: 4,
      toStatus: 5,
      replayed: false,
      requestId: 'request-action-1',
      traceId: 'trace-action-1',
      auditId: 'audit-action-1',
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: receipt }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchSpy);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const params: GeaSalesPlanActionParams = {
      versionId: 'version/current 1',
      idempotencyKey: 'action-idempotency-1',
      requestId: 'request-action-1',
      request: {
        action: 'APPROVE',
        expectedStatus: 4,
        remark: 'approved by current user session',
        adjustments: [{ skuCode: '9007199254740999', adjustQty: '-0.125' }],
      },
    };

    await expect(salesPlan.action.invoke(params)).resolves.toEqual(receipt);

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:43123/api/gea/sales-plan/plans/versions/version%2Fcurrent%201/actions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'action-idempotency-1',
          'X-Request-Id': 'request-action-1',
        },
        body: JSON.stringify(params.request),
      }
    );
    expect(params.request).not.toHaveProperty('tenantId');
    expect(params.request).not.toHaveProperty('userId');
    expect(params.request).not.toHaveProperty('role');
    expect(params.request).not.toHaveProperty('permission');
    expect(debugSpy.mock.calls.flat().join(' ')).not.toContain('approved by current user session');
    expect(debugSpy.mock.calls.flat().join(' ')).not.toContain('action-idempotency-1');
  });
});
