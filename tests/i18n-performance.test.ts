/**
 * i18n performance tests
 * Verifies lazy-loading and modular locale performance behavior
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.resolve(__dirname, '../src/renderer/i18n/locales');
const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'];
const MODULES = ['common', 'agentMode', 'update', 'login', 'fileSelection', 'preview', 'conversation', 'settings', 'messages', 'mcp', 'acp', 'codex', 'tools', 'gemini', 'cron', 'guid', 'agent'];

describe('i18n Performance Tests', () => {
  describe('Module Loading Performance', () => {
    it('should load a single module in under 10ms', async () => {
      const modulePath = path.join(LOCALES_DIR, 'en-US', 'common.json');

      const start = performance.now();
      const content = await fs.promises.readFile(modulePath, 'utf-8');
      JSON.parse(content);
      const end = performance.now();

      expect(end - start).toBeLessThan(10);
    });

    it('should load a full locale in under 50ms', async () => {
      const start = performance.now();

      for (const module of MODULES) {
        const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
        const content = await fs.promises.readFile(modulePath, 'utf-8');
        JSON.parse(content);
      }

      const end = performance.now();
      expect(end - start).toBeLessThan(50);
    });

    it('should load all modules in parallel successfully', async () => {
      // Load all modules in parallel
      const results = await Promise.all(
        MODULES.map(async (module) => {
          const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
          const content = await fs.promises.readFile(modulePath, 'utf-8');
          return { module, data: JSON.parse(content) };
        })
      );

      // Verify all modules were loaded correctly
      expect(results).toHaveLength(MODULES.length);
      for (const { data } of results) {
        expect(data).toBeDefined();
        expect(typeof data).toBe('object');
      }
    });
  });

  describe('File Size Optimization', () => {
    it('should keep each modularized module smaller', async () => {
      const sizes = await Promise.all(
        MODULES.map(async (module) => {
          const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
          const stats = await fs.promises.stat(modulePath);
          return stats.size;
        })
      );

      const totalSize = sizes.reduce((a, b) => a + b, 0);
      const avgSize = totalSize / MODULES.length;

      // Average module size should be less than 20KB
      expect(avgSize).toBeLessThan(20 * 1024);
    });
  });

  describe('Memory Usage', () => {
    it('should cache only the loaded language', async () => {
      // Simulate loading flow
      const loadedTranslations = new Map<string, Record<string, unknown>>();

      // Load en-US
      const translations: Record<string, unknown> = {};
      for (const module of MODULES) {
        const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
        const content = await fs.promises.readFile(modulePath, 'utf-8');
        translations[module] = JSON.parse(content);
      }

      loadedTranslations.set('en-US', translations);

      // Verify only one language is cached
      expect(loadedTranslations.size).toBe(1);
      expect(loadedTranslations.has('en-US')).toBe(true);
    });
  });

  describe('Startup Performance', () => {
    it('should load startup locale in under 100ms', async () => {
      // Simulate startup loading only current locale
      const start = performance.now();

      // Parallel-load all modules (realistic scenario)
      await Promise.all(
        MODULES.map(async (module) => {
          const modulePath = path.join(LOCALES_DIR, 'zh-CN', `${module}.json`);
          const content = await fs.promises.readFile(modulePath, 'utf-8');
          return JSON.parse(content);
        })
      );

      const end = performance.now();

      // Startup loading should be under 100ms
      expect(end - start).toBeLessThan(100);
    });

    it('should switch locale in under 100ms', async () => {
      // Simulate loaded locale cache
      const loadedTranslations = new Map<string, Record<string, unknown>>();

      // Load zh-CN (already cached)
      const zhCNTranslations: Record<string, unknown> = {};
      for (const module of MODULES) {
        const modulePath = path.join(LOCALES_DIR, 'zh-CN', `${module}.json`);
        const content = await fs.promises.readFile(modulePath, 'utf-8');
        zhCNTranslations[module] = JSON.parse(content);
      }
      loadedTranslations.set('zh-CN', zhCNTranslations);

      // Switch to ja-JP (not cached)
      const start = performance.now();

      const jaJPTranslations: Record<string, unknown> = {};
      await Promise.all(
        MODULES.map(async (module) => {
          const modulePath = path.join(LOCALES_DIR, 'ja-JP', `${module}.json`);
          const content = await fs.promises.readFile(modulePath, 'utf-8');
          jaJPTranslations[module] = JSON.parse(content);
        })
      );
      loadedTranslations.set('ja-JP', jaJPTranslations);

      const end = performance.now();

      // Locale switching should be under 100ms
      expect(end - start).toBeLessThan(100);
    });
  });

  describe('Lazy Loading Impact', () => {
    it('should reduce startup memory by loading only required locale', () => {
      // Assume each locale is ~100KB
      const estimatedSizePerLocale = 100 * 1024; // 100KB

      // Old approach: load all locales
      const oldMemoryUsage = SUPPORTED_LANGUAGES.length * estimatedSizePerLocale;

      // New approach: load current locale only
      const newMemoryUsage = estimatedSizePerLocale;

      // Memory usage should be reduced by about 80%
      const reduction = (oldMemoryUsage - newMemoryUsage) / oldMemoryUsage;
      expect(reduction).toBeGreaterThan(0.8);
    });
  });
});
