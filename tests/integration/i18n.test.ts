/**
 * i18n unit tests
 */

import * as fs from 'fs';
import * as path from 'path';
import i18nConfig from '../../src/common/config/i18n-config.json';

// Test constants using __dirname-relative paths
const LOCALES_DIR = path.resolve(__dirname, '../../src/renderer/services/i18n/locales');
const SUPPORTED_LANGUAGES = i18nConfig.supportedLanguages;
const REQUIRED_MODULES = i18nConfig.modules;

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
    const referenceLang = i18nConfig.referenceLanguage;
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
    const indexFile = path.resolve(__dirname, '../../src/renderer/services/i18n/index.ts');
    expect(fs.existsSync(indexFile)).toBe(true);
  });

  it('index.ts should use shared i18n module and re-export supportedLanguages', () => {
    const indexFile = path.resolve(__dirname, '../../src/renderer/services/i18n/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    // Config is now consumed via @/common/i18n (single source of truth)
    expect(content).toContain('@/common/config/i18n');
    expect(content).toMatch(/export\s+.*supportedLanguages/);
  });

  it('index.ts should export changeLanguage function', () => {
    const indexFile = path.resolve(__dirname, '../../src/renderer/services/i18n/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    expect(content).toContain('export async function changeLanguage');
  });
});

describe('i18n Build Safety Tests', () => {
  const mainI18nFile = path.resolve(__dirname, '../../src/process/services/i18n/index.ts');
  const rendererI18nFile = path.resolve(__dirname, '../../src/renderer/services/i18n/index.ts');

  it('main process i18n should NOT use fs.readFile for locale loading', () => {
    const content = fs.readFileSync(mainI18nFile, 'utf-8');
    // fs.readFile / fs.promises.readFile with locale paths will break in production
    // because Vite bundles renderer assets and the JSON files won't exist on disk.
    expect(content).not.toMatch(/fs\.promises\.readFile/);
    expect(content).not.toMatch(/fs\.readFileSync/);
    expect(content).not.toMatch(/fs\.readFile\(/);
  });

  it('main process i18n should NOT use __dirname-relative path to resolve locale files', () => {
    const content = fs.readFileSync(mainI18nFile, 'utf-8');
    // path.resolve(__dirname, '../../renderer/i18n/locales') breaks after bundling
    expect(content).not.toMatch(/path\.resolve\(__dirname.*locales/);
    expect(content).not.toMatch(/path\.join\(.*locales.*\.json/);
  });

  it('main process i18n should use static imports for locale data', () => {
    const content = fs.readFileSync(mainI18nFile, 'utf-8');
    // Verify it imports from locale index files (static import)
    expect(content).toMatch(/import\s+\w+\s+from\s+['"]@renderer\/services\/i18n\/locales\//);
  });

  it('main process i18n should NOT import node:fs', () => {
    const content = fs.readFileSync(mainI18nFile, 'utf-8');
    expect(content).not.toContain("from 'node:fs'");
    expect(content).not.toContain("require('fs')");
  });

  it('main process i18n should use shared utility functions', () => {
    const content = fs.readFileSync(mainI18nFile, 'utf-8');
    expect(content).toContain('@/common/config/i18n');
  });

  it('renderer i18n should use shared utility functions', () => {
    const content = fs.readFileSync(rendererI18nFile, 'utf-8');
    expect(content).toContain('@/common/config/i18n');
  });

  it('renderer i18n should synchronously load fallback locale to prevent FOUC', () => {
    const content = fs.readFileSync(rendererI18nFile, 'utf-8');
    // Should have a synchronous import of the fallback locale
    expect(content).toMatch(/import\s+\w+\s+from\s+['"]\.\/locales\/en-US\/index['"]/);
    // The init() call should include pre-loaded resources, not empty {}
    expect(content).not.toMatch(/resources:\s*\{\s*\}/);
  });

  it('renderer i18n should use static locale imports (packaged-safe)', () => {
    const content = fs.readFileSync(rendererI18nFile, 'utf-8');
    expect(content).toMatch(/import\s+enUS\s+from\s+['"]\.\/locales\/en-US\/index['"]/);
    expect(content).toMatch(/import\s+zhCN\s+from\s+['"]\.\/locales\/zh-CN\/index['"]/);
    expect(content).toMatch(/import\s+jaJP\s+from\s+['"]\.\/locales\/ja-JP\/index['"]/);
    expect(content).toMatch(/import\s+zhTW\s+from\s+['"]\.\/locales\/zh-TW\/index['"]/);
    expect(content).toMatch(/import\s+koKR\s+from\s+['"]\.\/locales\/ko-KR\/index['"]/);
    expect(content).toMatch(/import\s+trTR\s+from\s+['"]\.\/locales\/tr-TR\/index['"]/);
    expect(content).not.toContain('import(`./locales/${locale}/index`)');
  });

  it('should not have duplicate normalizeLanguageCode implementations', () => {
    const mainContent = fs.readFileSync(mainI18nFile, 'utf-8');
    const rendererContent = fs.readFileSync(rendererI18nFile, 'utf-8');

    // Neither file should define normalizeLanguageCode locally
    expect(mainContent).not.toMatch(/^function normalizeLanguageCode/m);
    expect(rendererContent).not.toMatch(/^function normalizeLanguageCode/m);
  });

  it('should not have duplicate isPlainObject implementations', () => {
    const mainContent = fs.readFileSync(mainI18nFile, 'utf-8');
    const rendererContent = fs.readFileSync(rendererI18nFile, 'utf-8');

    // Neither file should define isPlainObject locally
    expect(mainContent).not.toMatch(/^function isPlainObject/m);
    expect(rendererContent).not.toMatch(/^function isPlainObject/m);
  });

  it('hardcoded English strings should not exist in TSX component files', () => {
    // Check known files that previously had hardcoded strings
    const filesToCheck = [
      path.resolve(__dirname, '../../src/renderer/components/SettingsModal/contents/ModelModalContent.tsx'),
      path.resolve(__dirname, '../../src/renderer/pages/conversation/Preview/components/viewers/URLViewer.tsx'),
      path.resolve(__dirname, '../../src/renderer/pages/conversation/Workspace/index.tsx'),
    ];

    const hardcodedPatterns = [
      /\{'Health status cleared'\}/,
      /\{'Clear status'\}/,
      /\{'Latency'\}/,
      /\{'Health Check'\}/,
      /title=\{'Forward'\}/,
      /aria-label=\{'More'\}/,
    ];

    for (const file of filesToCheck) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of hardcodedPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
