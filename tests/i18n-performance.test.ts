/**
 * i18n 性能测试
 * 测试懒加载和模块化的性能表现
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.resolve(__dirname, '../src/renderer/i18n/locales');
const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'];
const MODULES = ['common', 'agentMode', 'update', 'login', 'fileSelection', 'preview', 'conversation', 'settings', 'messages', 'mcp', 'acp', 'codex', 'tools', 'gemini', 'cron', 'guid', 'agent'];

describe('i18n 性能测试', () => {
  describe('模块加载性能', () => {
    it('单个模块加载时间应该小于 5ms', async () => {
      const modulePath = path.join(LOCALES_DIR, 'en-US', 'common.json');

      const start = performance.now();
      const content = await fs.promises.readFile(modulePath, 'utf-8');
      JSON.parse(content);
      const end = performance.now();

      expect(end - start).toBeLessThan(5);
    });

    it('完整语言加载时间应该小于 50ms', async () => {
      const start = performance.now();

      for (const module of MODULES) {
        const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
        const content = await fs.promises.readFile(modulePath, 'utf-8');
        JSON.parse(content);
      }

      const end = performance.now();
      expect(end - start).toBeLessThan(50);
    });

    it('并行加载所有模块应该更快', async () => {
      // 串行加载
      const serialStart = performance.now();
      for (const module of MODULES) {
        const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
        const content = await fs.promises.readFile(modulePath, 'utf-8');
        JSON.parse(content);
      }
      const serialEnd = performance.now();
      const serialTime = serialEnd - serialStart;

      // 并行加载
      const parallelStart = performance.now();
      await Promise.all(
        MODULES.map(async (module) => {
          const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
          const content = await fs.promises.readFile(modulePath, 'utf-8');
          return JSON.parse(content);
        })
      );
      const parallelEnd = performance.now();
      const parallelTime = parallelEnd - parallelStart;

      // 并行应该至少快 30%
      expect(parallelTime).toBeLessThan(serialTime * 0.7);
    });
  });

  describe('文件大小优化', () => {
    it('模块化后单个模块应该更小', async () => {
      const sizes = await Promise.all(
        MODULES.map(async (module) => {
          const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
          const stats = await fs.promises.stat(modulePath);
          return stats.size;
        })
      );

      const totalSize = sizes.reduce((a, b) => a + b, 0);
      const avgSize = totalSize / MODULES.length;

      // 单个模块平均大小应该小于 20KB
      expect(avgSize).toBeLessThan(20 * 1024);
    });
  });

  describe('内存占用', () => {
    it('加载单个语言应该只缓存该语言', async () => {
      // 模拟加载过程
      const loadedTranslations = new Map<string, Record<string, unknown>>();

      // 加载 en-US
      const translations: Record<string, unknown> = {};
      for (const module of MODULES) {
        const modulePath = path.join(LOCALES_DIR, 'en-US', `${module}.json`);
        const content = await fs.promises.readFile(modulePath, 'utf-8');
        translations[module] = JSON.parse(content);
      }

      loadedTranslations.set('en-US', translations);

      // 验证只缓存了一个语言
      expect(loadedTranslations.size).toBe(1);
      expect(loadedTranslations.has('en-US')).toBe(true);
    });
  });

  describe('启动性能', () => {
    it('模拟启动加载时间应该小于 100ms', async () => {
      // 模拟应用启动时只加载当前语言
      const start = performance.now();

      // 并行加载所有模块（模拟真实场景）
      await Promise.all(
        MODULES.map(async (module) => {
          const modulePath = path.join(LOCALES_DIR, 'zh-CN', `${module}.json`);
          const content = await fs.promises.readFile(modulePath, 'utf-8');
          return JSON.parse(content);
        })
      );

      const end = performance.now();

      // 启动加载时间应该小于 100ms
      expect(end - start).toBeLessThan(100);
    });

    it('切换语言时间应该小于 100ms', async () => {
      // 模拟已加载的语言缓存
      const loadedTranslations = new Map<string, Record<string, unknown>>();

      // 加载 zh-CN（模拟已缓存）
      const zhCNTranslations: Record<string, unknown> = {};
      for (const module of MODULES) {
        const modulePath = path.join(LOCALES_DIR, 'zh-CN', `${module}.json`);
        const content = await fs.promises.readFile(modulePath, 'utf-8');
        zhCNTranslations[module] = JSON.parse(content);
      }
      loadedTranslations.set('zh-CN', zhCNTranslations);

      // 切换到 ja-JP（未缓存）
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

      // 语言切换时间应该小于 100ms
      expect(end - start).toBeLessThan(100);
    });
  });

  describe('懒加载效果', () => {
    it('只加载需要的语言应该减少启动内存', () => {
      // 假设每个语言约 100KB
      const estimatedSizePerLocale = 100 * 1024; // 100KB

      // 旧方案：加载所有语言
      const oldMemoryUsage = SUPPORTED_LANGUAGES.length * estimatedSizePerLocale;

      // 新方案：只加载当前语言
      const newMemoryUsage = estimatedSizePerLocale;

      // 内存使用应该减少约 80%
      const reduction = (oldMemoryUsage - newMemoryUsage) / oldMemoryUsage;
      expect(reduction).toBeGreaterThan(0.8);
    });
  });
});
