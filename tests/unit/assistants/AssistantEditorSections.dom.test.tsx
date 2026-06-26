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
let mockManagedAgentRuntimeCatalog: Array<{
  id: string;
  available_modes?: unknown;
  config_options?: unknown;
}> = [];
const showOpenInvokeMock = vi.fn();
const getImageBase64InvokeMock = vi.fn();
let mockLanguage = 'en-US';
let mockResolvedLanguage: string | undefined = 'en-US';

const translateAgentMode = (key: string) => {
  if (!key.startsWith('agentMode.')) return null;

  const modeKey = key.replace('agentMode.', '');
  const zhCN: Record<string, string> = {
    auto: '自动',
    default: '默认',
    acceptEdits: '自动接受编辑',
    auto_edit: '自动编辑',
    'read-only': '只读',
    'full-access': '完全访问',
    yolo: 'YOLO',
  };
  const enUS: Record<string, string> = {
    auto: 'Auto',
    default: 'Default',
    acceptEdits: 'Accept Edits',
    auto_edit: 'Auto Edit',
    'read-only': 'Read Only',
    'full-access': 'Full Access',
    yolo: 'YOLO',
  };

  return (mockLanguage === 'zh-CN' ? zhCN : enUS)[modeKey] ?? null;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; count?: number }) => {
      const translatedAgentMode = translateAgentMode(_key);
      if (translatedAgentMode) return translatedAgentMode;
      if (options?.defaultValue) return options.defaultValue.replace('{{count}}', String(options.count ?? ''));
      return _key;
    },
    i18n: {
      get language() {
        return mockLanguage;
      },
      get resolvedLanguage() {
        return mockResolvedLanguage;
      },
    },
  }),
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useModelProviderList: () => mockUseModelProviderList(),
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  useManagedAgentRuntimeCatalog: () => mockManagedAgentRuntimeCatalog,
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

const backendOption = (id: string, runtimeKey: string, name = runtimeKey) => ({
  id,
  name,
  runtimeKey,
  isExtension: false,
  modelOptions: [],
});

