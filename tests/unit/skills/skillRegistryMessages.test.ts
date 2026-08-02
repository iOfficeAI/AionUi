import { BackendHttpError } from '@/common/adapter/httpBridge';
import {
  getSkillRegistryConflictName,
  getSkillRegistryErrorMessage,
} from '@/renderer/pages/settings/SkillsSettings/skillRegistryMessages';
import { describe, expect, it } from 'vitest';

const translate = ((key: string) => key) as never;

const backendError = (code: string, details?: unknown) =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/skill-registry/installations',
    status: 409,
    body: { code, error: 'safe fixture error', details },
  });

describe('skill registry error messages', () => {
  it('maps integrity and concurrency errors to stable localized keys', () => {
    expect(getSkillRegistryErrorMessage(backendError('SKILL_REGISTRY_HASH_MISMATCH'), translate)).toBe(
      'settings.skillsHub.officialOnline.errorHashMismatch'
    );
    expect(getSkillRegistryErrorMessage(backendError('SKILL_REGISTRY_OPERATION_IN_PROGRESS'), translate)).toBe(
      'settings.skillsHub.officialOnline.errorOperationInProgress'
    );
  });

  it('extracts the conflicting local skill name without parsing the message', () => {
    expect(
      getSkillRegistryConflictName(backendError('SKILL_REGISTRY_NAME_CONFLICT', { skill_name: 'existing-skill' }))
    ).toBe('existing-skill');
    expect(getSkillRegistryConflictName(new Error('plain failure'))).toBeUndefined();
  });
});
