#!/usr/bin/env node
/**
 * i18n 检查脚本
 * 用于 pre-commit 钩子，检查 i18n 翻译文件的完整性和一致性
 *
 * 用法: node scripts/check-i18n.js
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../src/renderer/i18n/locales');
const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'ko-KR', 'tr-TR'];
const REQUIRED_MODULES = [
  'common',
  'agentMode',
  'update',
  'login',
  'fileSelection',
  'preview',
  'conversation',
  'settings',
  'messages',
  'mcp',
  'acp',
  'codex',
  'tools',
  'gemini',
  'cron',
  'guid',
  'agent',
];

let hasErrors = false;
let hasWarnings = false;

function logError(message) {
  console.error(`❌ ${message}`);
  hasErrors = true;
}

function logWarning(message) {
  console.warn(`⚠️  ${message}`);
  hasWarnings = true;
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

// 检查目录结构
function checkDirectoryStructure() {
  console.log('\n📁 检查目录结构...\n');

  // 检查每个语言的目录
  for (const lang of SUPPORTED_LANGUAGES) {
    const langDir = path.join(LOCALES_DIR, lang);

    if (!fs.existsSync(langDir)) {
      logError(`缺少语言目录: ${lang}`);
      continue;
    }

    logSuccess(`语言目录存在: ${lang}`);

    // 检查模块文件
    for (const module of REQUIRED_MODULES) {
      const moduleFile = path.join(langDir, `${module}.json`);

      if (!fs.existsSync(moduleFile)) {
        logError(`缺少模块文件: ${lang}/${module}.json`);
        continue;
      }

      // 检查 JSON 有效性
      try {
        const content = fs.readFileSync(moduleFile, 'utf-8');
        JSON.parse(content);
      } catch (e) {
        logError(`无效的 JSON: ${lang}/${module}.json - ${e.message}`);
      }
    }

    // 检查 index.ts
    const indexFile = path.join(langDir, 'index.ts');
    if (!fs.existsSync(indexFile)) {
      logWarning(`缺少索引文件: ${lang}/index.ts`);
    }
  }

  // 检查不应该存在的旧 JSON 文件
  for (const lang of SUPPORTED_LANGUAGES) {
    const oldFile = path.join(LOCALES_DIR, `${lang}.json`);
    if (fs.existsSync(oldFile)) {
      logError(`发现旧的 JSON 文件，请删除: ${lang}.json`);
    }
  }
}

// 检查翻译键一致性
function checkTranslationKeys() {
  console.log('\n🔑 检查翻译键一致性...\n');

  const referenceLang = 'en-US';
  const referenceKeys = {};

  // 收集参考语言的键
  for (const module of REQUIRED_MODULES) {
    const moduleFile = path.join(LOCALES_DIR, referenceLang, `${module}.json`);
    if (fs.existsSync(moduleFile)) {
      try {
        const content = JSON.parse(fs.readFileSync(moduleFile, 'utf-8'));
        referenceKeys[module] = getAllKeys(content);
      } catch (e) {
        logError(`无法读取参考模块: ${referenceLang}/${module}.json`);
      }
    }
  }

  // 检查其他语言
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === referenceLang) continue;

    logInfo(`检查 ${lang}...`);

    let missingCount = 0;
    let extraCount = 0;

    for (const module of REQUIRED_MODULES) {
      const moduleFile = path.join(LOCALES_DIR, lang, `${module}.json`);
      const expectedKeys = referenceKeys[module] || [];

      if (fs.existsSync(moduleFile)) {
        try {
          const content = JSON.parse(fs.readFileSync(moduleFile, 'utf-8'));
          const actualKeys = getAllKeys(content);

          // 找出缺失的键
          const missing = expectedKeys.filter((k) => !actualKeys.includes(k));
          missingCount += missing.length;

          // 找出多余的键
          const extra = actualKeys.filter((k) => !expectedKeys.includes(k));
          extraCount += extra.length;

          if (missing.length > 0) {
            logWarning(
              `${lang}/${module}.json 缺少 ${missing.length} 个键: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`
            );
          }
        } catch (e) {
          logError(`无法读取模块: ${lang}/${module}.json`);
        }
      }
    }

    const totalKeys = Object.values(referenceKeys).flat().length;
    const missingPercent = ((missingCount / totalKeys) * 100).toFixed(1);

    if (missingCount > 0) {
      logWarning(`${lang} 缺少 ${missingCount} 个键 (${missingPercent}%)`);
    } else {
      logSuccess(`${lang} 翻译完整`);
    }
  }
}

// 检查空翻译
function checkEmptyTranslations() {
  console.log('\n📭 检查空翻译...\n');

  for (const lang of SUPPORTED_LANGUAGES) {
    for (const module of REQUIRED_MODULES) {
      const moduleFile = path.join(LOCALES_DIR, lang, `${module}.json`);

      if (fs.existsSync(moduleFile)) {
        try {
          const content = fs.readFileSync(moduleFile, 'utf-8');
          const data = JSON.parse(content);

          if (Object.keys(data).length === 0) {
            logWarning(`空模块: ${lang}/${module}.json`);
          }
        } catch (e) {
          // 已在其他地方报告
        }
      }
    }
  }
}

// 检查 index.ts 配置
function checkIndexConfig() {
  console.log('\n⚙️  检查 i18n 配置...\n');

  const indexFile = path.join(__dirname, '../src/renderer/i18n/index.ts');

  if (!fs.existsSync(indexFile)) {
    logError('缺少 i18n 配置文件: src/renderer/i18n/index.ts');
    return;
  }

  const content = fs.readFileSync(indexFile, 'utf-8');

  // 检查是否包含所有支持的语言
  for (const lang of SUPPORTED_LANGUAGES) {
    if (!content.includes(`'${lang}'`) && !content.includes(`"${lang}"`)) {
      logError(`i18n 配置缺少语言: ${lang}`);
    }
  }

  // 检查是否有懒加载支持
  if (!content.includes('loadLocaleModules') && !content.includes('import(')) {
    logWarning('i18n 配置可能未使用懒加载');
  }

  logSuccess('i18n 配置检查通过');
}

// 辅助函数：递归获取所有键
function getAllKeys(obj, prefix = '') {
  const keys = [];

  if (typeof obj !== 'object' || obj === null) {
    return keys;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

// 主函数
function main() {
  console.log('\n🔍 i18n 检查开始\n');
  console.log('========================================');

  checkDirectoryStructure();
  checkTranslationKeys();
  checkEmptyTranslations();
  checkIndexConfig();

  console.log('\n========================================');
  console.log('\n📊 检查结果:\n');

  if (hasErrors) {
    console.log('❌ 发现错误，请修复后再提交');
    process.exit(1);
  }

  if (hasWarnings) {
    console.log('⚠️  有警告，但不影响提交');
  }

  console.log('✅ i18n 检查通过\n');
  process.exit(0);
}

main();
