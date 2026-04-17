import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    loading: _loading,
    ...props
  }: React.ComponentProps<'button'> & { icon?: React.ReactNode; loading?: boolean }) => (
    <button {...props}>{icon ?? children}</button>
  ),
  Dropdown: ({ children, droplist }: React.PropsWithChildren & { droplist?: React.ReactNode }) => (
    <>
      {droplist}
      {children}
    </>
  ),
  Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
    Item: ({ children, onClick }: React.PropsWithChildren & { onClick?: (e: any) => void }) => (
      <div onClick={onClick}>{children}</div>
    ),
    SubMenu: ({ children, title }: React.PropsWithChildren & { title?: React.ReactNode }) => (
      <div>
        {title}
        {children}
      </div>
    ),
  }),
  Checkbox: ({
    children,
    checked,
    onChange,
  }: React.PropsWithChildren & { checked?: boolean; onChange?: () => void }) => (
    <label>
      <input type='checkbox' checked={checked} onChange={onChange} />
      {children}
    </label>
  ),
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  ArrowUp: () => <span>ArrowUp</span>,
  Brain: () => <span>Brain</span>,
  FolderOpen: () => <span>FolderOpen</span>,
  Lightning: () => <span>Lightning</span>,
  Plus: () => <span>Plus</span>,
  Shield: () => <span>Shield</span>,
  UploadOne: () => <span>UploadOne</span>,
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <div>AgentModeSelector</div>,
}));

vi.mock('@/renderer/components/agent/AcpConfigSelector', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('@/renderer/services/FileService', () => ({
  FileService: {
    processDroppedFiles: vi.fn(),
  },
  getCleanFileNames: (files: string[]) => files,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    primary: '#000',
    secondary: '#666',
  },
}));

const mockIsElectronDesktop = vi.fn(() => true);
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mockIsElectronDesktop(),
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  getAgentModes: () => [{ label: 'Default', value: 'default' }],
  supportsModeSwitch: () => false,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: vi.fn(),
      },
    },
  },
}));

import GuidActionRow from '@/renderer/pages/guid/components/GuidActionRow';
import { FileService } from '@/renderer/services/FileService';

describe('GuidActionRow', () => {
  const defaultProps = {
    files: [],
    onFilesUploaded: vi.fn(),
    onSelectWorkspace: vi.fn(),
    modelSelectorNode: <div>ModelSelector</div>,
    selectedAgent: 'gemini',
    selectedMode: 'default',
    onModeSelect: vi.fn(),
    isPresetAgent: false,
    selectedAgentInfo: undefined,
    customAgents: [],
    localeKey: 'en-US',
    onClosePresetTag: vi.fn(),
    builtinAutoSkills: [] as Array<{ name: string; description: string }>,
    disabledBuiltinSkills: [] as string[],
    onToggleBuiltinSkill: vi.fn(),
    loading: false,
    isButtonDisabled: false,
    speechInputNode: <button aria-label='speech-input'>Mic</button>,
    onSend: vi.fn(),
  };

  it('renders the speech input control next to the send button', () => {
    render(<GuidActionRow {...defaultProps} />);
    expect(screen.getByLabelText('speech-input')).toBeInTheDocument();
    expect(screen.getByText('ArrowUp')).toBeInTheDocument();
  });

  it('displays skill count when builtin skills are provided', () => {
    const skills = [
      { name: 'web-search', description: 'Search the web' },
      { name: 'code-interpreter', description: 'Run code' },
    ];

    render(<GuidActionRow {...defaultProps} builtinAutoSkills={skills} />);

    expect(screen.getByText('settings.autoInjectedSkills (2/2)', { exact: false })).toBeInTheDocument();
  });

  it('calls onToggleBuiltinSkill when skill checkbox is toggled', () => {
    const skills = [
      { name: 'web-search', description: 'Search the web' },
      { name: 'code-interpreter', description: 'Run code' },
    ];
    const onToggle = vi.fn();

    render(<GuidActionRow {...defaultProps} builtinAutoSkills={skills} onToggleBuiltinSkill={onToggle} />);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onToggle).toHaveBeenCalledWith('web-search');
  });

  it('shows generic error toast when file upload fails', async () => {
    mockIsElectronDesktop.mockReturnValueOnce(false); // WebUI mode so file input is rendered
    const { Message } = await import('@arco-design/web-react');
    vi.mocked(FileService.processDroppedFiles).mockRejectedValueOnce(new Error('Upload failed'));

    render(<GuidActionRow {...defaultProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);

    expect(Message.error).toHaveBeenCalledWith('common.fileAttach.failed');
  });
});
