/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// AC-6 + AC-4/AC-5 copy guarantees, validated against the real locale resources.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'packages/desktop/src/common/config/i18n-config.json');
const LOCALES_DIR = path.join(REPO_ROOT, 'packages/desktop/src/renderer/services/i18n/locales');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as { supportedLanguages: string[] };

function loadCommon(lang: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(LOCALES_DIR, lang, 'common.json'), 'utf8')) as Record<string, unknown>;
}

function getBackendStartup(lang: string): Record<string, Record<string, string>> {
  const common = loadCommon(lang);
  return (common.backendStartup ?? {}) as Record<string, Record<string, string>>;
}

const PENDING_SLOW_KEYS = ['title', 'description'];
const EXITED_KEYS = [
  'title',
  'description',
  'sendDiagnostics',
  'diagnosticsSent',
  'diagnosticsReportSuccess',
  'diagnosticsReportFailed',
];

describe('backend startup copy — completeness (AC-6)', () => {
  it('every supported language defines the pendingSlow and exited key groups', () => {
    expect(config.supportedLanguages.length).toBeGreaterThan(0);

    for (const lang of config.supportedLanguages) {
      const backendStartup = getBackendStartup(lang);
      const pendingSlow = backendStartup.pendingSlow;
      const exited = backendStartup.exited;

      expect(pendingSlow, `${lang} pendingSlow missing`).toBeDefined();
      for (const key of PENDING_SLOW_KEYS) {
        expect(typeof pendingSlow[key], `${lang} pendingSlow.${key}`).toBe('string');
        expect(pendingSlow[key].length, `${lang} pendingSlow.${key} empty`).toBeGreaterThan(0);
      }

      expect(exited, `${lang} exited missing`).toBeDefined();
      for (const key of EXITED_KEYS) {
        expect(typeof exited[key], `${lang} exited.${key}`).toBe('string');
        expect(exited[key].length, `${lang} exited.${key} empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe('backend startup copy — no misleading reinstall/antivirus wording (AC-4/AC-5)', () => {
  it('zh-CN pendingSlow and exited descriptions avoid the reinstall / antivirus / missing-resource phrases', () => {
    const backendStartup = getBackendStartup('zh-CN');
    const forbidden = ['缺少必要的本地资源', '请下载并重新安装', '重新安装', '重装', '杀毒软件', '隔离'];

    for (const description of [backendStartup.pendingSlow.description, backendStartup.exited.description]) {
      for (const phrase of forbidden) {
        expect(description.includes(phrase), `unexpected phrase "${phrase}" in: ${description}`).toBe(false);
      }
    }
  });

  it('en-US pendingSlow and exited descriptions avoid reinstall / antivirus wording', () => {
    const backendStartup = getBackendStartup('en-US');
    const forbidden = ['reinstall', 'antivirus', 'quarantine', 'missing required local resources'];

    for (const description of [backendStartup.pendingSlow.description, backendStartup.exited.description]) {
      const lower = description.toLowerCase();
      for (const phrase of forbidden) {
        expect(lower.includes(phrase.toLowerCase()), `unexpected phrase "${phrase}" in: ${description}`).toBe(false);
      }
    }
  });

  it('regression: zh-CN incompleteInstallation still keeps the reinstall guidance', () => {
    const backendStartup = getBackendStartup('zh-CN');
    expect(backendStartup.incompleteInstallation.description).toContain('重新安装');
  });
});

// Sentry 136646113 — the new portReportTimeout reason and the neutralized
// startupFailed fallback both reuse the exited.* key structure.
describe('backend startup copy — portReportTimeout / startupFailed (Sentry 136646113)', () => {
  const NEW_GROUPS = ['portReportTimeout', 'startupFailed'] as const;

  it('every supported language defines both new key groups with the exited key structure', () => {
    for (const lang of config.supportedLanguages) {
      const backendStartup = getBackendStartup(lang);
      for (const group of NEW_GROUPS) {
        const entry = backendStartup[group];
        expect(entry, `${lang} ${group} missing`).toBeDefined();
        for (const key of EXITED_KEYS) {
          expect(typeof entry[key], `${lang} ${group}.${key}`).toBe('string');
          expect(entry[key].length, `${lang} ${group}.${key} empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('no locale reuses installation-integrity guidance wording in the new copy', () => {
    const forbidden = [
      'reinstall',
      'réinstall',
      'neu installieren',
      'reinstal',
      'переустанов',
      'перевстанов',
      'yeniden yükle',
      '再インストール',
      '재설치',
      '重新安装',
      '重装',
      '重新安裝',
      '杀毒',
      '防毒',
      '隔离',
      '隔離',
      'antivirus',
      'quarantine',
      'quarantaine',
    ];
    for (const lang of config.supportedLanguages) {
      const backendStartup = getBackendStartup(lang);
      for (const group of NEW_GROUPS) {
        for (const key of ['title', 'description'] as const) {
          const text = backendStartup[group][key].toLowerCase();
          for (const phrase of forbidden) {
            expect(text.includes(phrase.toLowerCase()), `${lang} ${group}.${key} contains "${phrase}"`).toBe(false);
          }
        }
      }
    }
  });

  it('new titles stay distinguishable from exited / incompleteInstallation titles in every locale', () => {
    for (const lang of config.supportedLanguages) {
      const backendStartup = getBackendStartup(lang);
      expect(backendStartup.portReportTimeout.title, `${lang} portReportTimeout title clashes with exited`).not.toBe(
        backendStartup.exited.title
      );
      expect(
        backendStartup.portReportTimeout.title,
        `${lang} portReportTimeout title clashes with incompleteInstallation`
      ).not.toBe(backendStartup.incompleteInstallation.title);
      expect(
        backendStartup.startupFailed.title,
        `${lang} startupFailed title clashes with incompleteInstallation`
      ).not.toBe(backendStartup.incompleteInstallation.title);
    }
  });
});
