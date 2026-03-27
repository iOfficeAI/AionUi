import { describe, expect, it } from 'vitest';

import { mergeFileChange } from '@/common/types/fileSnapshot';
import type { FileChangeEvent, FileChangeRecord } from '@/common/types/fileSnapshot';

function makeEvent(overrides: Partial<FileChangeEvent> = {}): FileChangeEvent {
  return {
    workspace: '/workspace',
    filePath: '/workspace/src/file.ts',
    relativePath: 'src/file.ts',
    operation: 'create',
    before: null,
    after: 'content',
    timestamp: 1000,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<FileChangeRecord> = {}): FileChangeRecord {
  return {
    filePath: '/workspace/src/file.ts',
    relativePath: 'src/file.ts',
    operation: 'create',
    before: null,
    after: 'content',
    timestamp: 1000,
    ...overrides,
  };
}

describe('mergeFileChange', () => {
  describe('no existing record', () => {
    it('should create a record from a create event', () => {
      const event = makeEvent({ operation: 'create', before: null, after: 'new file' });
      const result = mergeFileChange(undefined, event);

      expect(result).toEqual({
        filePath: event.filePath,
        relativePath: event.relativePath,
        operation: 'create',
        before: null,
        after: 'new file',
        timestamp: event.timestamp,
      });
    });

    it('should create a record from a modify event', () => {
      const event = makeEvent({ operation: 'modify', before: 'old', after: 'new' });
      const result = mergeFileChange(undefined, event);

      expect(result).toEqual({
        filePath: event.filePath,
        relativePath: event.relativePath,
        operation: 'modify',
        before: 'old',
        after: 'new',
        timestamp: event.timestamp,
      });
    });

    it('should create a record from a delete event', () => {
      const event = makeEvent({ operation: 'delete', before: 'old content', after: null });
      const result = mergeFileChange(undefined, event);

      expect(result).toEqual({
        filePath: event.filePath,
        relativePath: event.relativePath,
        operation: 'delete',
        before: 'old content',
        after: null,
        timestamp: event.timestamp,
      });
    });
  });

  describe('create + subsequent events', () => {
    it('create + modify → create with updated after', () => {
      const existing = makeRecord({ operation: 'create', before: null, after: 'v1' });
      const event = makeEvent({
        operation: 'modify',
        before: 'v1',
        after: 'v2',
        timestamp: 2000,
      });

      const result = mergeFileChange(existing, event);

      expect(result).toEqual({
        filePath: existing.filePath,
        relativePath: existing.relativePath,
        operation: 'create',
        before: null,
        after: 'v2',
        timestamp: 2000,
      });
    });

    it('create + delete → null (net effect is nothing)', () => {
      const existing = makeRecord({ operation: 'create', before: null, after: 'content' });
      const event = makeEvent({
        operation: 'delete',
        before: 'content',
        after: null,
        timestamp: 2000,
      });

      const result = mergeFileChange(existing, event);

      expect(result).toBeNull();
    });
  });

  describe('modify + subsequent events', () => {
    it('modify + modify → modify with original before and updated after', () => {
      const existing = makeRecord({
        operation: 'modify',
        before: 'original',
        after: 'v1',
        timestamp: 1000,
      });
      const event = makeEvent({
        operation: 'modify',
        before: 'v1',
        after: 'v2',
        timestamp: 2000,
      });

      const result = mergeFileChange(existing, event);

      expect(result).toEqual({
        filePath: existing.filePath,
        relativePath: existing.relativePath,
        operation: 'modify',
        before: 'original',
        after: 'v2',
        timestamp: 2000,
      });
    });

    it('modify + delete → delete with original before', () => {
      const existing = makeRecord({
        operation: 'modify',
        before: 'original',
        after: 'modified',
        timestamp: 1000,
      });
      const event = makeEvent({
        operation: 'delete',
        before: 'modified',
        after: null,
        timestamp: 2000,
      });

      const result = mergeFileChange(existing, event);

      expect(result).toEqual({
        filePath: existing.filePath,
        relativePath: existing.relativePath,
        operation: 'delete',
        before: 'original',
        after: null,
        timestamp: 2000,
      });
    });
  });

  describe('delete + subsequent events', () => {
    it('delete + create → modify with original before and new after', () => {
      const existing = makeRecord({
        operation: 'delete',
        before: 'original content',
        after: null,
        timestamp: 1000,
      });
      const event = makeEvent({
        operation: 'create',
        before: null,
        after: 'recreated content',
        timestamp: 2000,
      });

      const result = mergeFileChange(existing, event);

      expect(result).toEqual({
        filePath: existing.filePath,
        relativePath: existing.relativePath,
        operation: 'modify',
        before: 'original content',
        after: 'recreated content',
        timestamp: 2000,
      });
    });
  });

  describe('timestamp handling', () => {
    it('should always use the latest event timestamp', () => {
      const existing = makeRecord({ timestamp: 1000 });
      const event = makeEvent({ operation: 'modify', before: 'v1', after: 'v2', timestamp: 5000 });

      const result = mergeFileChange(existing, event);

      expect(result?.timestamp).toBe(5000);
    });
  });
});
