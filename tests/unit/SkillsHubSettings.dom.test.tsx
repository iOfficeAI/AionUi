import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// === Mocking Dependencies === //

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock @arco-design/web-react
vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(() => vi.fn()),
    },
    // We can use simple divs instead of complex modals to make testing easier
    Modal: Object.assign(
      ({ visible, title, children, onOk, onCancel, okText, cancelText }: any) => {
        if (!visible) return null;
        return (
          <div data-testid='mock-modal'>
            <h2>{title}</h2>
            <div>{children}</div>
            <button data-testid='modal-ok' onClick={onOk}>
              {okText || 'OK'}
            </button>
            <button data-testid='modal-cancel' onClick={onCancel}>
              {cancelText || 'Cancel'}
            </button>
          </div>
        );
      },
      {
        confirm: vi.fn(),
      }
    ),
    Drawer: ({ visible, title, children, footer }: any) => {
      if (!visible) return null;
      return (
        <div data-testid='mock-drawer'>
          <div data-testid='drawer-title'>{title}</div>
          <div>{children}</div>
          <div>{footer}</div>
        </div>
      );
    },
  };
});

// Mock @icon-park/react
vi.mock('@icon-park/react', () => {
  return {
    Delete: () => <span data-testid='icon-delete' />,
    FolderOpen: () => <span data-testid='icon-folder' />,
    Info: () => <span data-testid='icon-info' />,
    Search: () => <span data-testid='icon-search' />,
    Plus: () => <span data-testid='icon-plus' />,
    Refresh: () => <span data-testid='icon-refresh' />,
  };
});

// Mock MarkdownView component
vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid='mock-markdown'>{children}</div>,
}));

// Setup IPC Bridge mock
const mockListAvailableSkills = vi.fn();
const mockDetectAndCountExternalSkills = vi.fn();
const mockGetSkillPaths = vi.fn();
const mockImportSkillWithSymlink = vi.fn();
const mockDeleteSkill = vi.fn();
const mockExportSkillWithSymlink = vi.fn();
const mockAddCustomExternalPath = vi.fn();
const mockShowOpen = vi.fn();
const mockReadFile = vi.fn();

vi.mock('@/common', () => {
  return {
    ipcBridge: {
      fs: {
        listAvailableSkills: { invoke: (...args: any[]) => mockListAvailableSkills(...args) },
        detectAndCountExternalSkills: { invoke: (...args: any[]) => mockDetectAndCountExternalSkills(...args) },
        getSkillPaths: { invoke: (...args: any[]) => mockGetSkillPaths(...args) },
        importSkillWithSymlink: { invoke: (...args: any[]) => mockImportSkillWithSymlink(...args) },
        deleteSkill: { invoke: (...args: any[]) => mockDeleteSkill(...args) },
        exportSkillWithSymlink: { invoke: (...args: any[]) => mockExportSkillWithSymlink(...args) },
        addCustomExternalPath: { invoke: (...args: any[]) => mockAddCustomExternalPath(...args) },
        readFile: { invoke: (...args: any[]) => mockReadFile(...args) },
      },
      dialog: {
        showOpen: { invoke: (...args: any[]) => mockShowOpen(...args) },
      },
    },
  };
});

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => {
  return {
    default: ({ children }: any) => <div data-testid='settings-page-wrapper'>{children}</div>,
  };
});

// Import the component after mocking dependencies
import SkillsHubSettings from '@/renderer/pages/settings/SkillsHubSettings';

