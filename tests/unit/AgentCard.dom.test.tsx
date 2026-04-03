/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any imports
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

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: vi.fn((backend: string) => (backend === 'gemini' ? '/gemini.svg' : null)),
  resolveAgentLogo: vi.fn((opts: { icon?: string; backend?: string }) => {
    if (opts.icon) return opts.icon;
    if (opts.backend === 'gemini') return '/gemini.svg';
    return null;
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  resolveExtensionAssetUrl: vi.fn((url?: string) => url),
}));

vi.mock('@icon-park/react', () => ({
  Setting: () => <span data-testid='icon-setting'>SettingIcon</span>,
  EditTwo: () => <span data-testid='icon-edit'>EditIcon</span>,
  Delete: () => <span data-testid='icon-delete'>DeleteIcon</span>,
  Robot: () => <span data-testid='icon-robot'>RobotIcon</span>,
}));

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import AgentCard from '../../src/renderer/pages/settings/AgentSettings/AgentCard';
import type { AcpBackendConfig } from '../../src/common/types/acpTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCustomAgent = (overrides: Partial<AcpBackendConfig> = {}): AcpBackendConfig => ({
  id: 'custom-1',
  name: 'My Custom Agent',
  defaultCliPath: '/usr/bin/agent',
  enabled: true,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentCard – detected variant', () => {
  it('renders the detected agent name', () => {
    render(<AgentCard type='detected' agent={{ backend: 'gemini', name: 'Gemini' }} />);
    expect(screen.getByText('Gemini')).toBeTruthy();
  });

  it('shows an img with the agent logo when getAgentLogo returns a value', () => {
    render(<AgentCard type='detected' agent={{ backend: 'gemini', name: 'Gemini' }} />);
    const img = screen.getByRole('img', { name: 'Gemini' }) as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('/gemini.svg');
  });

  it('shows the 🤖 fallback emoji when no logo is available', () => {
    render(<AgentCard type='detected' agent={{ backend: 'unknown', name: 'Unknown Agent' }} />);
    expect(screen.getByText('🤖')).toBeTruthy();
  });

  it('settings button is disabled by default', () => {
    render(<AgentCard type='detected' agent={{ backend: 'gemini', name: 'Gemini' }} />);
    const settingIcon = screen.getByTestId('icon-setting');
    const button = settingIcon.closest('button');
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);
  });

  it('calls onSettings when settingsDisabled={false} and button is clicked', () => {
    const onSettings = vi.fn();
    render(
      <AgentCard
        type='detected'
        agent={{ backend: 'gemini', name: 'Gemini' }}
        settingsDisabled={false}
        onSettings={onSettings}
      />
    );
    const settingIcon = screen.getByTestId('icon-setting');
    const button = settingIcon.closest('button');
    expect(button).toBeTruthy();
    fireEvent.click(button!);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});

describe('AgentCard – custom variant', () => {
  it('renders the custom agent name and CLI path', () => {
    render(
      <AgentCard type='custom' agent={makeCustomAgent()} onEdit={vi.fn()} onDelete={vi.fn()} onToggle={vi.fn()} />
    );
    expect(screen.getByText('My Custom Agent')).toBeTruthy();
    expect(screen.getByText('/usr/bin/agent')).toBeTruthy();
  });

  it('renders CLI path with args joined by spaces', () => {
    render(
      <AgentCard
        type='custom'
        agent={makeCustomAgent({ defaultCliPath: '/usr/bin/agent', acpArgs: ['--acp', '--verbose'] })}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('/usr/bin/agent --acp --verbose')).toBeTruthy();
  });

  it('shows "Custom Agent" fallback when name is an empty string', () => {
    render(
      <AgentCard
        type='custom'
        agent={makeCustomAgent({ name: '' })}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Custom Agent')).toBeTruthy();
  });

  it('calls onEdit when the edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<AgentCard type='custom' agent={makeCustomAgent()} onEdit={onEdit} onDelete={vi.fn()} onToggle={vi.fn()} />);
    const editIcon = screen.getByTestId('icon-edit');
    const button = editIcon.closest('button');
    expect(button).toBeTruthy();
    fireEvent.click(button!);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <AgentCard type='custom' agent={makeCustomAgent()} onEdit={vi.fn()} onDelete={onDelete} onToggle={vi.fn()} />
    );
    const deleteIcon = screen.getByTestId('icon-delete');
    const button = deleteIcon.closest('button');
    expect(button).toBeTruthy();
    fireEvent.click(button!);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders a Switch element with role="switch"', () => {
    render(
      <AgentCard type='custom' agent={makeCustomAgent()} onEdit={vi.fn()} onDelete={vi.fn()} onToggle={vi.fn()} />
    );
    expect(screen.getByRole('switch')).toBeTruthy();
  });
});
