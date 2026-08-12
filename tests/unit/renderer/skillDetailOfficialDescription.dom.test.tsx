/**
 * DOM tests: SkillDetailPage shows the skill description localized to the
 * current UI locale, with the English original as the hover tooltip.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import {
  OFFICIAL_SKILL_DESCRIPTIONS,
  getSkillDescriptionEnglish,
} from '@/renderer/pages/settings/SkillsSettings/officialSkillDescriptions';
import SkillDetailPage from '@/renderer/pages/settings/SkillsSettings/SkillDetailPage';

const mocks = vi.hoisted(() => ({
  language: 'zh-CN',
  t: vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { language: mocks.language } }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
    },
    fs: {
      listAvailableSkills: { invoke: vi.fn() },
    },
  },
}));

vi.mock('swr', () => {
  const useSWRMock = vi.fn(() => ({ data: [], isLoading: false, mutate: vi.fn() }));
  return {
    default: useSWRMock,
    mutate: vi.fn(),
  };
});

vi.mock('@/renderer/hooks/assistant/useTalkToButler', () => ({
  useTalkToButler: vi.fn(() => vi.fn()),
}));

vi.mock('@/renderer/pages/settings/AssistantSettings/AssistantAvatar', () => ({
  default: () => <span data-testid='assistant-avatar' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    loading: _loading,
    ...props
  }: {
    children?: React.ReactNode;
    icon?: React.ReactNode;
    loading?: boolean;
    [key: string]: unknown;
  }) => (
    <button {...props}>
      {icon}
      {children}
    </button>
  ),
  Dropdown: ({ children, droplist }: { children?: React.ReactNode; droplist?: React.ReactNode }) => (
    <div>
      {children}
      <div data-testid='dropdown-list'>{droplist}</div>
    </div>
  ),
  Menu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  'Menu.Item': ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  Message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  Spin: () => <span data-testid='spin' />,
  Typography: {
    Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  },
}));

vi.mock('@icon-park/react', () => ({
  ArrowLeft: () => <span data-testid='icon-arrow-left' />,
  Close: () => <span data-testid='icon-close' />,
  Plus: () => <span data-testid='icon-plus' />,
  Right: () => <span data-testid='icon-right' />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/SkillsSettings/SkillFileBrowser', () => ({
  default: () => <div data-testid='skill-file-browser' />,
}));

vi.mock('@/renderer/pages/settings/SkillsSettings/SkillUsedByStack', () => ({
  getAssistantsUsingSkill: () => [],
}));

const officialSkill = {
  name: 'mermaid',
  description: OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US'],
  location: '/skills/mermaid',
  is_auto_inject: false,
  is_custom: false,
  source: 'builtin',
};

const customSkill = {
  name: 'my-custom-skill',
  description: 'Custom skill description from backend.',
  location: '/skills/my-custom-skill',
  is_auto_inject: false,
  is_custom: true,
  source: 'custom',
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/settings/skills/mermaid', state: { skillsTab: 'official' } }]}>
      <Routes>
        <Route path='/settings/skills/:skillName' element={<SkillDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('SkillDetailPage description i18n', () => {
  beforeEach(async () => {
    mocks.language = 'zh-CN';
    mocks.t.mockClear();
    const useSWRMock = (await import('swr')).default as ReturnType<typeof vi.fn>;
    useSWRMock.mockReset();
    useSWRMock.mockImplementation((key: string) => {
      if (key === 'skills.list') {
        return { data: [officialSkill, customSkill], isLoading: false };
      }
      if (key === 'assistants.list') {
        return { data: [], isLoading: false, mutate: vi.fn() };
      }
      return { data: [], isLoading: false };
    });
    vi.mocked(ipcBridge.fs.listAvailableSkills.invoke).mockResolvedValue([officialSkill, customSkill] as never);
    vi.mocked(ipcBridge.assistants.list.invoke).mockResolvedValue([] as never);
  });

  it('shows the description in the current locale (zh-CN) with the English original as hover title', async () => {
    renderPage();

    const desc = (await screen.findByTestId('skill-detail-info')).querySelector('p');
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['zh-CN']);
    expect(desc?.getAttribute('title')).toBe(getSkillDescriptionEnglish('mermaid'));
    expect(desc?.getAttribute('title')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('shows the canonical English description when the UI locale is en-US', async () => {
    mocks.language = 'en-US';
    renderPage();

    const desc = (await screen.findByTestId('skill-detail-info')).querySelector('p');
    expect(desc?.textContent).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
    expect(desc?.getAttribute('title')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('falls back to English for an unknown UI locale', async () => {
    mocks.language = 'xx-XX';
    renderPage();

    const desc = (await screen.findByTestId('skill-detail-info')).querySelector('p');
    expect(desc?.textContent).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('keeps the backend description for non-official skills (no English hover override)', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/settings/skills/my-custom-skill', state: { skillsTab: 'custom' } }]}>
        <Routes>
          <Route path='/settings/skills/:skillName' element={<SkillDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const desc = (await screen.findByTestId('skill-detail-info')).querySelector('p');
    expect(desc?.textContent).toBe('Custom skill description from backend.');
    expect(desc?.getAttribute('title')).toBeNull();
  });
});
