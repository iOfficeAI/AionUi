import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider } from '@arco-design/web-react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AssistantEditorSections from '@/renderer/pages/settings/AssistantSettings/AssistantEditorSections';
import type { AssistantEditorViewModel } from '@/renderer/pages/settings/AssistantSettings/types';

const mockUseModelProviderList = vi.fn(() => ({
  providers: [],
  getAvailableModels: () => [],
}));
const showOpenInvokeMock = vi.fn();
const getImageBase64InvokeMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; count?: number }) => {
      if (options?.defaultValue) return options.defaultValue.replace('{{count}}', String(options.count ?? ''));
      return _key;
    },
  }),
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => mockUseModelProviderList(),
}));

vi.mock('@/renderer/components/chat/EmojiPicker', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: {
        invoke: (...args: unknown[]) => showOpenInvokeMock(...args),
      },
    },
    fs: {
      getImageBase64: {
        invoke: (...args: unknown[]) => getImageBase64InvokeMock(...args),
      },
    },
  },
}));

const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <MemoryRouter>
      <ConfigProvider>{ui}</ConfigProvider>
    </MemoryRouter>
  );

const createEditor = (overrides: Partial<AssistantEditorViewModel> = {}): AssistantEditorViewModel => {
  const base: AssistantEditorViewModel = {
    isCreating: true,
    profile: {
      name: 'Writer',
      setName: vi.fn(),
      description: 'desc',
      setDescription: vi.fn(),
      avatar: '✍️',
      setAvatar: vi.fn(),
      setAvatarPreview: vi.fn(),
      builtinAvatarOptions: [],
    },
    agent: {
      value: 'claude',
      setValue: vi.fn(),
      availableBackends: [],
    },
    prompts: {
      text: '',
      setText: vi.fn(),
    },
    defaults: {
      model: { mode: 'auto', setMode: vi.fn(), value: '', setValue: vi.fn() },
      permission: { mode: 'auto', setMode: vi.fn(), value: '', setValue: vi.fn() },
      skills: { mode: 'fixed', setMode: vi.fn() },
      mcps: { mode: 'fixed', setMode: vi.fn(), availableServers: [], selectedIds: [], setSelectedIds: vi.fn() },
    },
    rules: {
      content: 'rules',
      setContent: vi.fn(),
      viewMode: 'preview',
      setViewMode: vi.fn(),
    },
    skills: {
      availableSkills: [],
      selectedSkills: [],
      setSelectedSkills: vi.fn(),
      pendingSkills: [],
      setDeletePendingSkillName: vi.fn(),
      setDeleteCustomSkillName: vi.fn(),
      builtinAutoSkills: [],
      disabledBuiltinSkills: [],
      setDisabledBuiltinSkills: vi.fn(),
    },
    actions: {
      save: vi.fn(),
      requestDelete: vi.fn(),
      duplicate: vi.fn(),
    },
  };

  return {
    ...base,
    ...overrides,
    profile: { ...base.profile, ...overrides.profile },
    agent: { ...base.agent, ...overrides.agent },
    prompts: { ...base.prompts, ...overrides.prompts },
    defaults: {
      ...base.defaults,
      ...overrides.defaults,
      model: { ...base.defaults.model, ...overrides.defaults?.model },
      permission: { ...base.defaults.permission, ...overrides.defaults?.permission },
      skills: { ...base.defaults.skills, ...overrides.defaults?.skills },
      mcps: { ...base.defaults.mcps, ...overrides.defaults?.mcps },
    },
    rules: { ...base.rules, ...overrides.rules },
    skills: { ...base.skills, ...overrides.skills },
    actions: { ...base.actions, ...overrides.actions },
  };
};

