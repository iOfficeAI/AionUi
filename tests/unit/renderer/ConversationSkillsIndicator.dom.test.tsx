import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@arco-design/web-react', () => ({
  Popover: ({
    children,
    content,
  }: {
    children: React.ReactNode;
    content: React.ReactNode;
    trigger?: string;
    position?: string;
  }) => (
    <div data-testid='mock-popover'>
      {children}
      <div data-testid='mock-popover-content'>{content}</div>
    </div>
  ),
}));

vi.mock('@icon-park/react', () => ({
  Lightning: () => <span data-testid='lightning-icon' />,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    primary: '#000',
  },
}));

import type { TChatConversation } from '@/common/config/storage';
import ConversationSkillsIndicator from '@/renderer/pages/conversation/components/ConversationSkillsIndicator';

const createConversation = (loadedSkills?: Array<{ name: string; description: string }>): TChatConversation =>
  ({
    extra: loadedSkills !== undefined ? { loadedSkills } : {},
  }) as unknown as TChatConversation;

describe('ConversationSkillsIndicator', () => {
  it('returns null when conversation is undefined', () => {
    const { container } = render(<ConversationSkillsIndicator conversation={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when loadedSkills is an empty array', () => {
    const { container } = render(<ConversationSkillsIndicator conversation={createConversation([])} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when loadedSkills is missing from extra', () => {
    const { container } = render(<ConversationSkillsIndicator conversation={createConversation()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the skill count when skills exist', () => {
    const skills = [
      { name: 'Skill A', description: 'desc a' },
      { name: 'Skill B', description: 'desc b' },
    ];

    render(<ConversationSkillsIndicator conversation={createConversation(skills)} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByTestId('lightning-icon')).toBeInTheDocument();
  });

  it('renders each skill name in the popover content', () => {
    const skills = [
      { name: 'Alpha', description: 'first' },
      { name: 'Beta', description: 'second' },
      { name: 'Gamma', description: 'third' },
    ];

    render(<ConversationSkillsIndicator conversation={createConversation(skills)} />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.getByText(/conversation\.skills\.loaded/)).toBeInTheDocument();
  });

  it('navigates to skills-hub with highlight param when a skill is clicked', () => {
    const skills = [{ name: 'MySkill', description: 'a skill' }];

    render(<ConversationSkillsIndicator conversation={createConversation(skills)} />);

    fireEvent.click(screen.getByText('MySkill'));

    expect(mockNavigate).toHaveBeenCalledWith('/settings/capabilities?tab=skills&highlight=MySkill');
  });

  it('encodes skill names with special characters in the URL', () => {
    const skills = [{ name: 'Skill & Tricks / More', description: 'special chars' }];

    render(<ConversationSkillsIndicator conversation={createConversation(skills)} />);

    fireEvent.click(screen.getByText('Skill & Tricks / More'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/settings/capabilities?tab=skills&highlight=Skill%20%26%20Tricks%20%2F%20More'
    );
  });
});
