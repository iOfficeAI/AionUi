import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  AlarmClock: () => <span data-testid='alarm-clock-icon' />,
}));

import SiderScheduledEntry from '@/renderer/components/layout/Sider/SiderNav/SiderScheduledEntry';

const siderTooltipProps: SiderTooltipProps = {
  disabled: true,
};

describe('SiderScheduledEntry', () => {
  it('uses border-box sizing for the full-width desktop row so rounded corners are not clipped', () => {
    const onClick = vi.fn();

    render(
      <SiderScheduledEntry
        isMobile={false}
        isActive={false}
        collapsed={false}
        siderTooltipProps={siderTooltipProps}
        onClick={onClick}
      />
    );

    const entry = screen.getByText('cron.scheduledTasks').closest('div');
    expect(entry).not.toBeNull();
    expect(entry?.className).toContain('box-border');

    fireEvent.click(entry as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
