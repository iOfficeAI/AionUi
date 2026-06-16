import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => {
      if (o?.count != null && o?.agent != null) return `${k}:${o.agent}=${o.count}`;
      if (o?.agent != null) return `${k}:${o.agent}`;
      return k;
    },
  }),
}));

import SourceBanner from '@renderer/pages/settings/UsageStats/SourceBanner';
import type { UsageSourceStatus } from '@/common/types/agentUsage';

const src = (over: Partial<UsageSourceStatus>): UsageSourceStatus => ({
  agent: 'claude',
  filesTotal: 10,
  filesParsed: 10,
  filesSkipped: 0,
  available: true,
  error: null,
  ...over,
});

describe('SourceBanner', () => {
  it('全部 available 且无 skipped 时返回 null (不渲染 Alert)', () => {
    const { container } = render(<SourceBanner sources={[src({}), src({ agent: 'codex' })]} />);
    expect(container.innerHTML).toBe('');
  });

  it('当 source.available=false 时显示 missing 警告', () => {
    render(<SourceBanner sources={[src({ available: false })]} />);
    expect(screen.getByText(/usageStats\.source\.missing:claude/)).toBeTruthy();
  });

  it('当 filesSkipped > 0 时显示 skipped 警告 (含 count)', () => {
    render(<SourceBanner sources={[src({ filesSkipped: 5 })]} />);
    expect(screen.getByText(/usageStats\.source\.skipped:claude=5/)).toBeTruthy();
  });

  it('多个 source 都有问题时, 消息用 · 拼接', () => {
    render(<SourceBanner sources={[src({ available: false }), src({ agent: 'codex', filesSkipped: 3 })]} />);
    const alert = screen.getByText(/usageStats\.source\.missing:claude.*·.*usageStats\.source\.skipped:codex=3/);
    expect(alert).toBeTruthy();
  });

  it('优先级: available=false 时不再检查 skipped (两个条件不会同时出现)', () => {
    // 源代码用 if/else if, available=false 走 missing 分支, skipped 不会被加
    render(<SourceBanner sources={[src({ available: false, filesSkipped: 99 })]} />);
    expect(screen.queryByText(/skipped/)).toBeNull();
    expect(screen.getByText(/missing/)).toBeTruthy();
  });
});
