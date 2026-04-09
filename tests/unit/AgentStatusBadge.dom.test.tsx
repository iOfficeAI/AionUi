import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import AgentStatusBadge from '../../src/renderer/pages/team/components/AgentStatusBadge';
import type { TeammateStatus } from '../../src/common/types/teamTypes';

describe('AgentStatusBadge', () => {
  it('renders with a known status', () => {
    const { container } = render(<AgentStatusBadge status='active' />);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('bg-green-500');
    expect(span.className).toContain('animate-pulse');
    expect(span.getAttribute('aria-label')).toBe('active');
  });

  it('renders failed status with red color', () => {
    const { container } = render(<AgentStatusBadge status='failed' />);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('bg-red-500');
  });

  it('does not crash with an unknown status value (ELECTRON-MZ)', () => {
    // Agent data loaded from SQLite via JSON.parse has no runtime validation,
    // so an unexpected status string can reach this component.
    const unknownStatus = 'running' as TeammateStatus;
    const { container } = render(<AgentStatusBadge status={unknownStatus} />);
    const span = container.querySelector('span')!;
    // Should fall back to gray instead of throwing TypeError
    expect(span.className).toContain('bg-gray-400');
  });

  it('applies pending status with gray color', () => {
    const { container } = render(<AgentStatusBadge status='pending' />);
    const span = container.querySelector('span')!;
    expect(span.className).toContain('bg-gray-400');
  });
});