describe('AssistantEditorSections', () => {
  beforeEach(() => {
    mockLanguage = 'en-US';
    mockResolvedLanguage = 'en-US';
    showOpenInvokeMock.mockReset();
    getImageBase64InvokeMock.mockReset();
    getImageBase64InvokeMock.mockResolvedValue('data:image/png;base64,preview');
    mockUseModelProviderList.mockReturnValue({
      providers: [],
      getAvailableModels: () => [],
    });
    mockManagedAgentRuntimeCatalog = [
      {
        id: 'agent-codex',
        available_modes: {
          current_mode_id: 'auto',
          available_modes: [
            { id: 'read-only', name: 'Read Only' },
            { id: 'auto', name: 'Auto' },
            { id: 'full-access', name: 'Full Access' },
          ],
        },
      },
    ];
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

  it('refreshes default permission labels when the language changes', async () => {
    const editor = createEditor({
      agent: {
        value: 'agent-codex',
        setValue: vi.fn(),
        availableBackends: [backendOption('agent-codex', 'codex', 'Codex')],
      },
    });

    const { rerender } = renderWithProviders(<AssistantEditorSections editor={editor} activeAssistant={null} />);

    fireEvent.click(screen.getByTestId('select-assistant-default-permission'));
    expect(screen.getByText('Read Only')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Full Access')).toBeInTheDocument();

    mockLanguage = 'zh-CN';
    rerender(
      <MemoryRouter>
        <ConfigProvider>
          <AssistantEditorSections editor={editor} activeAssistant={null} />
        </ConfigProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('select-assistant-default-permission'));
    await waitFor(() => {
      expect(screen.getByText('只读')).toBeInTheDocument();
      expect(screen.getByText('自动')).toBeInTheDocument();
      expect(screen.getByText('完全访问')).toBeInTheDocument();
    });
  });

  it('renders localized default permission options on initial non-English render', async () => {
    mockLanguage = 'zh-CN';
    mockResolvedLanguage = 'zh-CN';

    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          agent: {
            value: 'agent-codex',
            setValue: vi.fn(),
            availableBackends: [backendOption('agent-codex', 'codex', 'Codex')],
          },
        })}
        activeAssistant={null}
      />
    );

    fireEvent.click(screen.getByTestId('select-assistant-default-permission'));
    await waitFor(() => {
      expect(screen.getByText('只读')).toBeInTheDocument();
      expect(screen.getByText('自动')).toBeInTheDocument();
      expect(screen.getByText('完全访问')).toBeInTheDocument();
    });
  });

  it('uses the active language even when resolvedLanguage still points to the fallback locale', async () => {
    mockLanguage = 'zh-CN';
    mockResolvedLanguage = 'en-US';

    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          agent: {
            value: 'agent-codex',
            setValue: vi.fn(),
            availableBackends: [backendOption('agent-codex', 'codex', 'Codex')],
          },
        })}
        activeAssistant={null}
      />
    );

    fireEvent.click(screen.getByTestId('select-assistant-default-permission'));
    await waitFor(() => {
      expect(screen.getByText('只读')).toBeInTheDocument();
      expect(screen.getByText('自动')).toBeInTheDocument();
      expect(screen.getByText('完全访问')).toBeInTheDocument();
    });
  });

  it('refreshes default permission labels when the active language changes before resolvedLanguage catches up', async () => {
    const editor = createEditor({
      agent: {
        value: 'agent-codex',
        setValue: vi.fn(),
        availableBackends: [backendOption('agent-codex', 'codex', 'Codex')],
      },
    });

    const { rerender } = renderWithProviders(<AssistantEditorSections editor={editor} activeAssistant={null} />);

    fireEvent.click(screen.getByTestId('select-assistant-default-permission'));
    expect(screen.getByText('Read Only')).toBeInTheDocument();
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('Full Access')).toBeInTheDocument();

    mockLanguage = 'zh-CN';
    mockResolvedLanguage = 'en-US';

    rerender(
      <MemoryRouter>
        <ConfigProvider>
          <AssistantEditorSections editor={editor} activeAssistant={null} />
        </ConfigProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('select-assistant-default-permission'));
    await waitFor(() => {
      expect(screen.getByText('只读')).toBeInTheDocument();
      expect(screen.getByText('自动')).toBeInTheDocument();
      expect(screen.getByText('完全访问')).toBeInTheDocument();
    });
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
          agent_id: 'agent-claude',
          agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
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
            value: 'agent-aionrs',
            setValue: vi.fn(),
            availableBackends: [
              {
                id: 'agent-aionrs',
                name: 'Aionrs',
                runtimeKey: 'aionrs',
                isExtension: false,
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

  it('uses aionrs runtime catalog for default permission options', async () => {
    mockManagedAgentRuntimeCatalog = [
      {
        id: 'agent-aionrs',
        available_modes: {
          current_mode_id: 'default',
          available_modes: [
            { id: 'default', name: 'Default' },
            { id: 'auto_edit', name: 'Auto Edit' },
            { id: 'yolo', name: 'YOLO' },
          ],
        },
        config_options: {
          config_options: [
            {
              id: 'mode',
              category: 'mode',
              type: 'select',
              current_value: 'default',
              options: [
                { value: 'default', name: 'Default' },
                { value: 'auto_edit', name: 'Auto Edit' },
                { value: 'yolo', name: 'YOLO' },
              ],
            },
          ],
        },
      },
    ];

    renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          agent: {
            value: 'agent-aionrs',
            setValue: vi.fn(),
            availableBackends: [backendOption('agent-aionrs', 'aionrs', 'Aion CLI')],
          },
        })}
        activeAssistant={null}
      />
    );

    fireEvent.click(screen.getByTestId('select-assistant-default-permission'));
    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument();
      expect(screen.getByText('Auto Edit')).toBeInTheDocument();
      expect(screen.getByText('YOLO')).toBeInTheDocument();
    });
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
            value: 'agent-claude',
            setValue: vi.fn(),
            availableBackends: [backendOption('agent-claude', 'claude', 'Claude')],
          },
        })}
        activeAssistant={{
          id: 'cowork',
          name: 'Cowork',
          sort_order: 1,
          source: 'builtin',
          enabled: true,
          agent_id: 'agent-claude',
          agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
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

  it('renders generated assistants with locked identity and editable local configuration', () => {
    const { container } = renderWithProviders(
      <AssistantEditorSections
        editor={createEditor({
          isCreating: false,
          profile: {
            name: 'Droid',
            setName: vi.fn(),
            description: 'Bare assistant',
            setDescription: vi.fn(),
            avatar: '🤖',
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
          rules: { content: 'bare rules', setContent: vi.fn(), viewMode: 'preview', setViewMode: vi.fn() },
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
            value: 'agent-droid',
            setValue: vi.fn(),
            availableBackends: [backendOption('agent-droid', 'droid', 'droid')],
          },
        })}
        activeAssistant={{
          id: 'generated-assistant',
          name: 'Droid',
          sort_order: 1,
          source: 'generated',
          enabled: true,
          agent_id: 'agent-droid',
          agent: { type: 'droid', source: 'custom' },
        }}
      />
    );

    expect(screen.getByTestId('assistant-cli-readonly-banner')).toBeInTheDocument();

    expect(screen.getByTestId('input-assistant-name')).toBeDisabled();
    expect(screen.getByTestId('input-assistant-desc')).not.toBeDisabled();

    const agentSelect = container.querySelector('[data-testid="select-assistant-agent"]');
    const modelSelect = container.querySelector('[data-testid="select-assistant-default-model"]');
    const permissionSelect = container.querySelector('[data-testid="select-assistant-default-permission"]');

    expect(agentSelect?.className).toContain('arco-select-disabled');
    expect(modelSelect?.className).not.toContain('arco-select-disabled');
    expect(permissionSelect?.className).not.toContain('arco-select-disabled');
    expect(screen.getByTestId('select-assistant-default-skills')).toBeInTheDocument();
    expect(screen.getByTestId('select-assistant-default-mcp')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('assistant-card-prompts')).getByRole('button', { name: 'Add' })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('assistant-card-rules')).getByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
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
