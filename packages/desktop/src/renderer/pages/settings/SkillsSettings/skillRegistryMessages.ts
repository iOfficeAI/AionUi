import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { TFunction } from 'i18next';

export const getSkillRegistryErrorMessage = (error: unknown, t: TFunction): string => {
  if (!isBackendHttpError(error)) return t('settings.skillsHub.officialOnline.operationFailed');
  switch (error.code) {
    case 'SKILL_REGISTRY_UNAVAILABLE':
      return t('settings.skillsHub.officialOnline.errorUnavailable');
    case 'SKILL_REGISTRY_VERSION_NOT_FOUND':
      return t('settings.skillsHub.officialOnline.errorVersionNotFound');
    case 'SKILL_REGISTRY_PACKAGE_INVALID':
      return t('settings.skillsHub.officialOnline.errorPackageInvalid');
    case 'SKILL_REGISTRY_HASH_MISMATCH':
      return t('settings.skillsHub.officialOnline.errorHashMismatch');
    case 'SKILL_REGISTRY_OPERATION_IN_PROGRESS':
      return t('settings.skillsHub.officialOnline.errorOperationInProgress');
    default:
      return t('settings.skillsHub.officialOnline.operationFailed');
  }
};

export const getSkillRegistryConflictName = (error: unknown): string | undefined => {
  if (!isBackendHttpError(error) || error.code !== 'SKILL_REGISTRY_NAME_CONFLICT') return undefined;
  return error.details && typeof error.details === 'object' && 'skill_name' in error.details
    ? String(error.details.skill_name)
    : undefined;
};
