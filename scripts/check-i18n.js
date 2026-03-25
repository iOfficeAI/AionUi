#!/usr/bin/env node
/**
 * i18n validation script
 * Used by pre-commit hooks to validate i18n translation completeness and consistency.
 *
 * Usage: node scripts/check-i18n.js
 */

const fs = require('fs');
const path = require('path');
const { REQUIRED_MODULES, collectReferenceKeys, getAllKeys } = require('./generate-i18n-types');
const i18nConfig = require('../src/common/config/i18n-config.json');

const LOCALES_DIR = path.resolve(__dirname, '../src/renderer/services/i18n/locales');
const I18N_KEYS_DTS = path.resolve(__dirname, '../src/renderer/services/i18n/i18n-keys.d.ts');
const RENDERER_DIR = path.resolve(__dirname, '../src/renderer');
const SUPPORTED_LANGUAGES = i18nConfig.supportedLanguages;
const REFERENCE_LANGUAGE = i18nConfig.referenceLanguage;

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

function extractTypeUnionValues(content, typeName) {
  const match = content.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`));
  if (!match) {
    return [];
  }

  const values = [];
  const valueRegex = /'([^']+)'/g;
  for (const item of match[1].matchAll(valueRegex)) {
    values.push(item[1]);
  }

  return values;
}

function isSameSet(a, b) {
  if (a.size !== b.size) {
    return false;
  }

  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }

  return true;
}

function checkI18nTypeDefinitionInSync() {
  console.log('\n🧩 Checking i18n key type definition sync...\n');

  if (!fs.existsSync(I18N_KEYS_DTS)) {
    logError(`Missing i18n key type file: ${path.relative(process.cwd(), I18N_KEYS_DTS)}`);
    logError('Run: vx node scripts/generate-i18n-types.js');
    return;
  }

  const actual = fs.readFileSync(I18N_KEYS_DTS, 'utf-8');
  const actualKeys = new Set(extractTypeUnionValues(actual, 'I18nKey'));
  const expectedKeys = new Set(collectReferenceKeys());

  if (!isSameSet(actualKeys, expectedKeys)) {
    logError(`Outdated i18n key type file: ${path.relative(process.cwd(), I18N_KEYS_DTS)}`);
    logError('Run: vx node scripts/generate-i18n-types.js');
    return;
  }

  const actualModules = new Set(extractTypeUnionValues(actual, 'I18nModule'));
  const expectedModules = new Set(REQUIRED_MODULES);
  if (!isSameSet(actualModules, expectedModules)) {
    logError(`Outdated i18n module type file: ${path.relative(process.cwd(), I18N_KEYS_DTS)}`);
    logError('Run: vx node scripts/generate-i18n-types.js');
    return;
  }

  logSuccess('i18n key type definition is in sync');
}

// Validate directory and file structure
function checkDirectoryStructure() {
  console.log('\n📁 Checking directory structure...\n');

  // Validate each locale directory
  for (const lang of SUPPORTED_LANGUAGES) {
    const langDir = path.join(LOCALES_DIR, lang);

    if (!fs.existsSync(langDir)) {
      logError(`Missing locale directory: ${lang}`);
      continue;
    }

    logSuccess(`Locale directory exists: ${lang}`);

    // Validate required module files
    for (const moduleName of REQUIRED_MODULES) {
      const moduleFile = path.join(langDir, `${moduleName}.json`);

      if (!fs.existsSync(moduleFile)) {
        logError(`Missing module file: ${lang}/${moduleName}.json`);
        continue;
      }

      // Validate JSON syntax
      try {
        const content = fs.readFileSync(moduleFile, 'utf-8');
        JSON.parse(content);
      } catch (error) {
        logError(`Invalid JSON: ${lang}/${moduleName}.json - ${error.message}`);
      }
    }

    // Validate index.ts
    const indexFile = path.join(langDir, 'index.ts');
    if (!fs.existsSync(indexFile)) {
      logWarning(`Missing index file: ${lang}/index.ts`);
    }
  }

  // Validate legacy single JSON files are removed
  for (const lang of SUPPORTED_LANGUAGES) {
    const oldFile = path.join(LOCALES_DIR, `${lang}.json`);
    if (fs.existsSync(oldFile)) {
      logError(`Found legacy JSON file, please remove: ${lang}.json`);
    }
  }
}

// Validate translation key consistency across locales
function checkTranslationKeys() {
  console.log('\n🔑 Checking translation key consistency...\n');

  const referenceLang = REFERENCE_LANGUAGE;
  const referenceKeys = {};

  // Collect baseline keys from reference locale
  for (const moduleName of REQUIRED_MODULES) {
    const moduleFile = path.join(LOCALES_DIR, referenceLang, `${moduleName}.json`);
    if (fs.existsSync(moduleFile)) {
      try {
        const content = JSON.parse(fs.readFileSync(moduleFile, 'utf-8'));
        referenceKeys[moduleName] = getAllKeys(content);
      } catch {
        logError(`Failed to read reference module: ${referenceLang}/${moduleName}.json`);
      }
    }
  }

  // Validate other locales against baseline
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === referenceLang) continue;

    logInfo(`Checking ${lang}...`);

    let missingCount = 0;

    for (const moduleName of REQUIRED_MODULES) {
      const moduleFile = path.join(LOCALES_DIR, lang, `${moduleName}.json`);
      const expectedKeys = referenceKeys[moduleName] || [];

      if (fs.existsSync(moduleFile)) {
        try {
          const content = JSON.parse(fs.readFileSync(moduleFile, 'utf-8'));
          const actualKeySet = new Set(getAllKeys(content));

          const missing = expectedKeys.filter((key) => !actualKeySet.has(key));
          missingCount += missing.length;

          if (missing.length > 0) {
            logWarning(
              `${lang}/${moduleName}.json is missing ${missing.length} keys: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`
            );
          }
        } catch {
          logError(`Failed to read module: ${lang}/${moduleName}.json`);
        }
      }
    }

    const totalKeys = Object.values(referenceKeys).flat().length;
    const missingPercent = totalKeys > 0 ? ((missingCount / totalKeys) * 100).toFixed(1) : '0.0';

    if (missingCount > 0) {
      logWarning(`${lang} is missing ${missingCount} keys (${missingPercent}%)`);
    } else {
      logSuccess(`${lang} translations are complete`);
    }
  }
}

function collectEmptyValuePaths(obj, prefix = '') {
  const emptyPaths = [];

  if (typeof obj !== 'object' || obj === null) {
    return emptyPaths;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null) {
      emptyPaths.push(...collectEmptyValuePaths(value, fullKey));
      continue;
    }

    if (typeof value === 'string' && value.trim() === '') {
      emptyPaths.push(fullKey);
    }
  }

  return emptyPaths;
}

// Validate empty translation modules and empty string values
function checkEmptyTranslations() {
  console.log('\n📭 Checking for empty translations...\n');

  for (const lang of SUPPORTED_LANGUAGES) {
    for (const moduleName of REQUIRED_MODULES) {
      const moduleFile = path.join(LOCALES_DIR, lang, `${moduleName}.json`);

      if (fs.existsSync(moduleFile)) {
        try {
          const content = fs.readFileSync(moduleFile, 'utf-8');
          const data = JSON.parse(content);

          if (Object.keys(data).length === 0) {
            logWarning(`Empty module: ${lang}/${moduleName}.json`);
            continue;
          }

          const emptyValuePaths = collectEmptyValuePaths(data);
          if (emptyValuePaths.length > 0) {
            logWarning(
              `${lang}/${moduleName}.json has ${emptyValuePaths.length} empty values: ${emptyValuePaths.slice(0, 3).join(', ')}${emptyValuePaths.length > 3 ? '...' : ''}`
            );
          }
        } catch {
          // Already reported by other checks
        }
      }
    }
  }
}

function collectAllCodeFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'i18n-keys.d.ts') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') {
        continue;
      }
      files.push(...collectAllCodeFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function buildReferenceKeySet() {
  const keySet = new Set();

  for (const moduleName of REQUIRED_MODULES) {
    const moduleFile = path.join(LOCALES_DIR, REFERENCE_LANGUAGE, `${moduleName}.json`);
    if (!fs.existsSync(moduleFile)) {
      continue;
    }

    const content = JSON.parse(fs.readFileSync(moduleFile, 'utf-8'));
    const keys = getAllKeys(content);
    for (const key of keys) {
      keySet.add(`${moduleName}.${key}`);
    }
  }

  return keySet;
}

function checkLiteralKeyUsages() {
  console.log('\n🧪 Checking literal t() key usages...\n');

  const referenceKeySet = buildReferenceKeySet();
  const files = collectAllCodeFiles(RENDERER_DIR);
  const keyRegex = /\b(?:i18n\.)?t\(\s*(['"`])([^'"`]+)\1/g;

  let invalidCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const code = stripComments(content);

    for (const match of code.matchAll(keyRegex)) {
      const key = match[2].trim();

      if (!key || key.includes('${') || key.startsWith('http://') || key.startsWith('https://')) {
        continue;
      }

      if (!key.includes('.')) {
        continue;
      }

      if (!referenceKeySet.has(key)) {
        invalidCount += 1;
        logWarning(`Unknown i18n key: ${key} (${path.relative(process.cwd(), file)})`);
      }
    }
  }

  if (invalidCount === 0) {
    logSuccess('No invalid literal i18n keys found in renderer code');
  } else {
    logInfo(`Found ${invalidCount} unknown literal i18n keys (warning only)`);
  }
}

