import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const localeDir = path.join(process.cwd(), 'packages/desktop/src/renderer/services/i18n/locales');
const legacyImportHelpKeys = [
  'importHelp',
  'importHelpSourceLabel',
  'importHelpSourceText',
  'importHelpFormatLabel',
  'importHelpFormatText',
  'importHelpSizeLabel',
  'importHelpSizeText',
  'importHelpBatchLabel',
  'importHelpBatchText',
  'importHelpDuplicateLabel',
  'importHelpDuplicateText',
];
const legacyImportHistorySummaryKeys = [
  'importHistoryLimit',
  'importHistoryPartial',
  'importHistorySuccess',
  'importHistoryFileTooLargeDetail',
  'importHistorySizeDetail',
];
const requiredSkillImportKeys = [
  'importPartialSuccess',
  'importAllFailed',
  'importFailureFileSizeDetail',
  'importFailureTotalSizeDetail',
  'importFailureLocationDetail',
  'importHistoryTitle',
  'importHistoryEmpty',
  'importHelpCompactLabel',
  'importHelpConfiguredLimit',
  'importHelpCompactText',
  'importHistoryDescription',
  'backToSkills',
  'importHistoryStatusPartial',
  'importHistoryStatusFailed',
  'importHistoryStatusOverwritten',
  'importHistoryStatusSuccess',
  'importHistoryRepairFileTooLarge',
  'importHistoryRepairTotalTooLarge',
  'importHistoryRepairFrontmatter',
  'importHistoryRepairNoSkillFound',
  'importHistoryRepairInvalidSource',
  'importHistoryRepairInvalidZip',
  'importHistoryRepairSymlinkEntry',
  'importHistoryRepairInvalidName',
  'importHistoryRepairFailed',
  'importHistoryFileTooLargeDescription',
  'importHistoryTotalTooLargeDescription',
  'importHistoryFrontmatterDescription',
  'importHistoryNoSkillFoundDescription',
  'importHistoryInvalidSourceDescription',
  'importHistoryInvalidZipDescription',
  'importHistorySymlinkEntryDescription',
  'importHistoryInvalidNameDescription',
  'importHistoryFailedDescription',
  'importHistoryFileLine',
  'importHistorySizeLine',
  'importHistoryLocationLine',
  'importHistorySourceLine',
];
const requiredSkillImportErrorCodes = [
  'SKILL_INVALID_FRONTMATTER',
  'SKILL_IMPORT_NO_SKILL_FOUND',
  'SKILL_IMPORT_INVALID_SOURCE',
  'SKILL_IMPORT_SYMLINK_ENTRY',
  'SKILL_IMPORT_FILE_TOO_LARGE',
  'SKILL_IMPORT_TOTAL_TOO_LARGE',
  'SKILL_IMPORT_INVALID_ZIP',
  'SKILL_IMPORT_INVALID_NAME',
  'SKILL_IMPORT_FAILED',
];

describe('skill import locale copy', () => {
  const localeFiles = fs
    .readdirSync(localeDir)
    .map((locale) => path.join(localeDir, locale, 'settings.json'))
    .filter((file) => fs.existsSync(file));

  it('does not hardcode server-owned skill import size limits', () => {
    for (const file of localeFiles) {
      const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
      const copy = JSON.stringify(settings.skillsHub);
      expect(copy, file).not.toMatch(/\b10\s*MB\b/i);
      expect(copy, file).not.toMatch(/\b50\s*MB\b/i);
    }
  });

  it('does not keep unused expanded import help copy', () => {
    for (const file of localeFiles) {
      const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of legacyImportHelpKeys) {
        expect(settings.skillsHub, `${file}:${key}`).not.toHaveProperty(key);
      }
    }
  });

  it('does not keep unused import history summary copy', () => {
    for (const file of localeFiles) {
      const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of legacyImportHistorySummaryKeys) {
        expect(settings.skillsHub, `${file}:${key}`).not.toHaveProperty(key);
      }
    }
  });

  it('defines every active skill import key for every locale', () => {
    for (const file of localeFiles) {
      const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of requiredSkillImportKeys) {
        expect(settings.skillsHub, `${file}:${key}`).toHaveProperty(key);
      }
      for (const code of requiredSkillImportErrorCodes) {
        expect(settings.skillsHub.importErrors, `${file}:importErrors.${code}`).toHaveProperty(code);
      }
    }
  });
});