describe('SkillsHubSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    mockListAvailableSkills.mockResolvedValue([
      { name: 'MySkill1', description: 'desc1', location: '/path1', isCustom: true },
      { name: 'Builtin1', description: 'desc2', location: '/path2', isCustom: false },
    ]);

    mockDetectAndCountExternalSkills.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'Gemini CLI',
          source: 'gemini',
          path: '/home/gemini',
          skills: [
            { name: 'ExtSkill1', description: 'extdesc1', path: '/home/gemini/ext1' },
            { name: 'ExtSkill2', description: 'extdesc2', path: '/home/gemini/ext2' },
          ],
        },
      ],
    });

    mockGetSkillPaths.mockResolvedValue({
      userSkillsDir: '/user/skills',
      builtinSkillsDir: '/builtin/skills',
    });

    mockReadFile.mockResolvedValue('---\nname: test\n---\n# Test Skill\n\nSome content.');
  });

  it('should render main sections and load skills', async () => {
    render(<SkillsHubSettings />);

    // Wait for data fetching to complete
    await waitFor(() => {
      expect(mockListAvailableSkills).toHaveBeenCalled();
      expect(mockDetectAndCountExternalSkills).toHaveBeenCalled();
    });

    // Check headers (now using i18n keys since defaultValue was removed)
    expect(screen.getByText('settings.skillsHub.discoveredTitle')).toBeInTheDocument();
    expect(screen.getByText('settings.skillsHub.mySkillsTitle')).toBeInTheDocument();

    // Check external skills render
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
    expect(screen.getByText('ExtSkill1')).toBeInTheDocument();

    // Check my skills render
    expect(screen.getByText('MySkill1')).toBeInTheDocument();
    expect(screen.getByText('Builtin1')).toBeInTheDocument();
    expect(screen.getByText('settings.skillsHub.custom')).toBeInTheDocument();
    expect(screen.getByText('settings.skillsHub.builtin')).toBeInTheDocument();

    // Check paths are rendered
    expect(screen.getByText('/user/skills')).toBeInTheDocument();
  });

  it('should filter skills correctly by search query', async () => {
    render(<SkillsHubSettings />);

    await waitFor(() => {
      expect(screen.getByText('MySkill1')).toBeInTheDocument();
    });

    // Get the My Skills search input (using i18n key as placeholder)
    const searchInputs = screen.getAllByPlaceholderText('settings.skillsHub.searchPlaceholder');
    const mySkillsSearch = searchInputs[1];

    // Search for non-existent skill
    fireEvent.change(mySkillsSearch, { target: { value: 'NotFound' } });

    await waitFor(() => {
      expect(screen.queryByText('MySkill1')).not.toBeInTheDocument();
      expect(screen.queryByText('Builtin1')).not.toBeInTheDocument();
    });

    // Search for one specific skill
    fireEvent.change(mySkillsSearch, { target: { value: 'builtin' } });

    await waitFor(() => {
      expect(screen.queryByText('MySkill1')).not.toBeInTheDocument();
      expect(screen.getByText('Builtin1')).toBeInTheDocument();
    });
  });

  it('should open skill detail drawer when clicking external skill', async () => {
    render(<SkillsHubSettings />);

    await waitFor(() => {
      expect(screen.getByText('ExtSkill1')).toBeInTheDocument();
    });

    // Click the external skill card to open detail drawer
    fireEvent.click(screen.getByText('ExtSkill1'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-drawer')).toBeInTheDocument();
    });
  });

  it('should call delete endpoint when deleting custom skill', async () => {
    // Modify mock to only return the custom skill
    mockListAvailableSkills.mockResolvedValue([
      { name: 'MySkill1', description: 'desc1', location: '/path1', isCustom: true },
    ]);

    const { Modal } = await import('@arco-design/web-react');

    render(<SkillsHubSettings />);

    await waitFor(() => {
      expect(screen.getByText('MySkill1')).toBeInTheDocument();
    });

    // Using testid because ARCO icons are mocked as spans with test ids
    const deleteButtons = screen.getAllByTestId('icon-delete');
    fireEvent.click(deleteButtons[0].parentElement!);

    await waitFor(() => {
      expect(Modal.confirm).toHaveBeenCalled();
      const args = vi.mocked(Modal.confirm).mock.calls[0][0];
      // Execute the ok callback to trigger actual deletion
      if (args.onOk) args.onOk();
    });

    mockDeleteSkill.mockResolvedValue({ success: true });

    await waitFor(() => {
      expect(mockDeleteSkill).toHaveBeenCalledWith({ skillName: 'MySkill1' });
    });
  });

  it('should be able to add a custom external path', async () => {
    render(<SkillsHubSettings />);

    await waitFor(() => {
      expect(screen.getByText('settings.skillsHub.discoveredTitle')).toBeInTheDocument();
    });

    // Click Add button
    const plusIcon = screen.getByTestId('icon-plus');
    fireEvent.click(plusIcon.parentElement!);

    await waitFor(() => {
      expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
    });

    // Add name and path (placeholders now use i18n keys)
    const nameInput = screen.getByPlaceholderText('settings.skillsHub.customPathNamePlaceholder');
    const pathInput = screen.getByPlaceholderText('settings.skillsHub.customPathPlaceholder');

    fireEvent.change(nameInput, { target: { value: 'NewPath' } });
    fireEvent.change(pathInput, { target: { value: '/foo/bar' } });

    mockAddCustomExternalPath.mockResolvedValue({ success: true });

    // Click Confirm
    const okButton = screen.getByTestId('modal-ok');
    fireEvent.click(okButton);

    await waitFor(() => {
      expect(mockAddCustomExternalPath).toHaveBeenCalledWith({ name: 'NewPath', path: '/foo/bar' });
    });
  });

  it('should render usage tips correctly', () => {
    render(<SkillsHubSettings />);
    expect(screen.getByText('settings.skillsHub.tipTitle')).toBeInTheDocument();
  });
});
