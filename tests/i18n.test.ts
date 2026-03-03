/**
 * i18n unit tests
 */

import * as fs from 'fs';
import * as path from 'path';

// Test constants using __dirname-relative paths
const LOCALES_DIR = path.resolve(__dirname, '../src/renderer/i18n/locales');
const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'] as const;
const REQUIRED_MODULES = ['common', 'agentMode', 'update', 'login', 'fileSelection', 'preview', 'conversation', 'settings', 'messages', 'mcp', 'acp', 'codex', 'tools', 'gemini', 'cron', 'guid', 'agent'] as const;

// Helper: recursively collect all translation keys
function getAllKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];

  if (typeof obj !== 'object' || obj === null) {
    return keys;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

describe('i18n Modular Structure Tests', () => {
  describe('Directory Structure', () => {
    it('should contain the locales directory', () => {
      expect(fs.existsSync(LOCALES_DIR)).toBe(true);
    });

    it('should contain a directory for each supported language', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const langDir = path.join(LOCALES_DIR, lang);
        expect(fs.existsSync(langDir)).toBe(true);
      }
    });

    it('should not contain legacy single JSON locale files', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const oldFile = path.join(LOCALES_DIR, `${lang}.json`);
        expect(fs.existsSync(oldFile)).toBe(false);
      }
    });
  });

  describe('Module File Integrity', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      describe(`${lang}`, () => {
        for (const module of REQUIRED_MODULES) {
          it(`should include ${module}.json module`, () => {
            const moduleFile = path.join(LOCALES_DIR, lang, `${module}.json`);
            expect(fs.existsSync(moduleFile)).toBe(true);
          });

          it(`${module}.json should be valid JSON`, () => {
            const moduleFile = path.join(LOCALES_DIR, lang, `${module}.json`);
            if (fs.existsSync(moduleFile)) {
              const content = fs.readFileSync(moduleFile, 'utf-8');
              expect(() => JSON.parse(content)).not.toThrow();
            }
          });
        }

        it('should include index.ts entry file', () => {
          const indexFile = path.join(LOCALES_DIR, lang, 'index.ts');
          expect(fs.existsSync(indexFile)).toBe(true);
        });
      });
    }
  });

  describe('Translation Key Consistency', () => {
    // Use en-US as the baseline
    const referenceLang = 'en-US';
    const referenceModules: Record<string, string[]> = {};

    beforeAll(() => {
      // Collect all baseline keys
      for (const module of REQUIRED_MODULES) {
        const moduleFile = path.join(LOCALES_DIR, referenceLang, `${module}.json`);
        if (fs.existsSync(moduleFile)) {
          const content = JSON.parse(fs.readFileSync(moduleFile, 'utf-8'));
          referenceModules[module] = getAllKeys(content);
        }
      }
    });

    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === referenceLang) continue;

      it(`${lang} translation coverage should be greater than 70%`, () => {
        let totalReferenceKeys = 0;
        let matchedKeys = 0;

        for (const module of REQUIRED_MODULES) {
          const moduleFile = path.join(LOCALES_DIR, lang, `${module}.json`);
          const referenceKeys = referenceModules[module] || [];

          if (fs.existsSync(moduleFile)) {
            const content = JSON.parse(fs.readFileSync(moduleFile, 'utf-8'));
            const currentKeys = getAllKeys(content);

            totalReferenceKeys += referenceKeys.length;
            matchedKeys += referenceKeys.filter((k) => currentKeys.includes(k)).length;
          }
        }

        // Coverage should be above 70%
        const coverage = matchedKeys / totalReferenceKeys;
        expect(coverage).toBeGreaterThan(0.7);
      });
    }
  });
});

describe('i18n Configuration Tests', () => {
  it('index.ts should exist', () => {
    const indexFile = path.resolve(__dirname, '../src/renderer/i18n/index.ts');
    expect(fs.existsSync(indexFile)).toBe(true);
  });

  it('index.ts should include supported languages', () => {
    const indexFile = path.resolve(__dirname, '../src/renderer/i18n/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    expect(content).toContain('zh-CN');
    expect(content).toContain('en-US');
    expect(content).toContain('ja-JP');
  });

  it('index.ts should export changeLanguage function', () => {
    const indexFile = path.resolve(__dirname, '../src/renderer/i18n/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    expect(content).toContain('export async function changeLanguage');
  });
});
