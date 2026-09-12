import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

const platform = vi.hoisted(() => ({ mac: false }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isMacOS: () => platform.mac,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...mod,
    Tooltip: ({ children, content }: { children?: React.ReactNode; content?: React.ReactNode }) => (
      <span data-tooltip-content={typeof content === 'string' ? content : undefined}>{children}</span>
    ),
  };
});

import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';

describe('SiderFooter settings/back shortcut hint', () => {
  beforeEach(() => {
    platform.mac = false;
  });

  const renderFooter = (props: Partial<React.ComponentProps<typeof SiderFooter>> = {}) =>
    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        collapsed
        theme='light'
        siderTooltipProps={{} as SiderTooltipProps}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
        {...props}
      />
    );

  it('shows the settings label with the Ctrl+, hint on Windows/Linux', () => {
    renderFooter();

    expect(document.querySelector('[data-tooltip-content="common.settings (Ctrl+,)"]')).not.toBeNull();
    expect(screen.getByText('common.settings')).toBeDefined();
  });

  it('shows the settings label with the ⌘, hint on macOS', () => {
    platform.mac = true;
    renderFooter();

    expect(document.querySelector('[data-tooltip-content="common.settings (⌘,)"]')).not.toBeNull();
  });

  it('shows the back label with the shortcut hint inside the settings view', () => {
    renderFooter({ isSettings: true });

    expect(document.querySelector('[data-tooltip-content="common.back (Ctrl+,)"]')).not.toBeNull();
  });
});