// Validate i18n runtime config
function checkIndexConfig() {
  console.log('\n⚙️  Checking i18n configuration...\n');

  const indexFile = path.join(__dirname, '../src/renderer/services/i18n/index.ts');

  if (!fs.existsSync(indexFile)) {
    logError('Missing i18n config file: src/renderer/services/i18n/index.ts');
    return;
  }

  const content = fs.readFileSync(indexFile, 'utf-8');

  if (!content.includes('i18n-config.json')) {
    logError('i18n config should load shared constants from src/common/config/i18n-config.json');
  }

  if (!content.includes('export const supportedLanguages')) {
    logError('i18n config should export supportedLanguages');
  }

  // Ensure lazy loading support exists
  if (!content.includes('loadLocaleModules') && !content.includes('import(')) {
    logWarning('i18n config may not be using lazy loading');
  }

  logSuccess('i18n configuration check passed');
}

function main() {
  console.log('\n🔍 i18n validation started\n');
  console.log('========================================');

  checkDirectoryStructure();
  checkTranslationKeys();
  checkEmptyTranslations();
  checkLiteralKeyUsages();
  checkI18nTypeDefinitionInSync();
  checkIndexConfig();

  console.log('\n========================================');
  console.log('\n📊 Validation summary:\n');

  if (hasErrors) {
    console.log('❌ Validation failed. Please fix the issues before committing.');
    process.exit(1);
  }

  if (hasWarnings) {
    console.log('⚠️  Warnings found.');
  }

  console.log('✅ i18n validation passed\n');
  process.exit(0);
}

main();
