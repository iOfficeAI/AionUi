import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@arco-design/web-react', () => {
  const LayoutComponent = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  LayoutComponent.Sider = ({
    children,
    className,
    collapsed,
    collapsedWidth,
    width,
  }: {
    children?: React.ReactNode;
    className?: string;
    collapsed?: boolean;
    collapsedWidth?: number;
    width?: number;
  }) => (
    <aside
      className={className}
      data-testid='layout-sider'
      data-collapsed={String(Boolean(collapsed))}
      data-collapsed-width={String(collapsedWidth)}
      data-width={String(width)}
    >
      {children}
    </aside>
  );
  LayoutComponent.Header = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <header className={className}>{children}</header>
  );
  LayoutComponent.Content = ({
    children,
    className,
    onClick,
  }: {
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <main className={className} onClick={onClick}>
      {children}
    </main>
  );
  return { Layout: LayoutComponent };
});

vi.mock('@icon-park/react', () => ({
  MenuFold: () => <span data-testid='menu-fold' />,
  MenuUnfold: () => <span data-testid='menu-unfold' />,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      logStream: { on: vi.fn(() => vi.fn()) },
      openDevTools: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('@/common/config/constants', () => ({
  TEAM_MODE_ENABLED: false,
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/renderer/components/layout/Titlebar', () => ({
  default: () => <div data-testid='titlebar' />,
}));

vi.mock('@/renderer/components/layout/PwaPullToRefresh', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/settings/UpdateModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/system/useDeepLink', () => ({
  useDeepLink: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useNotificationClick', () => ({
  useNotificationClick: vi.fn(),
}));

vi.mock('@/renderer/hooks/file/useDirectorySelection', () => ({
  useDirectorySelection: () => ({ contextHolder: null }),
}));

vi.mock('@/renderer/hooks/agent/useMultiAgentDetection', () => ({
  useMultiAgentDetection: () => ({ contextHolder: null }),
}));

vi.mock('@/renderer/hooks/ui/useConversationShortcuts', () => ({
  useConversationShortcuts: vi.fn(),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/utils/theme/customCssProcessor', () => ({
  processCustomCss: (css: string) => css,
}));

vi.mock('@/renderer/utils/theme/themeCssSync', () => ({
  computeCssSyncDecision: () => ({
    shouldSkipApply: true,
    shouldHealStorage: false,
    effectiveCss: '',
  }),
  resolveCssByActiveTheme: () => '',
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
}));

window.PointerEvent = MouseEvent as typeof PointerEvent;
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

import Layout from '@/renderer/components/layout/Layout';

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/conversation/conv-1']}>
      <Routes>
        <Route path='*' element={<Layout sider={<div data-testid='sider-content' />} />} />
      </Routes>
    </MemoryRouter>
  );

const dispatchMouse = (
  target: Window | Element,
  type: 'mousedown' | 'mousemove' | 'mouseup',
  init: { clientX?: number; button?: number; buttons?: number } = {}
) => {
  const eventInit = { clientX: init.clientX ?? 0, button: init.button ?? 0, buttons: init.buttons ?? 1 };
  if (type === 'mousedown') {
    fireEvent.mouseDown(target, eventInit);
    return;
  }
  if (type === 'mousemove') {
    fireEvent.mouseMove(target, eventInit);
    return;
  }
  fireEvent.mouseUp(target, eventInit);
};

describe('Layout sidebar resize', () => {
  it('renders the desktop sidebar splitter with the default width', () => {
    window.innerWidth = 1280;
    renderLayout();

    const sider = screen.getByTestId('layout-sider');
    expect(sider).toHaveAttribute('data-width', '250');
    expect(sider).toHaveAttribute('data-collapsed', 'false');
    expect(sider.querySelector('.cursor-col-resize')).not.toBeNull();
  });
});