describe('AssistantEditorSections', () => {
  beforeEach(() => {
    showOpenInvokeMock.mockReset();
    getImageBase64InvokeMock.mockReset();
    getImageBase64InvokeMock.mockResolvedValue('data:image/png;base64,preview');
    mockUseModelProviderList.mockReturnValue({
      providers: [],
      getAvailableModels: () => [],
    });
  });

  it('renders all default configuration rows in a single card', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          prompts: { text: 'Prompt one\nPrompt two', setText: vi.fn() },
          defaults: {
            mcps: {
              mode: 'fixed',
              setMode: vi.fn(),
              availableServers: [],
              selectedIds: ['filesystem'],
              setSelectedIds: vi.fn(),
            },
          },
          skills: {
            availableSkills: [
              { name: 'browse', description: 'Browse the web', location: '', is_custom: false, source: 'builtin' },
            ],
            selectedSkills: ['browse'],
            setSelectedSkills: vi.fn(),
            pendingSkills: [],
            setDeletePendingSkillName: vi.fn(),
            setDeleteCustomSkillName: vi.fn(),
            builtinAutoSkills: [],
            disabledBuiltinSkills: [],
            setDisabledBuiltinSkills: vi.fn(),
          },
        })}
        activeAssistant={null}
      />
    );

    const defaultsCard = screen.getByTestId('assistant-card-defaults');
    const defaultsScope = within(defaultsCard);
    expect(defaultsScope.getByText('Default Model')).toBeInTheDocument();
    expect(defaultsScope.getByText('Default Permission')).toBeInTheDocument();
    expect(defaultsScope.getByText('Default Skills')).toBeInTheDocument();
    expect(defaultsScope.getByText('Default MCP')).toBeInTheDocument();
    expect(
      defaultsScope.getByText(
        'Remember last used only takes effect after this assistant has recorded a previous selection.'
      )
    ).toBeInTheDocument();
  });

  it('renders auto defaults consistently for model, permission, skills, and MCP', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          defaults: {
            model: { mode: 'auto', setMode: vi.fn(), value: '', setValue: vi.fn() },
            permission: { mode: 'auto', setMode: vi.fn(), value: '', setValue: vi.fn() },
            skills: { mode: 'auto', setMode: vi.fn() },
            mcps: {
              mode: 'auto',
              setMode: vi.fn(),
              availableServers: [{ id: 'mcp-a', name: 'Server A', enabled: true } as any],
              selectedIds: [],
              setSelectedIds: vi.fn(),
            },
          },
          skills: {
            availableSkills: [
              { name: 'browse', description: 'Browse the web', location: '', is_custom: false, source: 'builtin' },
            ],
            selectedSkills: [],
            setSelectedSkills: vi.fn(),
            pendingSkills: [],
            setDeletePendingSkillName: vi.fn(),
            setDeleteCustomSkillName: vi.fn(),
            builtinAutoSkills: [],
            disabledBuiltinSkills: [],
            setDisabledBuiltinSkills: vi.fn(),
          },
        })}
        activeAssistant={null}
      />
    );

    expect(screen.getByTestId('select-assistant-default-model')).toHaveTextContent('Remember last used automatically');
    expect(screen.getByTestId('select-assistant-default-permission')).toHaveTextContent(
      'Remember last used automatically'
    );
    expect(screen.getByTestId('select-assistant-default-skills')).toHaveTextContent('Remember last used automatically');
    expect(screen.getByTestId('select-assistant-default-mcp')).toHaveTextContent('Remember last used automatically');
    expect(screen.getByTestId('select-assistant-default-skills').className).toMatch(/summarySelect/);
    expect(screen.getByTestId('select-assistant-default-mcp').className).toMatch(/summarySelect/);
  });

  it('keeps builtin and disabled MCP servers in the default MCP summary', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          isCreating: false,
          defaults: {
            mcps: {
              mode: 'fixed',
              setMode: vi.fn(),
              availableServers: [
                { id: 'mcp-user', name: 'User MCP', enabled: true, builtin: false } as any,
                { id: 'mcp-disabled', name: 'Disabled MCP', enabled: false, builtin: false } as any,
                { id: 'mcp-builtin', name: 'Builtin MCP', enabled: false, builtin: true } as any,
              ],
              selectedIds: ['mcp-user', 'mcp-disabled', 'mcp-builtin'],
              setSelectedIds: vi.fn(),
            },
          },
        })}
        activeAssistant={{
          id: 'builtin-assistant',
          source: 'builtin',
          name: 'Builtin assistant',
          description: '',
          avatar: '🤖',
          enabled: true,
          sort_order: 1,
          preset_agent_type: 'claude',
        }}
      />
    );

    const defaultsCard = screen.getByTestId('assistant-card-defaults');
    expect(within(defaultsCard).getByText('User MCP、Disabled MCP、Builtin MCP')).toBeInTheDocument();
  });

  it('uses provider-backed models for aionrs even when detected agent metadata exposes model options', () => {
    mockUseModelProviderList.mockReturnValue({
      providers: [{ id: 'provider-a', name: 'Provider A', model: ['provider-model'], enabled: true }],
      getAvailableModels: () => ['provider-model'],
    });

    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          agent: {
            value: 'aionrs',
            setValue: vi.fn(),
            availableBackends: [
              {
                id: 'aionrs',
                name: 'Aionrs',
                modelOptions: [{ value: 'handshake-model', label: 'Handshake Model' }],
              },
            ],
          },
          defaults: {
            model: { mode: 'fixed', setMode: vi.fn(), value: 'provider-model', setValue: vi.fn() },
          },
        })}
        activeAssistant={null}
      />
    );

    expect(screen.getByTestId('select-assistant-default-model')).toHaveTextContent('Provider A · provider-model');
    expect(screen.getByTestId('select-assistant-default-model')).not.toHaveTextContent('Handshake Model');
  });

  it('renders recommended prompts as a list with actions', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({ prompts: { text: 'Prompt one\nPrompt two', setText: vi.fn() } })}
        activeAssistant={null}
      />
    );

    const promptCard = screen.getByTestId('assistant-card-prompts');
    const promptScope = within(promptCard);
    expect(promptScope.getByText('Prompt one')).toBeInTheDocument();
    expect(promptScope.getByText('Prompt two')).toBeInTheDocument();
    expect(promptScope.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('keeps existing recommended prompts above the new prompt input while adding', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({ prompts: { text: 'Prompt one\nPrompt two', setText: vi.fn() } })}
        activeAssistant={null}
      />
    );

    const promptCard = screen.getByTestId('assistant-card-prompts');
    fireEvent.click(within(promptCard).getByRole('button', { name: 'Add' }));

    const promptPanel = promptCard.querySelector('.bg-fill-1');
    const firstPrompt = within(promptCard).getByText('Prompt one');
    const newPromptInput = within(promptCard).getByTestId('input-assistant-recommended-prompt-new');

    expect(promptPanel).not.toBeNull();
    expect(firstPrompt.compareDocumentPosition(newPromptInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render an empty prompts panel when there are no recommended prompts', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({ prompts: { text: '', setText: vi.fn() } })}
        activeAssistant={null}
      />
    );

    const promptCard = screen.getByTestId('assistant-card-prompts');
    expect(promptCard.querySelector('.bg-fill-1')).toBeNull();
    expect(within(promptCard).getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('lets users pick an avatar image from the file dialog', async () => {
    const setEditAvatar = vi.fn();
    const setEditAvatarPreview = vi.fn();
    showOpenInvokeMock.mockResolvedValue(['/tmp/avatar.png']);

    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          profile: {
            avatar: '✍️',
            setAvatar: setEditAvatar,
            setAvatarPreview: setEditAvatarPreview,
            name: 'Writer',
            setName: vi.fn(),
            description: 'desc',
            setDescription: vi.fn(),
          },
          defaults: {
            mcps: { mode: 'auto', setMode: vi.fn(), availableServers: [], selectedIds: [], setSelectedIds: vi.fn() },
          },
        })}
        activeAssistant={null}
      />
    );

    fireEvent.click(screen.getByTestId('btn-assistant-avatar-upload'));

    expect(showOpenInvokeMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(setEditAvatar).toHaveBeenCalledWith('/tmp/avatar.png');
      expect(getImageBase64InvokeMock).toHaveBeenCalledWith({ path: '/tmp/avatar.png' });
      expect(setEditAvatarPreview).toHaveBeenCalledWith('data:image/png;base64,preview');
    });
  });

  it('keeps builtin default model and permission editable while showing prompts as read-only content', () => {
    const { container } = renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          isCreating: false,
          profile: {
            name: 'Cowork',
            setName: vi.fn(),
            description: 'Builtin desc',
            setDescription: vi.fn(),
            avatar: '🤝',
            setAvatar: vi.fn(),
            setAvatarPreview: vi.fn(),
          },
          prompts: { text: 'Prompt one\nPrompt two', setText: vi.fn() },
          defaults: {
            model: { mode: 'fixed', setMode: vi.fn(), value: 'gemini-2.5-pro', setValue: vi.fn() },
            permission: { mode: 'fixed', setMode: vi.fn(), value: 'default', setValue: vi.fn() },
            mcps: {
              mode: 'fixed',
              setMode: vi.fn(),
              availableServers: [{ id: 'mcp-a', name: 'Server A', enabled: true } as any],
              selectedIds: ['mcp-a'],
              setSelectedIds: vi.fn(),
            },
          },
          rules: { content: 'builtin rules', setContent: vi.fn(), viewMode: 'preview', setViewMode: vi.fn() },
          skills: {
            availableSkills: [
              { name: 'browse', description: 'Browse the web', location: '', is_custom: false, source: 'builtin' },
            ],
            selectedSkills: ['browse'],
            setSelectedSkills: vi.fn(),
            pendingSkills: [],
            setDeletePendingSkillName: vi.fn(),
            setDeleteCustomSkillName: vi.fn(),
            builtinAutoSkills: [],
            disabledBuiltinSkills: [],
            setDisabledBuiltinSkills: vi.fn(),
          },
          agent: {
            value: 'claude',
            setValue: vi.fn(),
            availableBackends: [{ id: 'claude', name: 'Claude', isExtension: false, modelOptions: [] }],
          },
        })}
        activeAssistant={{
          id: 'cowork',
          name: 'Cowork',
          sort_order: 1,
          source: 'builtin',
          enabled: true,
          preset_agent_type: 'claude',
        }}
      />
    );

    const defaultsCard = screen.getByTestId('assistant-card-defaults');
    expect(within(defaultsCard).getByText('Default Model')).toBeInTheDocument();
    expect(within(defaultsCard).getByText('Default Permission')).toBeInTheDocument();

    const modelSelect = container.querySelector('[data-testid="select-assistant-default-model"]');
    const permissionSelect = container.querySelector('[data-testid="select-assistant-default-permission"]');
    expect(modelSelect?.className).not.toContain('arco-select-disabled');
    expect(permissionSelect?.className).not.toContain('arco-select-disabled');
    expect(screen.queryByTestId('select-assistant-default-skills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-assistant-default-mcp')).not.toBeInTheDocument();
    expect(screen.getByText('browse')).toBeInTheDocument();
    expect(screen.getByText('Server A')).toBeInTheDocument();

    const promptCard = screen.getByTestId('assistant-card-prompts');
    const promptScope = within(promptCard);
    expect(promptScope.getByText('Prompt one')).toBeInTheDocument();
    expect(promptScope.getByText('Prompt two')).toBeInTheDocument();
    expect(promptScope.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('renders single default-skill and default-mcp controls with hub links', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          defaults: {
            mcps: {
              mode: 'fixed',
              setMode: vi.fn(),
              availableServers: [{ id: 'mcp-a', name: 'Server A', enabled: true } as any],
              selectedIds: ['mcp-a'],
              setSelectedIds: vi.fn(),
            },
          },
          skills: {
            availableSkills: [
              { name: 'browse', description: 'Browse the web', location: '', is_custom: false, source: 'builtin' },
            ],
            selectedSkills: ['browse'],
            setSelectedSkills: vi.fn(),
            pendingSkills: [],
            setDeletePendingSkillName: vi.fn(),
            setDeleteCustomSkillName: vi.fn(),
            builtinAutoSkills: [],
            disabledBuiltinSkills: [],
            setDisabledBuiltinSkills: vi.fn(),
          },
        })}
        activeAssistant={null}
      />
    );

    expect(screen.queryByTestId('select-assistant-default-skills-mode')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-assistant-default-mcp-mode')).not.toBeInTheDocument();
    expect(screen.getByTestId('btn-open-skills-settings')).toBeInTheDocument();
    expect(screen.getByTestId('btn-open-mcp-settings')).toBeInTheDocument();
  });

  it('switches default skills from auto to fixed when selecting a concrete skill', async () => {
    const setDefaultSkillsMode = vi.fn();
    const setSelectedSkills = vi.fn();

    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          defaults: {
            skills: { mode: 'auto', setMode: setDefaultSkillsMode },
          },
          skills: {
            availableSkills: [
              { name: 'browse', description: 'Browse the web', location: '', is_custom: false, source: 'builtin' },
            ],
            selectedSkills: [],
            setSelectedSkills,
            pendingSkills: [],
            setDeletePendingSkillName: vi.fn(),
            setDeleteCustomSkillName: vi.fn(),
            builtinAutoSkills: [],
            disabledBuiltinSkills: [],
            setDisabledBuiltinSkills: vi.fn(),
          },
        })}
        activeAssistant={null}
      />
    );

    fireEvent.click(screen.getByTestId('select-assistant-default-skills'));
    fireEvent.click(await screen.findByText('browse'));

    expect(setDefaultSkillsMode).toHaveBeenCalledWith('fixed');
    expect(setSelectedSkills).toHaveBeenCalledWith(['browse']);
  });

  it('uses stronger contrast classes for applies-immediately badges', () => {
    renderWithProviders(<AssistantEditorSections editor={createEditor()} activeAssistant={null} />);

    const legend = screen.getAllByText('Applies immediately')[0];
    expect(legend.className).toContain('border');
    expect(legend.className).toContain('font-600');
    expect(legend.className).toContain('text-white');
  });

  it('does not autofocus the rules textarea when edit mode is visible', () => {
    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          defaults: {
            skills: { mode: 'auto', setMode: vi.fn() },
            mcps: { mode: 'auto', setMode: vi.fn(), availableServers: [], selectedIds: [], setSelectedIds: vi.fn() },
          },
          rules: { content: 'rules', setContent: vi.fn(), viewMode: 'edit', setViewMode: vi.fn() },
        })}
        activeAssistant={null}
      />
    );

    const textarea = screen.getByPlaceholderText('Enter rules in Markdown format...');
    expect(document.activeElement).not.toBe(textarea);
  });
});
