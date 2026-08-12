/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromApiNote,
  fromApiNoteList,
  fromApiNotebook,
  fromApiTag,
  fromApiTagList,
} from '@/common/adapter/notebookMapper';

describe('notebookMapper', () => {
  describe('fromApiNotebook', () => {
    it('converts snake_case fields to camelCase and timestamps to ISO strings', () => {
      const notebook = fromApiNotebook({
        id: 'nb_123',
        name: 'Travel',
        description: 'Trip planning',
        created_at: 1700000000000,
        updated_at: 1700000060000,
      });

      expect(notebook).toEqual({
        id: 'nb_123',
        name: 'Travel',
        description: 'Trip planning',
        createdAt: new Date(1700000000000).toISOString(),
        updatedAt: new Date(1700000060000).toISOString(),
      });
    });

    it('defaults missing description to an empty string', () => {
      const notebook = fromApiNotebook({
        id: 'nb_456',
        name: 'Untitled',
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });

      expect(notebook.description).toBe('');
    });
  });

  describe('fromApiNote', () => {
    it('maps snake_case fields and timestamps onto the note shape', () => {
      const note = fromApiNote({
        id: 'nt_123',
        title: 'Tokyo itinerary',
        notebook_id: 'nb_abc',
        file_path: 'notes/abc.md',
        summary: 'Five-day draft',
        tags: ['travel', 'draft'],
        star: true,
        created_at: 1700000000000,
        updated_at: 1700000060000,
      });

      expect(note).toEqual({
        id: 'nt_123',
        title: 'Tokyo itinerary',
        notebookId: 'nb_abc',
        filePath: 'notes/abc.md',
        summary: 'Five-day draft',
        tags: ['travel', 'draft'],
        star: true,
        createdAt: new Date(1700000000000).toISOString(),
        updatedAt: new Date(1700000060000).toISOString(),
      });
    });

    it('normalizes a missing notebook_id to null and star to boolean', () => {
      const note = fromApiNote({
        id: 'nt_456',
        title: 'Standalone',
        file_path: 'notes/def.md',
        tags: [],
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });

      expect(note.notebookId).toBeNull();
      expect(note.star).toBe(false);
      expect(note.content).toBeUndefined();
    });
  });

  describe('fromApiNoteList', () => {
    it('returns an empty array when the input list is empty', () => {
      expect(fromApiNoteList([])).toEqual([]);
    });

    it('maps every element of a non-empty list', () => {
      const list = fromApiNoteList([
        {
          id: 'nt_1',
          title: 'A',
          notebook_id: 'nb_1',
          file_path: 'notes/a.md',
          tags: [],
          star: false,
          created_at: 1700000000000,
          updated_at: 1700000000000,
        },
        {
          id: 'nt_2',
          title: 'B',
          file_path: 'notes/b.md',
          tags: ['draft'],
          star: true,
          created_at: 1700000001000,
          updated_at: 1700000001000,
        },
      ]);

      expect(list).toHaveLength(2);
      expect(list[0].notebookId).toBe('nb_1');
      expect(list[1].title).toBe('B');
      expect(list[1].tags).toEqual(['draft']);
      expect(list[1].star).toBe(true);
    });
  });

  describe('fromApiTag', () => {
    it('keeps name and count as-is', () => {
      expect(fromApiTag({ name: '旅行', count: 12 })).toEqual({ name: '旅行', count: 12 });
    });
  });

  describe('fromApiTagList', () => {
    it('maps every element of the tag list', () => {
      const list = fromApiTagList([
        { name: '旅行', count: 12 },
        { name: '草稿', count: 3 },
      ]);
      expect(list).toEqual([
        { name: '旅行', count: 12 },
        { name: '草稿', count: 3 },
      ]);
    });

    it('returns an empty array when the input list is empty', () => {
      expect(fromApiTagList([])).toEqual([]);
    });
  });
});
