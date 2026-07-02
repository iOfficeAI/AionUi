import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for SkillsHubSettings component (SK3 in N4a).
 * Shallow verification: module import + basic structure.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAvailableSkills: vi.fn(),
  getSkillPaths: vi.fn(),
  getSkillImportLimits: vi.fn(),
  listSkillImportHistory: vi.fn(),
  importSkills: vi.fn(),
  showOpen: vi.fn(),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
}));

const searchParamsMock = vi.hoisted(() => ({
  current: new URLSearchParams(),
  setSearchParams: vi.fn(),
  pathname: '/settings/capabilities',
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: mocks.listAvailableSkills },
      getSkillPaths: { invoke: mocks.getSkillPaths },
      getSkillImportLimits: { invoke: mocks.getSkillImportLimits },
      listSkillImportHistory: { invoke: mocks.listSkillImportHistory },
      importSkills: { invoke: mocks.importSkills },
    },
    dialog: {
      showOpen: { invoke: mocks.showOpen },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      error: mocks.messageError,
      success: mocks.messageSuccess,
      warning: mocks.messageWarning,
    },
  };
});

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: searchParamsMock.pathname }),
  useNavigate: () => searchParamsMock.navigate,
  useSearchParams: () => [searchParamsMock.current, searchParamsMock.setSearchParams],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'settings.skillsHub.importError': 'Error importing skill',
        'settings.skillsHub.importPartialSuccess':
          'Imported {{successCount}} skill(s), {{failureCount}} failed: {{failures}}',
        'settings.skillsHub.importErrors.SKILL_IMPORT_FILE_TOO_LARGE':
          'A file in this skill is over the size limit. Remove the large file and try again.',
      };
      const template = translations[k] ?? (typeof options?.defaultValue === 'string' ? options.defaultValue : k);
      return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(options?.[key] ?? ''));
    },
    i18n: { language: 'en' },
  }),
}));

import SkillsHubSettings from '@/renderer/pages/settings/SkillsHubSettings';

