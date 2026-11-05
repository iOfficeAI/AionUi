/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

let mockLanguage = 'en-US';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => {
      if (mockLanguage === 'zh-CN') return `zh:${key}`;
      if (key === 'common.documentTitleWithName' && options?.name) return `${options.name} - AionUi`;
      return key;
    },
    i18n: { language: mockLanguage },
  }),
}));

const mocks = vi.hoisted(() => ({
  conversationGet: vi.fn(),
  teamGet: vi.fn(),
  conversationListChanged: new Set<(event: { conversation_id: string; action: string }) => void>(),
  teamListChanged: new Set<(event: { team_id: string; action: string }) => void>(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: mocks.conversationGet },
      listChanged: {
        on: (cb: (event: { conversation_id: string; action: string }) => void) => {
          mocks.conversationListChanged.add(cb);
          return () => mocks.conversationListChanged.delete(cb);
        },
      },
    },
    team: {
      get: { invoke: mocks.teamGet },
      listChanged: {
        on: (cb: (event: { team_id: string; action: string }) => void) => {
          mocks.teamListChanged.add(cb);
          return () => mocks.teamListChanged.delete(cb);
        },
      },
    },
  },
}));

import DocumentTitle, { titleForPath } from '@/renderer/components/layout/DocumentTitle';

describe('titleForPath', () => {
  const t = (key: string) => `t(${key})`;

  it('uses the login title on the login route only', () => {
    expect(titleForPath('/login', t)).toBe('t(login.pageTitle)');
    expect(titleForPath('/guid', t)).toBe('AionUi');
    expect(titleForPath('/conversation/abc', t)).toBe('AionUi');
    expect(titleForPath('/settings/agent', t)).toBe('AionUi');
  });
});

describe('DocumentTitle', () => {
  it('resets the title to AionUi after leaving the login page', () => {
    // The old behaviour set document.title once on the login page and never
    // updated it again, so post-login pages kept the login title.
    document.title = 'AionUi - stale login title';
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <DocumentTitle />
      </MemoryRouter>
    );
    expect(document.title).toBe('AionUi');
  });

  it('sets the localised login title on the login route', () => {
    mockLanguage = 'zh-CN';
    render(
      <MemoryRouter initialEntries={['/login']}>
        <DocumentTitle />
      </MemoryRouter>
    );
    expect(document.title).toBe('zh:login.pageTitle');
    mockLanguage = 'en-US';
  });

  it('shows the conversation name in the title on a conversation route', async () => {
    mocks.conversationGet.mockResolvedValue({ id: 'abc1234', name: 'Trip plan' });
    render(
      <MemoryRouter initialEntries={['/conversation/abc1234']}>
        <DocumentTitle />
      </MemoryRouter>
    );
    await vi.waitFor(() => expect(document.title).toBe('Trip plan - AionUi'));
  });

  it('falls back to AionUi when the conversation fetch fails', async () => {
    mocks.conversationGet.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter initialEntries={['/conversation/bad']}>
        <DocumentTitle />
      </MemoryRouter>
    );
    await vi.waitFor(() => expect(document.title).toBe('AionUi'));
  });

  it('shows the team name in the title on a team route', async () => {
    mocks.teamGet.mockResolvedValue({ id: 'team01', name: 'Launch crew' });
    render(
      <MemoryRouter initialEntries={['/team/team01']}>
        <DocumentTitle />
      </MemoryRouter>
    );
    await vi.waitFor(() => expect(document.title).toBe('Launch crew - AionUi'));
  });

  it('refreshes the title when the open conversation is renamed', async () => {
    mocks.conversationGet.mockResolvedValue({ id: 'abc1234', name: 'Old name' });
    render(
      <MemoryRouter initialEntries={['/conversation/abc1234']}>
        <DocumentTitle />
      </MemoryRouter>
    );
    await vi.waitFor(() => expect(document.title).toBe('Old name - AionUi'));

    mocks.conversationGet.mockResolvedValue({ id: 'abc1234', name: 'Renamed' });
    for (const cb of mocks.conversationListChanged) cb({ conversation_id: 'abc1234', action: 'updated' });
    await vi.waitFor(() => expect(document.title).toBe('Renamed - AionUi'));
  });

  it('ignores list changes for other conversations', async () => {
    mocks.conversationGet.mockResolvedValue({ id: 'abc1234', name: 'Trip plan' });
    render(
      <MemoryRouter initialEntries={['/conversation/abc1234']}>
        <DocumentTitle />
      </MemoryRouter>
    );
    await vi.waitFor(() => expect(document.title).toBe('Trip plan - AionUi'));

    mocks.conversationGet.mockResolvedValue({ id: 'other99', name: 'Other' });
    for (const cb of mocks.conversationListChanged) cb({ conversation_id: 'other99', action: 'updated' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.title).toBe('Trip plan - AionUi');
  });
});
