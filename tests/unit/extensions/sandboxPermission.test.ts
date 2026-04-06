import { describe, expect, it } from 'vitest';
import {
  getSandboxPermissionDeniedError,
  hasSandboxStoragePermission,
} from '../../../src/process/extensions/sandbox/permissions';

describe('extensions/sandbox permissions', () => {
  it('treats omitted permissions as no storage access', () => {
    expect(hasSandboxStoragePermission(undefined)).toBe(false);
  });

  it('treats storage permission false as no storage access', () => {
    expect(hasSandboxStoragePermission({ storage: false, events: true })).toBe(false);
  });

  it('treats storage permission true as storage access enabled', () => {
    expect(hasSandboxStoragePermission({ storage: true, events: true })).toBe(true);
  });

  it('returns a permission error for storage api calls without storage permission', () => {
    expect(getSandboxPermissionDeniedError('storage.get', undefined)).toBe(
      'Permission denied: storage access requires "storage: true" in manifest'
    );
  });

  it('does not return a permission error for non-storage api calls without storage permission', () => {
    expect(getSandboxPermissionDeniedError('custom.method', undefined)).toBeNull();
  });

  it('does not return a permission error for storage api calls when storage permission is granted', () => {
    expect(getSandboxPermissionDeniedError('storage.get', { storage: true, events: true })).toBeNull();
  });
});