describe('SkillsHubSettings', () => {
  // The import action is now a TalkToButlerButton: open the menu, then click
  // "Import Skills" (the manual item) to run the manual import.
  const triggerManualImport = async () => {
    fireEvent.click(screen.getByTestId('btn-add-skill'));
    const marker = await screen.findByTestId('btn-add-skill-manual');
    fireEvent.click((marker.closest('[role="menuitem"]') ?? marker) as HTMLElement);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.current = new URLSearchParams();
    searchParamsMock.pathname = '/settings/capabilities';
    mocks.listAvailableSkills.mockResolvedValue([]);
    mocks.getSkillPaths.mockResolvedValue({
      user_skills_dir: '/tmp/user-skills',
      builtin_skills_dir: '/tmp/builtin-skills',
    });
    mocks.getSkillImportLimits.mockResolvedValue({
      max_file_bytes: 12 * 1024 * 1024,
      max_total_bytes: 64 * 1024 * 1024,
    });
    mocks.listSkillImportHistory.mockResolvedValue([]);
  });

  it('exports a component (smoke)', () => {
    expect(SkillsHubSettings).toBeDefined();
    expect(typeof SkillsHubSettings).toBe('function');
  });

  it('has display name or name property (structure check)', () => {
    expect(SkillsHubSettings.displayName || SkillsHubSettings.name).toBeTruthy();
  });

  it('can be instantiated as JSX element (shallow)', () => {
    const element = <SkillsHubSettings />;
    expect(element.type).toBe(SkillsHubSettings);
  });

  it('shows backend import failure detail for manual imports', async () => {
    mocks.showOpen.mockResolvedValue(['/tmp/huge-skill']);
    mocks.importSkills.mockRejectedValue(
      Object.assign(new Error('wrapped import failure'), {
        name: 'BackendHttpError',
        status: 400,
        code: 'SKILL_IMPORT_FILE_TOO_LARGE',
      })
    );

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.listAvailableSkills).toHaveBeenCalled());
    await triggerManualImport();

    await waitFor(() =>
      expect(mocks.messageError).toHaveBeenCalledWith(
        'A file in this skill is over the size limit. Remove the large file and try again.'
      )
    );
  });

  it('shows partial import warning and refreshes after batch import partial success', async () => {
    mocks.showOpen.mockResolvedValue(['/tmp/parent-pack']);
    mocks.importSkills.mockResolvedValue({
      skill_name: 'sample-alpha',
      skill_names: ['sample-alpha'],
      failed: [{ source_name: 'beta-skill', code: 'SKILL_IMPORT_FILE_TOO_LARGE' }],
    });

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.listAvailableSkills).toHaveBeenCalled());
    const initialFetchCount = mocks.listAvailableSkills.mock.calls.length;
    await triggerManualImport();

    await waitFor(() =>
      expect(mocks.messageWarning).toHaveBeenCalledWith(
        'Imported 1 skill(s), 1 failed: beta-skill: A file in this skill is over the size limit. Remove the large file and try again.'
      )
    );
    await waitFor(() => expect(mocks.listAvailableSkills.mock.calls.length).toBeGreaterThan(initialFetchCount));
  });

  it('renders import history failure detail in the secondary view', async () => {
    searchParamsMock.pathname = '/settings/capabilities/skills/import-history';
    mocks.listSkillImportHistory.mockResolvedValue([
      {
        id: 'record-1',
        operation_id: 'operation-1',
        source_label: 'parent-pack',
        source_name: 'beta-skill',
        status: 'failed',
        error_code: 'SKILL_IMPORT_FILE_TOO_LARGE',
        error_path: 'movie.bin',
        actual_bytes: 11 * 1024 * 1024,
        limit_bytes: 10 * 1024 * 1024,
        created_at: 1_700_000_000_000,
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('skill-import-history-page')).toBeInTheDocument());
    expect(screen.getByText('parent-pack')).toBeInTheDocument();
    expect(screen.getByText(/beta-skill/)).toBeInTheDocument();
    expect(screen.getAllByText(/movie\.bin/).length).toBeGreaterThan(0);
  });

  it('renders import history entry point when history is empty', async () => {
    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('btn-open-import-history')).toBeInTheDocument());
    expect(screen.queryByText('No import records yet.')).not.toBeInTheDocument();
  });

  it('renders import history as a secondary view without search or category filters', async () => {
    searchParamsMock.pathname = '/settings/capabilities/skills/import-history';
    mocks.listSkillImportHistory.mockResolvedValue([
      {
        id: 'record-1',
        operation_id: 'operation-1',
        source_label: 'parent-pack',
        source_name: 'beta-skill',
        status: 'failed',
        error_code: 'SKILL_IMPORT_FILE_TOO_LARGE',
        error_path: 'movie.bin',
        actual_bytes: 11 * 1024 * 1024,
        limit_bytes: 10 * 1024 * 1024,
        created_at: 1_700_000_000_000,
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('skill-import-history-page')).toBeInTheDocument());
    expect(screen.queryByTestId('my-skills-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-search-my-skills')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Failed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Success' })).not.toBeInTheDocument();
  });

  it('shows concise repair instructions for failed import history records', async () => {
    searchParamsMock.pathname = '/settings/capabilities/skills/import-history';
    mocks.listSkillImportHistory.mockResolvedValue([
      {
        id: 'record-1',
        operation_id: 'operation-1',
        source_label: 'parent-pack',
        source_name: 'beta-skill',
        status: 'failed',
        error_code: 'SKILL_IMPORT_FILE_TOO_LARGE',
        error_path: 'movie.bin',
        actual_bytes: 11 * 1024 * 1024,
        limit_bytes: 10 * 1024 * 1024,
        created_at: 1_700_000_000_000,
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('skill-import-history-page')).toBeInTheDocument());
    expect(screen.getByText('Repair: remove the oversized file and import again')).toBeInTheDocument();
    expect(screen.getAllByText(/movie\.bin/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/11 MB/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10 MB/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Latest 5')).not.toBeInTheDocument();
  });

  it('does not expose technical error details in import history', async () => {
    searchParamsMock.pathname = '/settings/capabilities/skills/import-history';
    mocks.listSkillImportHistory.mockResolvedValue([
      {
        id: 'record-1',
        operation_id: 'operation-1',
        source_label: 'parent-pack',
        source_name: 'beta-skill',
        status: 'failed',
        error_code: 'SKILL_IMPORT_FILE_TOO_LARGE',
        error_path: 'movie.bin',
        actual_bytes: 11 * 1024 * 1024,
        limit_bytes: 10 * 1024 * 1024,
        created_at: 1_700_000_000_000,
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('skill-import-history-page')).toBeInTheDocument());
    expect(screen.queryByText('Technical info')).not.toBeInTheDocument();
    expect(screen.queryByText('SKILL_IMPORT_FILE_TOO_LARGE')).not.toBeInTheDocument();
  });

  it('shows specific repair instructions for known non-size import errors', async () => {
    searchParamsMock.pathname = '/settings/capabilities/skills/import-history';
    mocks.listSkillImportHistory.mockResolvedValue([
      {
        id: 'record-zip',
        operation_id: 'operation-zip',
        source_label: 'broken.zip',
        source_name: 'broken.zip',
        status: 'failed',
        error_code: 'SKILL_IMPORT_INVALID_ZIP',
        created_at: 1_700_000_000_000,
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('skill-import-history-page')).toBeInTheDocument());
    expect(screen.getByText('Repair: create the zip again and import it')).toBeInTheDocument();
    expect(screen.queryByText('Repair: update the skill files and import again')).not.toBeInTheDocument();
  });

  it('does not render an available status tag for imported skills', async () => {
    mocks.listAvailableSkills.mockResolvedValue([
      {
        name: 'sample-single',
        description: 'Single folder import fixture.',
        location: '/tmp/user-skills/sample-single',
        is_custom: true,
        source: 'custom',
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('my-skill-card-sample-single')).toBeInTheDocument());
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  it('renders auto-injected skills from the main catalog and keeps cron-source skills out of my skills', async () => {
    mocks.listAvailableSkills.mockResolvedValue([
      {
        name: 'cron',
        description: 'Auto injected cron skill.',
        location: '/tmp/builtin-skills/auto-inject/cron/SKILL.md',
        is_auto_inject: true,
        is_custom: false,
        source: 'builtin',
      },
      {
        name: 'sample-single',
        description: 'Single folder import fixture.',
        location: '/tmp/user-skills/sample-single',
        is_custom: true,
        source: 'custom',
      },
      {
        name: 'job-generated',
        description: 'Generated for a scheduled task.',
        location: '/tmp/cron/skills/job-generated',
        is_custom: false,
        source: 'cron',
      },
    ]);

    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(screen.getByTestId('auto-skills-section')).toBeInTheDocument());
    expect(screen.getByText('cron')).toBeInTheDocument();
    expect(screen.queryByText('job-generated')).not.toBeInTheDocument();
    expect(screen.getByTestId('my-skill-card-sample-single')).toBeInTheDocument();
  });

  it('does not expose the local skills directory path on the skills page', async () => {
    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.listAvailableSkills).toHaveBeenCalled());
    expect(screen.queryByText('/tmp/user-skills')).not.toBeInTheDocument();
  });

  it('renders import rules with server-provided size limits', async () => {
    render(<SkillsHubSettings withWrapper={false} />);

    await waitFor(() => expect(mocks.getSkillImportLimits).toHaveBeenCalled());
    expect(screen.getByText(/12 MB per file, 64 MB per skill/)).toBeInTheDocument();
  });
});
