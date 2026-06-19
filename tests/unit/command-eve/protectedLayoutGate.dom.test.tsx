import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the seams ProtectedLayout reads, plus the lazy gate page + onboarding host
// + AppLoader, so we exercise ONLY the gate-first precedence + desktop scoping.
const useAuthMock = vi.fn();
const useEntitlementGateMock = vi.fn();
const isElectronDesktopMock = vi.fn();

vi.mock('@renderer/hooks/context/AuthContext', () => ({ useAuth: () => useAuthMock() }));
vi.mock('@renderer/hooks/useEntitlementGate', () => ({ useEntitlementGate: () => useEntitlementGateMock() }));
vi.mock('@renderer/utils/platform', () => ({ isElectronDesktop: () => isElectronDesktopMock() }));
vi.mock('@renderer/components/layout/AppLoader', () => ({ default: () => <div data-testid="loader">loading</div> }));
vi.mock('@renderer/pages/registrationGate', () => ({ default: () => <div data-testid="reg-gate">GATE</div> }));
vi.mock('@renderer/components/billing/DayZeroOnboardingHost', () => ({ default: () => null }));

import { ProtectedLayout } from '@renderer/components/layout/Router';

function renderPL() {
  return render(
    <MemoryRouter initialEntries={['/guid']}>
      <Routes>
        <Route path='/login' element={<div data-testid='login-page'>LOGIN</div>} />
        <Route path='*' element={<ProtectedLayout layout={<div data-testid='main'>MAIN</div>} />} />
      </Routes>
    </MemoryRouter>
  );
}

const gate = (over: Partial<{ loading: boolean; blocked: boolean }> = {}) => ({
  loading: false,
  status: null,
  blocked: false,
  refresh: vi.fn(),
  ...over,
});

describe('ProtectedLayout — gate-first precedence + desktop scoping', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    useEntitlementGateMock.mockReset();
    isElectronDesktopMock.mockReset().mockReturnValue(true); // desktop by default
  });

  it('DESKTOP + not entitled (gateBlocked) → renders the registration gate, NOT the app', async () => {
    useAuthMock.mockReturnValue({ status: 'unauthenticated' });
    useEntitlementGateMock.mockReturnValue(gate({ blocked: true }));
    renderPL();
    expect(await screen.findByTestId('reg-gate')).toBeTruthy();
    expect(screen.queryByTestId('main')).toBeNull();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('DESKTOP + entitled → renders the app', () => {
    useAuthMock.mockReturnValue({ status: 'authenticated' });
    useEntitlementGateMock.mockReturnValue(gate({ blocked: false }));
    renderPL();
    expect(screen.getByTestId('main')).toBeTruthy();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('DESKTOP + entitled but STALE status=unauthenticated → still renders the app (NO lockout)', () => {
    useAuthMock.mockReturnValue({ status: 'unauthenticated' }); // stale right after login
    useEntitlementGateMock.mockReturnValue(gate({ blocked: false }));
    renderPL();
    expect(screen.getByTestId('main')).toBeTruthy();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('shows the loader while auth status is checking OR the gate is loading (no first-paint flash)', () => {
    useAuthMock.mockReturnValue({ status: 'checking' });
    useEntitlementGateMock.mockReturnValue(gate({ loading: true, blocked: true }));
    renderPL();
    expect(screen.getByTestId('loader')).toBeTruthy();
    expect(screen.queryByTestId('main')).toBeNull();
    expect(screen.queryByTestId('reg-gate')).toBeNull();
  });

  it('WEBUI + not authenticated (gate not blocking) → redirects to /login (status backstop active off-desktop)', () => {
    isElectronDesktopMock.mockReturnValue(false);
    useAuthMock.mockReturnValue({ status: 'unauthenticated' });
    useEntitlementGateMock.mockReturnValue(gate({ blocked: false }));
    renderPL();
    expect(screen.getByTestId('login-page')).toBeTruthy();
    expect(screen.queryByTestId('main')).toBeNull();
  });
});
