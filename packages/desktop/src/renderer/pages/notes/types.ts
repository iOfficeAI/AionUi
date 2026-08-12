/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type Notebook = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteItem = {
  id: string;
  title: string;
  /** Notebook **id** the note belongs to (nullable per backend NoteResponse). */
  notebookId?: string | null;
  /** Relative path of the note file, e.g. `notes/xxx.md`. */
  filePath: string;
  summary?: string;
  tags: string[];
  star: boolean;
  /** Full Markdown body — lazily fetched via the raw endpoint. */
  content?: string;
  createdAt: string;
  updatedAt: string;
};

export type TagItem = {
  name: string;
  count: number;
};
