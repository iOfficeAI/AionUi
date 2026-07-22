import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentSelectorModal } from '@/renderer/pages/conversation/components/AdHocTeam/AgentSelectorModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

const option1 = { id: 'a1', name: 'Assistant One' };
const option2 = { id: 'a2', name: 'Assistant Two' };

describe('AgentSelectorModal', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(
      <AgentSelectorModal
        visible={false}
        assistants={[option1]}
        isLoading={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    expect(screen.queryByTestId('agent-selector-modal')).not.toBeInTheDocument();
  });

  it('renders the assistant picker list when open', () => {
    render(
      <AgentSelectorModal
        visible
        assistants={[option1, option2]}
        isLoading={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    expect(screen.getByTestId('agent-selector-modal')).toBeInTheDocument();
    expect(screen.getByTestId('agent-selector-search')).toBeInTheDocument();
    expect(screen.getByTestId('agent-selector-option-a1')).toBeInTheDocument();
    expect(screen.getByTestId('agent-selector-option-a2')).toBeInTheDocument();
  });

  it('shows a loading state while assistants are loading', () => {
    render(<AgentSelectorModal visible assistants={[]} isLoading onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByTestId('agent-selector-loading')).toBeInTheDocument();
  });

  it('calls onConfirm with the selected assistant', async () => {
    render(
      <AgentSelectorModal
        visible
        assistants={[option1, option2]}
        isLoading={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByTestId('agent-selector-option-a2'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(option2));
  });

  it('keeps confirm disabled until an assistant is selected', () => {
    render(
      <AgentSelectorModal visible assistants={[option1]} isLoading={false} onClose={onClose} onConfirm={onConfirm} />
    );
    const confirmButton = screen.getByTestId('agent-selector-confirm');
    expect(confirmButton).toBeDisabled();
    fireEvent.click(screen.getByTestId('agent-selector-option-a1'));
    expect(confirmButton).not.toBeDisabled();
  });

  it('shows the selected assistant name and joined hint after selection', () => {
    render(
      <AgentSelectorModal
        visible
        assistants={[option1, option2]}
        isLoading={false}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByTestId('agent-selector-option-a2'));
    expect(screen.getByTestId('agent-selector-selected-name')).toHaveTextContent('Assistant Two');
    expect(screen.getByTestId('agent-selector-joined-hint')).toBeInTheDocument();
  });

  it('calls onClose when the cancel button is clicked', () => {
    render(
      <AgentSelectorModal visible assistants={[option1]} isLoading={false} onClose={onClose} onConfirm={onConfirm} />
    );
    fireEvent.click(screen.getByTestId('agent-selector-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables the cancel button and prevents closing while confirm is loading', () => {
    render(
      <AgentSelectorModal
        visible
        assistants={[option1]}
        isLoading={false}
        confirmLoading
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    const cancelButton = screen.getByTestId('agent-selector-cancel');
    expect(cancelButton).toBeDisabled();
    fireEvent.click(cancelButton);
    expect(onClose).not.toHaveBeenCalled();
  });
});
