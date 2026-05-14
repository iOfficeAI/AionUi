import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@arco-design/web-react', () => ({
  Badge: ({ children }: React.PropsWithChildren<{ count?: number }>) => <>{children}</>,
  Dropdown: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Tabs: Object.assign(
    ({ children }: React.PropsWithChildren<{ activeTab?: string; onChange?: (key: string) => void }>) => (
      <div>{children}</div>
    ),
    {
      TabPane: ({ title }: React.PropsWithChildren<{ title: React.ReactNode }>) => <div>{title}</div>,
    }
  ),
}));

vi.mock('@icon-park/react', () => ({
  BranchOne: () => <span data-testid='branch-icon' />,
  CheckSmall: () => <span data-testid='check-icon' />,
  Down: () => <span data-testid='down-icon' />,
  Right: () => <span data-testid='right-icon' />,
}));

import WorkspaceTabBar from '@/renderer/pages/conversation/Workspace/components/WorkspaceTabBar';

describe('WorkspaceTabBar', () => {
  it('includes the terminal tab', () => {
    render(
      <WorkspaceTabBar
        t={(key: string) => key}
        activeTab='files'
        onTabChange={vi.fn()}
        changeCount={0}
        branch={null}
        branches={[]}
      />
    );

    expect(screen.getByText('conversation.workspace.terminal.tab')).toBeInTheDocument();
  });
});
