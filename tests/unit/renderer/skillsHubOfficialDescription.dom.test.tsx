/**
 * DOM tests: official skill cards in SkillsHubSettings show the description
 * localized to the current UI locale, with the English original available as
 * the hover tooltip (title attribute). Non-official skills stay untouched.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import {
  OFFICIAL_SKILL_DESCRIPTIONS,
  getSkillDescriptionEnglish,
} from '@/renderer/pages/settings/SkillsSettings/officialSkillDescriptions';
import SkillsHubSettings from '@/renderer/pages/settings/SkillsSettings/SkillsHubSettings';

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
    },
    fs: {
      listAvailableSkills: { invoke: vi.fn() },
      listSkillImportHistory: { invoke: vi.fn() },
      getSkillImportLimits: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <label>
      <input type='checkbox' {...props} />
      {children}
    </label>
  ),
  Message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  Modal: { confirm: vi.fn() },
}));

vi.mock('@icon-park/react', () => ({
  Delete: () => <span data-testid='icon-delete' />,
  Help: () => <span data-testid='icon-help' />,
  Lightning: () => <span data-testid='icon-lightning' />,
  Puzzle: () => <span data-testid='icon-puzzle' />,
}));

vi.mock('swr', () => ({ default: vi.fn(() => ({ data: [] })) }));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/settings/SkillsSettings/SkillUsedByStack', () => ({
  default: () => <span data-testid='skill-used-by-stack' />,
  getAssistantsUsingSkill: () => [],
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({
  default: ({
    title,
    description,
    actions,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
  }) => (
    <header data-testid='settings-page-header'>
      <div>{title}</div>
      <div>{description}</div>
      <div>{actions}</div>
    </header>
  ),
}));

vi.mock('@/renderer/components/base/TalkToButlerButton', () => ({
  default: ({ label }: { label?: React.ReactNode }) => <button data-testid='btn-add-skill'>{label}</button>,
}));

vi.mock('@/renderer/components/base', () => ({
  AionSearchInput: ({ value, onChange }: { value?: string; onChange?: (v: string) => void }) => (
    <input data-testid='input-search' value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

const officialSkill = {
  name: 'mermaid',
  description: OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US'],
  location: '/skills/mermaid',
  is_auto_inject: false,
  is_custom: false,
  source: 'builtin',
};

const extensionSkill = {
  name: 'custom-extension',
  description: 'Extension description from backend.',
  location: '/skills/custom-extension',
  is_auto_inject: false,
  is_custom: false,
  source: 'extension',
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/settings/skills', state: { skillsTab: 'official' } }]}>
      <SkillsHubSettings withWrapper={false} />
    </MemoryRouter>
  );

describe('SkillsHubSettings official skill card description i18n', () => {
  beforeEach(() => {
    mocks.language = 'zh-CN';
    mocks.t.mockClear();
    vi.mocked(ipcBridge.fs.listAvailableSkills.invoke).mockResolvedValue([officialSkill, extensionSkill] as never);
    vi.mocked(ipcBridge.fs.listSkillImportHistory.invoke).mockResolvedValue([] as never);
    vi.mocked(ipcBridge.fs.getSkillImportLimits.invoke).mockResolvedValue({} as never);
    vi.mocked(ipcBridge.assistants.list.invoke).mockResolvedValue([] as never);
  });

  it('shows the description in the current locale (zh-CN) with the English original as hover title', async () => {
    renderPage();

    const card = await screen.findByTestId('official-skill-card-mermaid');
    const desc = card.querySelector('p');
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['zh-CN']);
    expect(desc?.getAttribute('title')).toBe(getSkillDescriptionEnglish('mermaid'));
    expect(desc?.getAttribute('title')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('shows the canonical English description when the UI locale is en-US', async () => {
    mocks.language = 'en-US';
    renderPage();

    const card = await screen.findByTestId('official-skill-card-mermaid');
    const desc = card.querySelector('p');
    expect(desc?.textContent).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
    expect(desc?.getAttribute('title')).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('falls back to English for an unknown UI locale', async () => {
    mocks.language = 'xx-XX';
    renderPage();

    const card = await screen.findByTestId('official-skill-card-mermaid');
    const desc = card.querySelector('p');
    expect(desc?.textContent).toBe(OFFICIAL_SKILL_DESCRIPTIONS.mermaid['en-US']);
  });

  it('leaves non-official skills unchanged (backend description is rendered)', async () => {
    renderPage();

    await screen.findByTestId('official-skill-card-mermaid');
    const extensionDesc = screen.getByText('Extension description from backend.');
    expect(extensionDesc).toBeInTheDocument();
    expect(extensionDesc.textContent).toBe('Extension description from backend.');
  });
});
