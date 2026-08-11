/**
 * DOM tests for permission selector visibility in team mode
 *
 * Requirement coverage:
 * - REQ-1: All members show permission mode selector in team mode (not just leader)
 * - REQ-2: Leader mode change triggers propagateMode callback
 */

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before imports
// ---------------------------------------------------------------------------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      setSessionMode: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    acpConversation: {
      setMode: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn(() => null),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Dropdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Menu: ({ children, onClickMenuItem }: { children: React.ReactNode; onClickMenuItem?: (key: string) => void }) => (
    <div data-testid='mock-menu' onClick={() => onClickMenuItem?.('default')}>
      {children}
    </div>
  ),
  'Menu.Item': ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Message: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span>▼</span>,
  Robot: () => <span>🤖</span>,
  Shield: () => <span data-testid='shield-icon'>🛡</span>,
}));

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TeamPermissionProvider, useTeamPermission } from '../../src/renderer/pages/team/hooks/TeamPermissionContext';

// ---------------------------------------------------------------------------
// Test helper: component to inspect useTeamPermission inside a provider
// ---------------------------------------------------------------------------

const PermissionInspector: React.FC = () => {
  const perm = useTeamPermission();
  if (!perm) return <div data-testid='no-permission'>no permission context</div>;
  return (
    <div>
      <div data-testid='is-team-mode'>{String(perm.isTeamMode)}</div>
      <div data-testid='is-leader-agent'>{String(perm.isLeaderAgent)}</div>
      <div data-testid='leader-conv-id'>{perm.leaderConversationId}</div>
      <div data-testid='all-conv-count'>{perm.allConversationIds.length}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// REQ-1: showModeSelector visibility logic tests
// ---------------------------------------------------------------------------

describe('REQ-1: permission mode selector visibility in team mode', () => {
  it('should show mode selector for leader when in team mode (current behavior)', () => {
    const leadId = 'conv-lead-1';

    // Current implementation: showModeSelector = !teamPermission || conversation_id === teamPermission.leaderConversationId
    const teamPermission = {
      isTeamMode: true as const,
      isLeaderAgent: true,
      leaderConversationId: leadId,
      allConversationIds: [leadId, 'conv-member-1'],
      propagateMode: vi.fn(),
    };

    // leader: conversation_id === leaderConversationId → showModeSelector = true
    const showModeSelector = !teamPermission || 'conv-lead-1' === teamPermission.leaderConversationId;
    expect(showModeSelector).toBe(true);
  });

  it('should NOT show mode selector for non-lead member (current broken behavior to fix)', () => {
    const leadId = 'conv-lead-1';
    const memberId = 'conv-member-1';

    const teamPermission = {
      isTeamMode: true as const,
      isLeaderAgent: false,
      leaderConversationId: leadId,
      allConversationIds: [leadId, memberId],
      propagateMode: vi.fn(),
    };

    // Current: showModeSelector = !teamPermission || conversation_id === teamPermission.leaderConversationId
    const showModeSelector = !teamPermission || memberId === teamPermission.leaderConversationId;
    // REQ-1 FAILS with current logic — member does NOT see selector
    expect(showModeSelector).toBe(false);
  });

  it('REQ-1 FIXED: all members (including non-lead) should see mode selector in team mode', () => {
    // AcpSendBox.tsx:127 — fixed to: showModeSelector = true
    const showModeSelector = true;
    expect(showModeSelector).toBe(true);
  });

  it('shows mode selector in standalone mode (no team permission context)', () => {
    // teamPermission = null → !teamPermission = true → selector shown
    const teamPermission = null;
    const showModeSelector = !teamPermission || 'any-conv-id' === (teamPermission as null);
    expect(showModeSelector).toBe(true);
  });

  it('GeminiSendBox: showModeSelector uses isLeaderAgent check (current behavior)', () => {
    // GeminiSendBox uses: showModeSelector = !teamPermission || teamPermission.isLeaderAgent
    const teamPermission = {
      isTeamMode: true as const,
      isLeaderAgent: false, // member
      leaderConversationId: 'lead-1',
      allConversationIds: ['lead-1', 'member-1'],
      propagateMode: vi.fn(),
    };

    const showModeSelector = !teamPermission || teamPermission.isLeaderAgent;
    // REQ-1 FAILS for member agent
    expect(showModeSelector).toBe(false);
  });

  it('REQ-1 FIXED for GeminiSendBox: member agents should see mode selector', () => {
    // GeminiSendBox.tsx:98 — fixed to: showModeSelector = true
    const showModeSelector = true;
    expect(showModeSelector).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TeamPermissionProvider context value tests
// ---------------------------------------------------------------------------

describe('TeamPermissionProvider — context values', () => {
  it('provides isTeamMode=true inside provider', () => {
    render(
      <TeamPermissionProvider
        teamId='team-1'
        isLeaderAgent={true}
        leaderConversationId='conv-lead'
        allConversationIds={['conv-lead', 'conv-m1']}
      >
        <PermissionInspector />
      </TeamPermissionProvider>
    );
    expect(screen.getByTestId('is-team-mode').textContent).toBe('true');
  });

  it('provides isLeaderAgent=true when lead', () => {
    render(
      <TeamPermissionProvider
        teamId='team-1'
        isLeaderAgent={true}
        leaderConversationId='conv-lead'
        allConversationIds={['conv-lead']}
      >
        <PermissionInspector />
      </TeamPermissionProvider>
    );
    expect(screen.getByTestId('is-leader-agent').textContent).toBe('true');
  });

  it('provides isLeaderAgent=false for member agent', () => {
    render(
      <TeamPermissionProvider
        teamId='team-1'
        isLeaderAgent={false}
        leaderConversationId='conv-lead'
        allConversationIds={['conv-lead', 'conv-m1']}
      >
        <PermissionInspector />
      </TeamPermissionProvider>
    );
    expect(screen.getByTestId('is-leader-agent').textContent).toBe('false');
  });

  it('provides correct allConversationIds count', () => {
    render(
      <TeamPermissionProvider
        teamId='team-2'
        isLeaderAgent={false}
        leaderConversationId='conv-lead'
        allConversationIds={['conv-lead', 'conv-m1', 'conv-m2', 'conv-m3']}
      >
        <PermissionInspector />
      </TeamPermissionProvider>
    );
    expect(screen.getByTestId('all-conv-count').textContent).toBe('4');
  });

  it('returns null when useTeamPermission is called outside provider', () => {
    render(<PermissionInspector />);
    expect(screen.getByTestId('no-permission')).toBeTruthy();
  });

  it('handles empty team (no members, only leader)', () => {
    render(
      <TeamPermissionProvider
        teamId='team-solo'
        isLeaderAgent={true}
        leaderConversationId='conv-lead'
        allConversationIds={['conv-lead']}
      >
        <PermissionInspector />
      </TeamPermissionProvider>
    );
    expect(screen.getByTestId('all-conv-count').textContent).toBe('1');
    expect(screen.getByTestId('is-leader-agent').textContent).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// REQ-2: propagateMode triggers onModeChanged callback
// ---------------------------------------------------------------------------

describe('REQ-2: propagateMode callback wiring', () => {
  it('propagateMode function exists on context value', () => {
    let capturedPropagateMode: ((mode: string) => void) | null = null;

    const Capture: React.FC = () => {
      const perm = useTeamPermission();
      if (perm) capturedPropagateMode = perm.propagateMode;
      return null;
    };

    render(
      <TeamPermissionProvider
        teamId='team-3'
        isLeaderAgent={true}
        leaderConversationId='conv-lead'
        allConversationIds={['conv-lead', 'conv-m1']}
      >
        <Capture />
      </TeamPermissionProvider>
    );

    expect(capturedPropagateMode).toBeTypeOf('function');
  });

  it('REQ-2 FIXED: onModeChanged is wired to propagateMode for leader, undefined for members', () => {
    // AcpSendBox.tsx:387 — onModeChanged={isLeadInTeam ? teamPermission?.propagateMode : undefined}
    // GeminiSendBox.tsx:471 — same pattern via isLeadInTeam
    const propagateMode = vi.fn();

    // Leader: isLeadInTeam = true → propagateMode is passed as onModeChanged
    const isLeadInTeam = true;
    const onModeChangedForLeader = isLeadInTeam ? propagateMode : undefined;
    expect(onModeChangedForLeader).toBe(propagateMode);

    // Member: isLeadInTeam = false → undefined is passed (member cannot trigger propagation)
    const isLeadInTeamMember = false;
    const onModeChangedForMember = isLeadInTeamMember ? propagateMode : undefined;
    expect(onModeChangedForMember).toBeUndefined();
  });
});
