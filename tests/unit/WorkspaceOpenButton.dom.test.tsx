import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

const mockIsElectronDesktop = vi.fn(() => true);
const mockIsTemporaryWorkspace = vi.fn(() => false);
const mockCheckToolInstalled = vi.fn().mockResolvedValue(false);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'> & { type?: string; size?: string }) => (
    <button {...props} onClick={onClick}>
      {children}
    </button>
  ),
  Dropdown: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Command: () => <span data-testid='icon-command' />,
  Down: () => <span data-testid='icon-down' />,
  Folder: () => <span data-testid='icon-folder' />,
  Terminal: () => <span data-testid='icon-terminal' />,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mockIsElectronDesktop(),
}));

vi.mock('@/renderer/utils/workspace/workspace', () => ({
  isTemporaryWorkspace: (p: string) => mockIsTemporaryWorkspace(p),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      checkToolInstalled: { invoke: (...args: unknown[]) => mockCheckToolInstalled(...args) },
      openFolderWith: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

import WorkspaceOpenButton from '@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton';

describe('WorkspaceOpenButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectronDesktop.mockReturnValue(true);
    mockIsTemporaryWorkspace.mockReturnValue(false);
    mockCheckToolInstalled.mockResolvedValue(false);
    localStorage.clear();
  });

  it('renders in Electron desktop mode with non-temporary workspace', () => {
    const { container } = render(<WorkspaceOpenButton workspacePath='/home/user/project' />);
    expect(container.querySelector('.workspace-open-button')).not.toBeNull();
  });

  it('does not render in WebUI/browser mode', () => {
    mockIsElectronDesktop.mockReturnValue(false);
    const { container } = render(<WorkspaceOpenButton workspacePath='/home/user/project' />);
    expect(container.querySelector('.workspace-open-button')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('does not render for temporary workspaces', () => {
    mockIsTemporaryWorkspace.mockReturnValue(true);
    const { container } = render(<WorkspaceOpenButton workspacePath='/tmp/temp-workspace' />);
    expect(container.querySelector('.workspace-open-button')).toBeNull();
  });

  it('shows terminal icon as default tool', () => {
    render(<WorkspaceOpenButton workspacePath='/home/user/project' />);
    expect(screen.getByTestId('icon-terminal')).toBeDefined();
  });
});
