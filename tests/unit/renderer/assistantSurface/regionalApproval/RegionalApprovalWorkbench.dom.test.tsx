import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TFunction } from 'i18next';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/renderer/services/i18n/locales/zh-CN/common.json';
import RegionalApprovalWorkbench from '@/renderer/pages/assistantSurface/workbenches/regionalApproval/RegionalApprovalWorkbench';

const session = vi.hoisted(() => ({ conversationId: 'conversation-a' as string | null }));
const workbenchStyles = readFileSync(
  resolve(
    process.cwd(),
    'packages/desktop/src/renderer/pages/assistantSurface/workbenches/regionalApproval/RegionalApprovalWorkbench.module.css'
  ),
  'utf8'
);

vi.mock('@/renderer/pages/assistantSurface/components/BusinessSurfaceShell', () => ({
  useBusinessSurfaceSession: () => session,
}));

const t = ((key: string, options?: Record<string, string | number>) => {
  const path = key.replace(/^common\./, '').split('.');
  const value = path.reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, zhCN);
  return Object.entries(options ?? {}).reduce(
    (text, [name, replacement]) => text.replaceAll(`{{${name}}}`, String(replacement)),
    typeof value === 'string' ? value : key
  );
}) as TFunction;

const StatefulWorkbenchHarness: React.FC = () => {
  const [, setContext] = React.useState<unknown>();
  const onContextChange = React.useCallback((context: unknown) => setContext(context), []);
  return (
    <RegionalApprovalWorkbench
      stateScope='user:forecast-fixture-stateful-parent'
      t={t}
      onContextChange={onContextChange}
      queryClient={null}
    />
  );
};

