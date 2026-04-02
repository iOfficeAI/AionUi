import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDispatchWorkspaceToggleEvent = vi.hoisted(() => vi.fn());
const mockWorkspacePanelHeader = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceToggleEvent: mockDispatchWorkspaceToggleEvent,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspacePanelHeader', () => ({
  default: ({ children, workspacePath }: { children?: React.ReactNode; workspacePath?: string }) => {
    mockWorkspacePanelHeader({ workspacePath, children });
    return (
      <div data-testid='workspace-panel-header'>
        <span>{children}</span>
        <span>{workspacePath}</span>
      </div>
    );
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Layout: {
    Content: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

import MobileWorkspaceOverlay from '@/renderer/pages/conversation/components/ChatLayout/MobileWorkspaceOverlay';

describe('MobileWorkspaceOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the workspace path to the mobile workspace header', () => {
    render(
      <MobileWorkspaceOverlay
        rightSiderCollapsed={false}
        setRightSiderCollapsed={vi.fn()}
        workspaceWidthPx={320}
        mobileWorkspaceHandleRight={48}
        siderTitle='Workspace'
        sider={<div>Body</div>}
        workspacePath='/workspace/project'
      />
    );

    expect(screen.getByTestId('workspace-panel-header')).toHaveTextContent('/workspace/project');
    expect(mockWorkspacePanelHeader).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePath: '/workspace/project', children: 'Workspace' })
    );
  });

  it('closes from the backdrop and dispatches collapse from the floating handle', () => {
    const setRightSiderCollapsed = vi.fn();
    const { container } = render(
      <MobileWorkspaceOverlay
        rightSiderCollapsed={false}
        setRightSiderCollapsed={setRightSiderCollapsed}
        workspaceWidthPx={320}
        mobileWorkspaceHandleRight={48}
        siderTitle='Workspace'
        sider={<div>Body</div>}
      />
    );

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse workspace' }));

    expect(setRightSiderCollapsed).toHaveBeenCalledWith(true);
    expect(mockDispatchWorkspaceToggleEvent).toHaveBeenCalledTimes(1);
  });
});
