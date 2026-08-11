import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatchWorkspaceToggleEvent = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceToggleEvent: mockDispatchWorkspaceToggleEvent,
}));

vi.mock('@icon-park/react', () => ({
  ExpandLeft: () => <span data-testid='icon-expand-left' />,
  ExpandRight: () => <span data-testid='icon-expand-right' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton', () => ({
  default: ({ workspacePath }: { workspacePath: string }) => (
    <div data-testid='workspace-open-button'>{workspacePath}</div>
  ),
}));

import WorkspacePanelHeader, {
  DesktopWorkspaceToggle,
} from '@/renderer/pages/conversation/components/ChatLayout/WorkspacePanelHeader';

describe('WorkspacePanelHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the workspace open button when a path is provided and panel is expanded', () => {
    render(
      <WorkspacePanelHeader collapsed={false} onToggle={vi.fn()} workspacePath='/workspace/project'>
        Workspace
      </WorkspacePanelHeader>
    );

    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-open-button')).toHaveTextContent('/workspace/project');
  });

  it('hides the workspace open button when the panel is collapsed', () => {
    render(
      <WorkspacePanelHeader collapsed onToggle={vi.fn()} workspacePath='/workspace/project'>
        Workspace
      </WorkspacePanelHeader>
    );

    expect(screen.queryByTestId('workspace-open-button')).not.toBeInTheDocument();
  });

  it('dispatches the floating expand action when the desktop toggle is clicked', () => {
    render(<DesktopWorkspaceToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand workspace' }));

    expect(mockDispatchWorkspaceToggleEvent).toHaveBeenCalledTimes(1);
  });
});
