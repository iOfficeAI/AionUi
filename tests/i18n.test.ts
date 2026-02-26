/**
 * i18n 单元测试
 */

import * as fs from 'fs';
import * as path from 'path';

// 测试常量 - 使用 __dirname 相对路径
const LOCALES_DIR = path.resolve(__dirname, '../src/renderer/i18n/locales');
const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'] as const;
const REQUIRED_MODULES = ['common', 'agentMode', 'update', 'login', 'fileSelection', 'preview', 'conversation', 'settings', 'messages', 'mcp', 'acp', 'codex', 'tools', 'gemini', 'cron', 'guid', 'agent'] as const;

// 辅助函数：递归获取所有键
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

describe('i18n 模块化结构测试', () => {
  describe('目录结构', () => {
    it('应该存在 locales 目录', () => {
      expect(fs.existsSync(LOCALES_DIR)).toBe(true);
    });

    it('每个支持的语言应该有对应的目录', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const langDir = path.join(LOCALES_DIR, lang);
        expect(fs.existsSync(langDir)).toBe(true);
      }
    });

    it('不应该存在旧的单一 JSON 文件', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const oldFile = path.join(LOCALES_DIR, `${lang}.json`);
        expect(fs.existsSync(oldFile)).toBe(false);
      }
    });
  });

  describe('模块文件完整性', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      describe(`${lang}`, () => {
        for (const module of REQUIRED_MODULES) {
          it(`应该有 ${module}.json 模块`, () => {
            const moduleFile = path.join(LOCALES_DIR, lang, `${module}.json`);
            expect(fs.existsSync(moduleFile)).toBe(true);
          });

          it(`${module}.json 应该是有效的 JSON`, () => {
            const moduleFile = path.join(LOCALES_DIR, lang, `${module}.json`);
            if (fs.existsSync(moduleFile)) {
              const content = fs.readFileSync(moduleFile, 'utf-8');
              expect(() => JSON.parse(content)).not.toThrow();
            }
          });
        }

        it('应该有 index.ts 索引文件', () => {
          const indexFile = path.join(LOCALES_DIR, lang, 'index.ts');
          expect(fs.existsSync(indexFile)).toBe(true);
        });
      });
    }
  });

  describe('翻译键一致性', () => {
    // 使用 en-US 作为参考
    const referenceLang = 'en-US';
    const referenceModules: Record<string, string[]> = {};

    beforeAll(() => {
      // 收集参考语言的所有键
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

      it(`${lang} 翻译覆盖率应该超过 70%`, () => {
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

        // 翻译覆盖率应该超过 70%
        const coverage = matchedKeys / totalReferenceKeys;
        expect(coverage).toBeGreaterThan(0.7);
      });
    }
  });
});

describe('i18n 配置测试', () => {
  it('index.ts 文件应该存在', () => {
    const indexFile = path.resolve(__dirname, '../src/renderer/i18n/index.ts');
    expect(fs.existsSync(indexFile)).toBe(true);
  });

  it('index.ts 应该包含支持的语言列表', () => {
    const indexFile = path.resolve(__dirname, '../src/renderer/i18n/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    expect(content).toContain('zh-CN');
    expect(content).toContain('en-US');
    expect(content).toContain('ja-JP');
  });

  it('index.ts 应该导出 changeLanguage 函数', () => {
    const indexFile = path.resolve(__dirname, '../src/renderer/i18n/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    expect(content).toContain('export async function changeLanguage');
  });
});
