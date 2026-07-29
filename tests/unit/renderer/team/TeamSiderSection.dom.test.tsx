/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TeamSiderSection from '@/renderer/components/layout/Sider/TeamSiderSection';
import type { TTeam } from '@/common/types/team/teamTypes';

const removeTeamMock = vi.fn();
const navigateMock = vi.fn();
let lastConfirmConfig: Record<string, unknown> | null = null;

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false, siderCollapsed: false, setSiderCollapsed: vi.fn() }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => ({
    teams: [
      team({ id: 'team-normal', name: 'Normal Team' }),
      team({
        id: 'team-adhoc',
        name: 'Ad-hoc Team',
        origin_conversation_id: 'conv-origin',
      }),
    ],
    mutate: vi.fn(),
    removeTeam: (...args: unknown[]) => removeTeamMock(...args),
  }),
}));

vi.mock('@/renderer/pages/team/hooks/useSiderTeamBadges', () => ({
  useSiderTeamBadges: () => new Map(),
}));

vi.mock('@renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
}));

vi.mock('@/renderer/components/layout/Sider/SiderItem', () => ({
  default: ({ name, onMenuAction }: { icon?: React.ReactNode; name: string; onMenuAction?: (key: string) => void }) => (
    <div data-testid='sider-item' data-name={name}>
      <button data-testid='sider-item-delete-btn' onClick={() => onMenuAction?.('delete')}>
        {name}
      </button>
    </div>
  ),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Modal: {
      ...actual.Modal,
      confirm: (config: Record<string, unknown>) => {
        lastConfirmConfig = config;
      },
    },
    Input: ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
      <input value={value} onChange={(e) => onChange?.(e.target.value)} />
    ),
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function team(overrides?: Partial<TTeam>): TTeam {
  return {
    id: 'team-1',
    user_id: 'user-1',
    name: 'Test Team',
    workspace: '/tmp/team',
    workspace_mode: 'shared',
    leader_assistant_id: 'leader',
    assistants: [],
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function LocationSpy() {
  const location = useLocation();
  return <div data-testid='location-spy'>{location.pathname}</div>;
}

async function openDeleteMenuFor(index: number) {
  const deleteBtn = screen.getAllByTestId('sider-item-delete-btn')[index];
  fireEvent.click(deleteBtn);
}

async function confirmDelete() {
  expect(lastConfirmConfig).not.toBeNull();
  const onOk = lastConfirmConfig?.onOk as (() => Promise<void>) | undefined;
  expect(onOk).toBeDefined();
  await onOk?.();
}

describe('TeamSiderSection ad-hoc delete navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeTeamMock.mockResolvedValue(undefined);
    lastConfirmConfig = null;
    localStorage.setItem('team-section-expanded', 'true');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('navigates back to origin conversation after deleting an ad-hoc team', async () => {
    render(
      <MemoryRouter initialEntries={['/team/team-adhoc']}>
        <TeamSiderSection collapsed={false} pathname='/team/team-adhoc' siderTooltipProps={{}} />
        <LocationSpy />
      </MemoryRouter>
    );

    await openDeleteMenuFor(1);
    await confirmDelete();

    await waitFor(() => expect(removeTeamMock).toHaveBeenCalledWith('team-adhoc'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/conversation/conv-origin', { replace: true }));
  });

  it('navigates to home for normal teams without origin_conversation_id', async () => {
    const originalHash = window.location.hash;
    window.location.hash = '#/team/team-normal';

    render(
      <MemoryRouter initialEntries={['/team/team-normal']}>
        <TeamSiderSection collapsed={false} pathname='/team/team-normal' siderTooltipProps={{}} />
        <LocationSpy />
      </MemoryRouter>
    );

    await openDeleteMenuFor(0);
    await confirmDelete();

    await waitFor(() => expect(removeTeamMock).toHaveBeenCalledWith('team-normal'));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(navigateMock).not.toHaveBeenCalled();

    window.location.hash = originalHash;
  });

  it('does not navigate when team deletion fails', async () => {
    removeTeamMock.mockRejectedValue(new Error('remove failed'));

    render(
      <MemoryRouter initialEntries={['/team/team-adhoc']}>
        <TeamSiderSection collapsed={false} pathname='/team/team-adhoc' siderTooltipProps={{}} />
        <LocationSpy />
      </MemoryRouter>
    );

    await openDeleteMenuFor(1);
    await expect(confirmDelete()).rejects.toThrow('remove failed');

    await waitFor(() => expect(removeTeamMock).toHaveBeenCalledWith('team-adhoc'));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('TeamSiderSection ad-hoc visual differentiation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('team-section-expanded', 'true');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('marks ad-hoc teams with data-is-adhoc attribute in expanded view', () => {
    render(
      <MemoryRouter initialEntries={['/conversation/conv-origin']}>
        <TeamSiderSection collapsed={false} pathname='/conversation/conv-origin' siderTooltipProps={{}} />
      </MemoryRouter>
    );

    const adHocContainers = document.querySelectorAll('[data-is-adhoc="true"]');
    const normalContainers = document.querySelectorAll('[data-is-adhoc="false"]');

    expect(adHocContainers).toHaveLength(1);
    expect(normalContainers).toHaveLength(1);

    const adHocName = adHocContainers[0]!.querySelector('[data-testid="sider-item"]');
    const normalName = normalContainers[0]!.querySelector('[data-testid="sider-item"]');
    expect(adHocName?.getAttribute('data-name')).toBe('Ad-hoc Team');
    expect(normalName?.getAttribute('data-name')).toBe('Normal Team');
  });
});
