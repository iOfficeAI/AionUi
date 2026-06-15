/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ==================== Library Item ====================

export interface ILibraryItemRow {
  id: string;
  name: string;
  file_path: string;
  file_type: string;
  source: string;
  favorite: number;
  shared: number;
  private: number;
  folder_id: string | null;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
  last_opened_at: number;
}

export interface ILibraryItem {
  id: string;
  name: string;
  filePath: string;
  fileType: string;
  source: string;
  favorite: boolean;
  shared: boolean;
  private: boolean;
  folderId: string | null;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface IAddLibraryItemParams {
  name: string;
  fileType: string;
  sourcePath?: string;
  content?: string;
  folderId?: string;
  parentId?: string;
}

/**
 * Filter tabs in the Library page.
 * - 'recents'   → sorted by last_opened_at
 * - 'favorites' → favorite = 1
 * - 'notes'     → file_type = 'markdown'
 * - 'images'    → file_type = 'image'
 * - 'video'     → file_type = 'video'
 * - 'pdfs'      → file_type = 'pdf'
 * - 'docs'      → file_type IN ('document','spreadsheet','presentation')
 * - 'others'    → any file_type not covered above
 */
export type LibraryFilter =
  | 'recents'
  | 'artifacts'
  | 'favorites'
  | 'notes'
  | 'images'
  | 'videos'
  | 'pdfs'
  | 'docs'
  | 'others';

export type LibraryFileType =
  | 'markdown'
  | 'pdf'
  | 'image'
  | 'video'
  | 'web'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'other'
  | string;

// ==================== Library Folder ====================

export interface ILibraryFolderRow {
  id: string;
  name: string;
  /** The LibraryFilter category this folder belongs to */
  category: string;
  created_at: number;
  updated_at: number;
}

export interface ILibraryFolder {
  id: string;
  name: string;
  category: LibraryFilter;
  createdAt: number;
  updatedAt: number;
}

// ==================== Converters ====================

export function rowToLibraryItem(row: ILibraryItemRow): ILibraryItem {
  return {
    id: row.id,
    name: row.name,
    filePath: row.file_path,
    fileType: row.file_type,
    source: row.source,
    favorite: row.favorite === 1,
    shared: row.shared === 1,
    private: row.private === 1,
    folderId: row.folder_id ?? null,
    parentId: row.parent_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  };
}

export function rowToLibraryFolder(row: ILibraryFolderRow): ILibraryFolder {
  return {
    id: row.id,
    name: row.name,
    category: row.category as LibraryFilter,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
