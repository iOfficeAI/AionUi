import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { TFunction } from 'i18next';

type SkillImportFailure = {
  source_name: string;
  code: string;
  error_path?: string;
  actual_bytes?: number;
  limit_bytes?: number;
  line?: number;
  column?: number;
};

type SkillImportResult = {
  skill_name?: string;
  skill_names?: string[];
  failed?: SkillImportFailure[];
};

type SkillImportNotice = {
  type: 'success' | 'warning' | 'error';
  message: string;
  importedNames: string[];
};

const SKILL_IMPORT_ERROR_CODES = new Set([
  'SKILL_INVALID_FRONTMATTER',
  'SKILL_IMPORT_NO_SKILL_FOUND',
  'SKILL_IMPORT_INVALID_SOURCE',
  'SKILL_IMPORT_SYMLINK_ENTRY',
  'SKILL_IMPORT_FILE_TOO_LARGE',
  'SKILL_IMPORT_TOTAL_TOO_LARGE',
  'SKILL_IMPORT_INVALID_ZIP',
  'SKILL_IMPORT_INVALID_NAME',
  'SKILL_IMPORT_FAILED',
]);

const getImportedNames = (result: SkillImportResult): string[] =>
  result.skill_names?.length ? result.skill_names : result.skill_name ? [result.skill_name] : [];

const getSkillImportCodeMessage = (code: string, t: TFunction): string =>
  SKILL_IMPORT_ERROR_CODES.has(code)
    ? t(`settings.skillsHub.importErrors.${code}`, {
        defaultValue: t('settings.skillsHub.importError', { defaultValue: 'Error importing skill' }),
      })
    : t('settings.skillsHub.importError', { defaultValue: 'Error importing skill' });

const formatBytes = (bytes?: number): string | null => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
};

const getFailureDetailMessage = (failure: SkillImportFailure, t: TFunction): string => {
  if (failure.code === 'SKILL_IMPORT_FILE_TOO_LARGE') {
    const actual = formatBytes(failure.actual_bytes);
    const limit = formatBytes(failure.limit_bytes);
    if (failure.error_path && actual && limit) {
      return t('settings.skillsHub.importFailureFileSizeDetail', {
        path: failure.error_path,
        actual,
        limit,
        defaultValue: `${failure.error_path} is ${actual}; limit is ${limit}`,
      });
    }
  }
  if (failure.code === 'SKILL_IMPORT_TOTAL_TOO_LARGE') {
    const actual = formatBytes(failure.actual_bytes);
    const limit = formatBytes(failure.limit_bytes);
    if (actual && limit) {
      return t('settings.skillsHub.importFailureTotalSizeDetail', {
        actual,
        limit,
        defaultValue: `Total size is ${actual}; limit is ${limit}`,
      });
    }
  }
  if (failure.line || failure.column) {
    return t('settings.skillsHub.importFailureLocationDetail', {
      line: failure.line ?? '-',
      column: failure.column ?? '-',
      defaultValue: `Line ${failure.line ?? '-'}, column ${failure.column ?? '-'}`,
    });
  }
  return '';
};

const formatFailures = (failures: SkillImportFailure[], t: TFunction): string =>
  failures
    .map((failure) => {
      const detail = getFailureDetailMessage(failure, t);
      const message = getSkillImportCodeMessage(failure.code, t);
      return detail ? `${failure.source_name}: ${message} (${detail})` : `${failure.source_name}: ${message}`;
    })
    .join('; ');

export const getSkillImportErrorMessage = (error: unknown, t: TFunction): string => {
  if (isBackendHttpError(error) && error.code) {
    return getSkillImportCodeMessage(error.code, t);
  }
  return t('settings.skillsHub.importError', { defaultValue: 'Error importing skill' });
};

export const buildSkillImportNotice = (result: SkillImportResult, t: TFunction): SkillImportNotice => {
  const importedNames = getImportedNames(result);
  const failures = result.failed ?? [];

  if (failures.length > 0 && importedNames.length > 0) {
    return {
      type: 'warning',
      importedNames,
      message: t('settings.skillsHub.importPartialSuccess', {
        successCount: importedNames.length,
        failureCount: failures.length,
        failures: formatFailures(failures, t),
        defaultValue: `Imported ${importedNames.length} skill(s), ${failures.length} failed: ${formatFailures(failures, t)}`,
      }),
    };
  }

  if (failures.length > 0) {
    return {
      type: 'error',
      importedNames,
      message: t('settings.skillsHub.importAllFailed', {
        failureCount: failures.length,
        failures: formatFailures(failures, t),
        defaultValue: `Failed to import ${failures.length} skill(s): ${formatFailures(failures, t)}`,
      }),
    };
  }

  const names = importedNames.join(', ');
  return {
    type: 'success',
    importedNames,
    message: t('settings.skillsHub.importSuccessDetailed', {
      count: importedNames.length,
      names,
      defaultValue:
        importedNames.length > 1 ? `Imported ${importedNames.length} skills: ${names}` : `Imported skill: ${names}`,
    }),
  };
};
