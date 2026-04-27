import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@arco-design/web-react', () => {
  const LayoutComponent = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  LayoutComponent.Sider = ({
    children,
    className,
    collapsed,
  }: {
    children?: React.ReactNode;
    className?: string;
    collapsed?: boolean;
  }) => (
    <aside className={className} data-testid='layout-sider' data-collapsed={String(Boolean(collapsed))}>
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

// WebUI 模式：非 Electron，按视口宽度判断 mobile
// WebUI mode: not Electron, mobile detection falls back to viewport width
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
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

import Layout from '@/renderer/components/layout/Layout';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

const ContextProbe: React.FC = () => {
  const layout = useLayoutContext();
  return (
    <div
      data-testid='ctx-probe'
      data-mobile={String(Boolean(layout?.isMobile))}
      data-collapsed={String(Boolean(layout?.siderCollapsed))}
    >
      <button data-testid='ctx-expand' onClick={() => layout?.setSiderCollapsed(false)} />
    </div>
  );
};

const renderMobileLayout = () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 393, writable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  }
  return render(
    <MemoryRouter initialEntries={['/conversation/conv-1']}>
      <Routes>
        <Route path='*' element={<Layout sider={<ContextProbe />} />} />
      </Routes>
    </MemoryRouter>
  );
};

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280, writable: true });
});

describe('Layout mobile sider toggle', () => {
  it('keeps the sider expanded after the user expands it via LayoutContext', async () => {
    renderMobileLayout();

    const probe = await screen.findByTestId('ctx-probe');
    await waitFor(() => expect(probe).toHaveAttribute('data-mobile', 'true'));
    await waitFor(() => expect(probe).toHaveAttribute('data-collapsed', 'true'));

    act(() => {
      fireEvent.click(screen.getByTestId('ctx-expand'));
    });

    // After the user opens the sider, the "collapse on entering mobile" effect must
    // not re-run and fold it back. Regression guard for a previous bug where the
    // effect listed `collapsed` as a dependency.
    await waitFor(() => expect(probe).toHaveAttribute('data-collapsed', 'false'));
    expect(probe).toHaveAttribute('data-collapsed', 'false');
  });
});