describe('RegionalApprovalWorkbench', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    session.conversationId = 'conversation-a';
  });

  it('stabilizes Context updates when the real parent stores every emitted snapshot', async () => {
    render(<StatefulWorkbenchHarness />);

    const queue = screen.getByRole('region', { name: '审批核对队列' });
    const writableRow = within(queue)
      .getAllByRole('checkbox')
      .find((checkbox) => !checkbox.hasAttribute('disabled') && checkbox.hasAttribute('value'));
    expect(writableRow).toBeDefined();
    fireEvent.click(writableRow!);
    await waitFor(() => expect(screen.getByRole('button', { name: '退回' })).toBeEnabled());

    fireEvent.click(screen.getByRole('switch', { name: '品类维度' }));
    fireEvent.click(screen.getByRole('button', { name: '查看 华北大区 证据与调整' }));
    expect(await screen.findByTestId('regional-approval-plan-detail')).toBeVisible();
  });

  it('renders the approved five-stage Fixture queue skeleton and restores its stage outside Conversation scope', async () => {
    const onContextChange = vi.fn();
    const firstRender = render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-01'
        t={t}
        onContextChange={onContextChange}
        queryClient={null}
      />
    );

    expect(screen.getByRole('main', { name: '需求预测区域经理审批工作台' })).toBeVisible();
    expect(screen.getByText('样例数据 · 不连接生产')).toBeVisible();
    expect(within(screen.getByRole('navigation', { name: '各节点数据状态' })).getAllByRole('button')).toHaveLength(5);
    expect(screen.queryByTestId('regional-approval-current-stage')).not.toBeInTheDocument();
    expect(screen.getByTestId('regional-approval-stage-area')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('region', { name: '审批核对队列' })).toBeVisible();
    expect(screen.queryByText('当前节点核对建议')).not.toBeInTheDocument();
    expect(screen.queryByTestId('regional-approval-primary-task')).not.toBeInTheDocument();
    expect(screen.getAllByText('华北大区', { exact: true }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('regional-approval-stage-category'));
    await waitFor(() =>
      expect(screen.getByTestId('regional-approval-stage-category')).toHaveAttribute('aria-current', 'step')
    );
    expect.soft(screen.getByTestId('regional-approval-stage-province')).toHaveAttribute('data-state', 'completed');
    expect.soft(screen.getByTestId('regional-approval-stage-area')).toHaveAttribute('data-state', 'completed');
    expect(screen.getAllByText('华东大区', { exact: true }).length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('region', { name: '审批核对队列' })).queryByText('华北大区', { exact: true })
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({ approvalStage: 'category', authority: 'organization' }),
          metrics: expect.objectContaining({ visibleCount: 1 }),
        }),
        'conversation-a'
      )
    );
    firstRender.unmount();

    session.conversationId = 'conversation-b';
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-01'
        t={t}
        onContextChange={vi.fn()}
        queryClient={null}
      />
    );
    expect(screen.getByTestId('regional-approval-stage-category')).toHaveAttribute('aria-current', 'step');
    expect(screen.getAllByText('华东大区', { exact: true }).length).toBeGreaterThan(0);
  });

  it('keeps the prototype scope, dimensions and full filter sequence visible', () => {
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-priority'
        t={t}
        onContextChange={vi.fn()}
        queryClient={null}
      />
    );

    expect(screen.getByRole('combobox', { name: '大区' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '当前查看版本' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '对比版本' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '计划月份' })).toBeVisible();
    expect(screen.getByRole('tablist', { name: '审批队列维度' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '按省区' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('switch', { name: '品类维度' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '省区' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '区域' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '客户' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '审批状态' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '健康度' })).toBeVisible();
    expect(screen.getByRole('button', { name: '查询' })).toBeVisible();
    expect(screen.getByRole('button', { name: '重置' })).toBeVisible();
  });

  it('keeps the primary and compare versions in the approved prototype order', async () => {
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-version-order'
        t={t}
        onContextChange={vi.fn()}
        queryClient={null}
      />
    );

    fireEvent.click(screen.getByRole('combobox', { name: '当前查看版本' }));
    fireEvent.click(await screen.findByRole('option', { name: '上一版' }));

    await waitFor(() => expect(screen.getByRole('combobox', { name: '当前查看版本' })).toHaveTextContent('上一版'));
    expect(screen.getByRole('combobox', { name: '对比版本' })).toHaveTextContent('最新版');
  });

  it('keeps the queue footer in normal flex flow so it cannot cover row actions', () => {
    const footerRule = workbenchStyles.match(/\.queueFooter\s*{([^}]*)}/)?.[1] ?? '';
    const tableViewportRule = workbenchStyles.match(/\.tableViewport\s*{([^}]*)}/)?.[1] ?? '';

    expect(footerRule).toContain('flex: 0 0 auto');
    expect(footerRule).not.toMatch(/position:\s*sticky|bottom:\s*0|z-index:/);
    expect(tableViewportRule).toContain('min-height: 132px');
    expect(tableViewportRule).toContain('flex: 1 1 132px');
    expect(tableViewportRule).toContain('overflow: hidden');
  });

  it('keeps the approval console compact and releases fixed control widths at the medium breakpoint', () => {
    const headerRule = workbenchStyles.match(/\.header\s*{([^}]*)}/)?.[1] ?? '';
    const stageLaneRule = workbenchStyles.match(/\.stageLane\s*{([^}]*)}/)?.[1] ?? '';
    const stageButtonRule = workbenchStyles.match(/\.stageButton\s*{([^}]*)}/)?.[1] ?? '';
    const currentStageButtonRule =
      workbenchStyles.match(/\.stageButton\[data-state='current'\]\s*{([^}]*)}/)?.[1] ?? '';
    const contentRule = workbenchStyles.match(/\.content\s*{([^}]*)}/)?.[1] ?? '';
    const queueRule = workbenchStyles.match(/\.queue\s*{([^}]*)}/)?.[1] ?? '';
    const queueHeaderRule = workbenchStyles.match(/\.queueHeader\s*{([^}]*)}/)?.[1] ?? '';
    const filterRowRule = workbenchStyles.match(/\.filterRow\s*{\s*display:\s*grid;([^}]*)}/)?.[1] ?? '';
    const liveFilterRowRule = workbenchStyles.match(/\.liveFilterRow\s*{([^}]*)}/)?.[1] ?? '';
    const filterActionsRule = workbenchStyles.match(/\.filterActions\s*{([^}]*)}/)?.[1] ?? '';
    const footerRule = workbenchStyles.match(/\.queueFooter\s*{([^}]*)}/)?.[1] ?? '';
    const querySpinRule = workbenchStyles.match(/\.querySpin\s*{([^}]*)}/)?.[1] ?? '';
    const emptyRule = workbenchStyles.match(/\.querySpin :global\(\.arco-empty\)\s*{([^}]*)}/)?.[1] ?? '';
    const tableFillBlock =
      workbenchStyles.match(
        /\.tableViewport :global\(\.arco-table\),[\s\S]*?\.tableViewport :global\(\.arco-table-content-inner\)\s*{[^}]*}/
      )?.[0] ?? '';
    const tableScrollRule =
      workbenchStyles.match(/\.tableViewport :global\(\.arco-table-content-scroll\)\s*{([^}]*)}/)?.[1] ?? '';
    const tableInnerRule =
      workbenchStyles.match(
        /\.tableViewport :global\(\.arco-table-content-inner\)\s*{\s*min-height:\s*0;([^}]*)}/
      )?.[1] ?? '';
    const mediumStart = workbenchStyles.indexOf('@container (max-width: 860px)');
    const compactStart = workbenchStyles.indexOf('@container (max-width: 620px)');
    const mediumRules = workbenchStyles.slice(mediumStart, compactStart);
    const reducedMotionStart = workbenchStyles.indexOf('@media (prefers-reduced-motion: reduce)');
    const compactRules = workbenchStyles.slice(compactStart, reducedMotionStart);

    expect(headerRule).toContain('min-height: 53px');
    expect(headerRule).toContain('padding: 2px 16px');
    expect(stageLaneRule).toContain('height: 52px');
    expect(stageButtonRule).toContain('min-height: 34px');
    expect(currentStageButtonRule).not.toContain('background:');
    expect(contentRule).toContain('padding: 0');
    expect(queueRule).toContain('border-radius: 8px');
    expect(queueHeaderRule).toContain('min-height: 60px');
    expect(filterRowRule).toContain('grid-template-columns: 120px 120px 130px 180px 140px 130px minmax(0, 1fr) auto');
    expect(liveFilterRowRule).toContain(
      'grid-template-columns: 112px 112px 120px minmax(150px, 1fr) 130px minmax(0, 1fr) auto'
    );
    expect(filterActionsRule).toContain('grid-column: -2 / -1');
    expect(filterActionsRule).toContain('justify-content: flex-end');
    expect(footerRule).toContain('min-height: 44px');
    expect(footerRule).toContain('justify-content: flex-end');
    expect(queueRule).toContain('flex: 1 1 auto');
    expect(querySpinRule).toContain('height: 100%');
    expect(querySpinRule).toContain('min-height: 100%');
    expect(emptyRule).toContain('justify-content: center');
    expect(tableFillBlock).toContain('.arco-table > .arco-spin > .arco-spin-children');
    expect(tableFillBlock).toContain('.arco-table-container');
    expect(tableFillBlock).toContain('.arco-table-content-scroll');
    expect(tableFillBlock).toContain('.arco-table-content-inner');
    expect(tableFillBlock).toContain('height: 100%');
    expect(tableScrollRule).toContain('display: flex');
    expect(tableScrollRule).toContain('flex-direction: column');
    expect(tableInnerRule).toContain('flex: 1 1 auto');
    expect(tableInnerRule).toContain('overflow: auto');
    expect(tableInnerRule).not.toMatch(/position:\s*(fixed|sticky)/);
    expect(mediumRules).toContain('min-width: 0');
    expect(mediumRules).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(mediumRules).toContain('flex-wrap: wrap');
    expect(compactRules).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(compactRules).toMatch(/\.toolbarActions,\s*\.footerControls\s*{[^}]*width:\s*100%/s);
  });

  it('keeps the header title group intact while the scope owns horizontal overflow', () => {
    const titleRule = workbenchStyles.match(/\.titleLine\s*{([^}]*)}/)?.[1] ?? '';
    const titleTypographyRule =
      workbenchStyles.match(/\.titleLine :global\(\.arco-typography\)\s*{([^}]*)}/)?.[1] ?? '';
    const scopeRule = workbenchStyles.match(/\.scope\s*{([^}]*)}/)?.[1] ?? '';
    const scopeItemRule = workbenchStyles.match(/\.scope > span\s*{([^}]*)}/)?.[1] ?? '';
    const mediumStart = workbenchStyles.indexOf('@container (max-width: 860px)');
    const compactStart = workbenchStyles.indexOf('@container (max-width: 620px)');
    const mediumRules = workbenchStyles.slice(mediumStart, compactStart);

    expect(titleRule).toContain('min-width: 176px');
    expect(titleRule).toContain('width: max-content');
    expect(titleRule).toContain('flex: 0 0 auto');
    expect(titleTypographyRule).toContain('white-space: nowrap');
    expect(scopeRule).toContain('flex: 1 1 auto');
    expect(scopeRule).toContain('overflow-x: auto');
    expect(scopeItemRule).toContain('flex: 0 0 auto');
    expect(mediumStart).toBeGreaterThan(-1);
    expect(compactStart).toBeGreaterThan(mediumStart);
    expect(mediumRules).toContain('flex-direction: column');
    expect(mediumRules).toContain('min-height: 77px');
    expect(mediumRules).toContain('width: 100%');
    expect(mediumRules).toContain('overflow-x: auto');
  });

  it('keeps cascade changes as drafts until apply and shows matching progress results', async () => {
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-02'
        t={t}
        onContextChange={vi.fn()}
        queryClient={null}
      />
    );

    const select = async (label: string, option: string) => {
      fireEvent.click(screen.getByRole('combobox', { name: label }));
      fireEvent.click(await screen.findByRole('option', { name: option }));
    };

    await select('大区', '华北大区');
    await select('省区', '河北省区');
    await select('区域', '石家庄经销分区');
    await select('客户', '10154901 · 北辰食品商贸');
    await select('审批状态', '待审批');
    await select('健康度', '预警');
    expect(screen.getByText('草稿待应用')).toBeVisible();
    expect(screen.getByText('当前 4 条 · 待审批 2 条', { exact: true })).toBeVisible();

    await select('大区', '华东大区');
    expect(screen.getByRole('combobox', { name: '省区' })).toHaveTextContent('全部省区');
    expect(screen.getByRole('combobox', { name: '区域' })).toHaveTextContent('全部区域');
    expect(screen.getByRole('combobox', { name: '客户' })).toHaveTextContent('全部客户');

    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(screen.getByText('当前 1 条 · 待审批 0 条', { exact: true })).toBeVisible());
    expect(screen.getByText('已应用')).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: '审批核对队列' })).queryByText('华北大区', { exact: true })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看提报进度' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('共 1 条');
    expect(within(screen.getByTestId('regional-approval-progress-results')).getAllByText('华东大区')).toHaveLength(1);
    expect(screen.getByTestId('regional-approval-queue-footer')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '每页条数' })).toHaveTextContent('20 条/页');
  });

  it('selects organizations as pending context and exposes the complete queue columns and scoped actions', async () => {
    const onContextChange = vi.fn();
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-selection'
        t={t}
        onContextChange={onContextChange}
        queryClient={null}
      />
    );

    const queue = screen.getByRole('region', { name: '审批核对队列' });
    for (const heading of [
      '组织名称',
      'AI 核对意见',
      '计划数量',
      '计划金额',
      '计划进度',
      '版本对比',
      '退回原因',
      '审批状态',
    ]) {
      expect(within(queue).getByRole('columnheader', { name: heading })).toBeVisible();
    }
    expect(within(queue).getByText('3 家客户未提报；2 个 SKU 偏离历史销量')).toBeVisible();

    const checkboxes = within(queue).getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    await waitFor(() => expect(screen.getByRole('button', { name: '退回' })).toBeEnabled());
    expect(screen.getByRole('button', { name: '提交至品类审核' })).toBeEnabled();
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectedEntities: [expect.objectContaining({ id: 'north-area' })] }),
        'conversation-a'
      )
    );
  });

  it('applies a health tag as an immediate health filter', async () => {
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-health-shortcut'
        t={t}
        onContextChange={vi.fn()}
        queryClient={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '按预警筛选' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '健康度' })).toHaveTextContent('预警'));
    expect(screen.getByText('已应用')).toBeVisible();
    expect(screen.getByText('当前 1 条 · 待审批 1 条', { exact: true })).toBeVisible();
  });

  it('returns every selected writable Fixture organization and reports the batch outcome', async () => {
    const actionExecutor = vi.fn(async (command) => ({
      source: 'fixture' as const,
      resultId: `fixture-${command.scope.organizationId}`,
      completedAt: '2026-09-01T00:00:00.000Z',
    }));
    const onContextChange = vi.fn();
    render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-batch'
        t={t}
        onContextChange={onContextChange}
        actionExecutor={actionExecutor}
        queryClient={null}
      />
    );

    const enabledRows = within(screen.getByRole('region', { name: '审批核对队列' }))
      .getAllByRole('checkbox')
      .filter((checkbox) => !checkbox.hasAttribute('disabled') && checkbox.hasAttribute('value'));
    fireEvent.click(enabledRows[0]);
    fireEvent.click(enabledRows[1]);
    await waitFor(() => expect(screen.getByRole('button', { name: '退回', exact: true })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: '退回', exact: true }));
    fireEvent.click(screen.getByRole('combobox', { name: '退回目标（必填）' }));
    fireEvent.click(await screen.findByRole('option', { name: '上一审批节点' }));
    fireEvent.change(screen.getByRole('textbox', { name: '退回原因（必填）' }), {
      target: { value: '批量补齐业务证据' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认退回（仅本地）' }));

    expect(await screen.findByText('批量操作完成：成功 2 个，失败 0 个。')).toBeVisible();
    expect(actionExecutor).toHaveBeenCalledTimes(2);
    expect(actionExecutor.mock.calls.map(([command]) => command.scope.organizationId)).toEqual([
      'north-area',
      'central-area',
    ]);
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          localApprovalResults: expect.arrayContaining([expect.anything(), expect.anything()]),
        }),
        'conversation-a'
      )
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '提交至品类审核' }));
    fireEvent.click(await screen.findByRole('tab', { name: '提交审批' }));
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '我确认当前组织、版本和已保存调整摘要无误；仅生成本地样例结果。',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: '确认提交（仅本地）' }));
    expect(await screen.findByText('批量操作完成：成功 2 个，失败 0 个。')).toBeVisible();
    expect(actionExecutor).toHaveBeenCalledTimes(4);
  });

  it('keeps SKU adjustments in the stable Workbench while Context callbacks remain conversation-addressed', async () => {
    const onContextChange = vi.fn();
    const view = render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-03'
        t={t}
        onContextChange={onContextChange}
        queryClient={null}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: '品类维度' }));
    fireEvent.click(screen.getByRole('button', { name: '查看 华北大区 证据与调整' }));
    const detail = await screen.findByTestId('regional-approval-plan-detail');
    expect(detail).toBeVisible();
    expect(within(detail).getByRole('tab', { name: '按省区' })).toBeVisible();
    expect(within(detail).getByRole('tab', { name: '按区域' })).toBeVisible();
    expect(within(detail).getByRole('tab', { name: '按客户' })).toBeVisible();
    const wholeQuantity = screen.getByRole('spinbutton', { name: '调整后的计划数量' });
    const wholeAmount = screen.getByRole('spinbutton', { name: '调整后的计划金额' });
    fireEvent.change(wholeQuantity, { target: { value: '12000' } });
    fireEvent.change(wholeAmount, { target: { value: '920000' } });
    fireEvent.change(screen.getByRole('textbox', { name: '业务调整原因' }), {
      target: { value: 'Fixture 整单促销调整' },
    });
    expect(wholeQuantity).toHaveValue('12000');
    expect(wholeAmount).toHaveValue('920000');
    fireEvent.change(screen.getByRole('textbox', { name: '业务调整原因' }), { target: { value: '' } });
    const firstSku = screen.getByTestId('approval-detail-north-area-FSKU001');
    expect(within(firstSku).getByRole('alert')).toHaveTextContent('AI 建议');
    fireEvent.click(within(firstSku).getByRole('button', { name: '采纳' }));
    expect(screen.getByText('有未保存调整')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(await screen.findByText('存在未保存调整')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.getByText('存在未保存调整')).not.toBeVisible());
    expect(screen.getByTestId('regional-approval-plan-detail')).toBeVisible();

    fireEvent.click(screen.getByRole('combobox', { name: '证据版本' }));
    fireEvent.click(await screen.findByRole('option', { name: '上一版' }));
    expect(await screen.findByText('存在未保存调整')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '保留草稿并继续' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '证据版本' })).toHaveTextContent('上一版'));
    fireEvent.click(screen.getByRole('combobox', { name: '证据版本' }));
    fireEvent.click(await screen.findByRole('option', { name: '最新版' }));
    await waitFor(() => expect(screen.getByText('已采纳')).toBeVisible());

    fireEvent.click(screen.getByRole('combobox', { name: '组织计划' }));
    fireEvent.click(await screen.findByRole('option', { name: '华东大区' }));
    expect(await screen.findByText('存在未保存调整')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByRole('combobox', { name: '组织计划' })).toHaveTextContent('华北大区');

    fireEvent.click(screen.getByRole('button', { name: '保存调整（仅本地）' }));
    expect(await screen.findByText('有 1 条必填调整原因未填写。')).toBeVisible();
    fireEvent.change(within(firstSku).getByRole('textbox', { name: 'FSKU001 调整原因' }), {
      target: { value: 'Fixture 节庆备货调整' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存调整（仅本地）' }));
    expect(await screen.findByText('调整已保存到本地看板草稿；尚未发送或提交。')).toBeVisible();
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          changes: [expect.objectContaining({ organizationId: 'north-area', version: 'current' })],
          metrics: expect.objectContaining({ savedAdjustmentCount: 1 }),
        }),
        'conversation-a'
      )
    );

    session.conversationId = 'conversation-b';
    view.rerender(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-03'
        t={t}
        onContextChange={onContextChange}
        queryClient={null}
      />
    );
    expect(screen.getByText('已采纳')).toBeVisible();
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ changes: [expect.objectContaining({ organizationId: 'north-area' })] }),
        'conversation-b'
      )
    );
  }, 60_000);

  it('keeps adjustments through a failed Fixture return, retries, submits once, and restores across Conversations', async () => {
    const onContextChange = vi.fn();
    const fixtureOutcome = {
      source: 'fixture' as const,
      resultId: 'fixture-dom-result',
      completedAt: '2026-09-01T00:00:00.000Z',
    };
    const actionExecutor = vi
      .fn()
      .mockRejectedValueOnce(new Error('fixture_fail_once'))
      .mockResolvedValue(fixtureOutcome);
    const view = render(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-04'
        t={t}
        onContextChange={onContextChange}
        actionExecutor={actionExecutor}
        queryClient={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '查看 华北大区 证据与调整' }));
    const firstSku = await screen.findByTestId('approval-detail-north-area-FSKU001');
    fireEvent.click(within(firstSku).getByRole('button', { name: '采纳' }));
    fireEvent.change(within(firstSku).getByRole('textbox', { name: 'FSKU001 调整原因' }), {
      target: { value: '保留到审批后的调整' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存调整（仅本地）' }));
    await screen.findByText('调整已保存到本地看板草稿；尚未发送或提交。');
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: '退回', exact: true }));
    expect(await screen.findByTestId('regional-approval-action-dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认退回（仅本地）' }));
    expect(await screen.findByText('请补全退回目标、影响范围和退回原因。')).toBeVisible();
    expect(actionExecutor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('combobox', { name: '退回目标（必填）' }));
    fireEvent.click(await screen.findByRole('option', { name: '上一审批节点' }));
    fireEvent.change(screen.getByRole('textbox', { name: '退回原因（必填）' }), {
      target: { value: '补齐高偏差 SKU 证据' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认退回（仅本地）' }));
    expect(await screen.findByText(/本地样例操作失败（fixture_fail_once）/)).toBeVisible();
    expect(screen.getByRole('textbox', { name: '退回原因（必填）' })).toHaveValue('补齐高偏差 SKU 证据');
    expect(actionExecutor).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '重试本地操作' }));
    expect(await screen.findByText('本地样例操作成功；未触发真实审批。')).toBeVisible();
    expect(actionExecutor).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          changes: [expect.objectContaining({ reason: '保留到审批后的调整' })],
          localApprovalResults: [expect.objectContaining({ source: 'fixture', kind: 'return' })],
        }),
        'conversation-a'
      )
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(await screen.findByText('已退回 · 本地样例')).toBeVisible();

    session.conversationId = 'conversation-b';
    view.rerender(
      <RegionalApprovalWorkbench
        stateScope='user:forecast-fixture-04'
        t={t}
        onContextChange={onContextChange}
        actionExecutor={actionExecutor}
        queryClient={null}
      />
    );
    expect(screen.getByText('已退回 · 本地样例')).toBeVisible();
    await waitFor(() =>
      expect(onContextChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ localApprovalResults: [expect.objectContaining({ kind: 'return' })] }),
        'conversation-b'
      )
    );

    fireEvent.click(screen.getByRole('button', { name: '提交至品类审核' }));
    fireEvent.click(await screen.findByRole('tab', { name: '提交审批' }));
    expect(screen.getByText(/FSKU001 · \d+ → \d+ · 保留到审批后的调整/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认提交（仅本地）' }));
    expect(await screen.findByText('确认摘要后才能执行本地提交。')).toBeVisible();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: '我确认当前组织、版本和已保存调整摘要无误；仅生成本地样例结果。',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: '确认提交（仅本地）' }));
    expect(await screen.findByText('本地样例操作成功；未触发真实审批。')).toBeVisible();
    expect(actionExecutor).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: '已完成（防重复）' }));
    expect(actionExecutor).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(await screen.findByText('已提交 · 本地样例')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '查看 华北大区 证据与调整' }));
    expect(await screen.findByTestId('approval-detail-north-area-FSKU001')).toHaveTextContent('已采纳');
  }, 60_000);
});
