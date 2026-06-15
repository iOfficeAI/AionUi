/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell } from 'electron';
import { ipcBridge } from '@/common';
import { getDatabase } from '@process/services/database';
import { ensureDirectory, getDataPath } from '@process/utils';
import type {
  ILibraryItem,
  ILibraryItemRow,
  ILibraryFolderRow,
  IAddLibraryItemParams,
  LibraryFilter,
} from '@/common/types/library';
import { rowToLibraryItem, rowToLibraryFolder } from '@/common/types/library';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Get the Library file storage directory
 */
function getLibraryDir(): string {
  const libraryDir = path.join(getDataPath(), 'library');
  ensureDirectory(libraryDir);
  return libraryDir;
}

/**
 * Map LibraryFileType to PreviewContentType for AionUi's PreviewPanel
 */
function mapFileTypeToPreviewType(fileType: string): string | null {
  switch (fileType) {
    case 'markdown':
      return 'markdown';
    case 'pdf':
      return 'pdf';
    case 'image':
      return 'image';
    case 'web':
      return 'url';
    case 'document':
      return 'word';
    case 'spreadsheet':
      return 'excel';
    case 'presentation':
      return 'ppt';
    default:
      return null;
  }
}

/** File types belonging to the 'docs' category */
const DOC_TYPES = new Set(['document', 'spreadsheet', 'presentation']);

/** File types that are NOT in any named category (→ 'others') */
const KNOWN_TYPED = new Set(['markdown', 'pdf', 'image', 'video', 'document', 'spreadsheet', 'presentation', 'web']);

/**
 * Build SQL WHERE clause fragment + params for the given LibraryFilter.
 */
function buildFilterClause(filter: LibraryFilter): { clause: string; params: (string | number)[] } {
  switch (filter) {
    case 'favorites':
      return { clause: ' AND favorite = 1', params: [] };
    case 'artifacts':
      return { clause: " AND (file_type IN ('web', 'html', 'artifact', 'dashboard', 'preview') OR source = 'agent')", params: [] };
    case 'notes':
      return { clause: " AND file_type = 'markdown'", params: [] };
    case 'images':
      return { clause: " AND file_type = 'image'", params: [] };
    case 'videos':
      return { clause: " AND file_type = 'video'", params: [] };
    case 'pdfs':
      return { clause: " AND file_type = 'pdf'", params: [] };
    case 'docs':
      return { clause: " AND file_type IN ('document','spreadsheet','presentation')", params: [] };
    case 'others':
      return {
        clause: " AND file_type NOT IN ('markdown','pdf','image','video','document','spreadsheet','presentation','web','html','artifact','dashboard','preview') AND source != 'agent'",
        params: [],
      };
    default:
      return { clause: '', params: [] };
  }
}

/**
 * Initialize Library IPC bridge handlers
 */
export function initLibraryBridge(): void {
  // 1. List library items
  ipcBridge.library.listItems.provider(async ({ filter, keyword }) => {
    const db = await getDatabase();

    const { clause: filterClause, params: filterParams } = buildFilterClause(filter as LibraryFilter);
    let query = `SELECT * FROM library_items WHERE 1=1${filterClause}`;
    const params: (string | number)[] = [...filterParams];

    if (keyword && keyword.trim()) {
      const escapedKeyword = `%${keyword.trim()}%`;
      query += ' AND (name LIKE ? OR source LIKE ?)';
      params.push(escapedKeyword, escapedKeyword);
    }

    if (filter === 'recents') {
      query += ' ORDER BY last_opened_at DESC, created_at DESC';
    } else {
      query += ' ORDER BY created_at DESC';
    }

    try {
      const rows = db.getDriver().prepare(query).all(...params) as ILibraryItemRow[];
      return rows.map(rowToLibraryItem);
    } catch (error) {
      console.error('[LibraryBridge] Failed to list items:', error);
      return [];
    }
  });

  // 2. Add library item
  ipcBridge.library.addItem.provider(async (params: IAddLibraryItemParams) => {
    const db = await getDatabase();
    const id = `library_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const libraryDir = getLibraryDir();
    let finalFilePath = '';

    if (params.sourcePath && params.fileType !== 'web') {
      const ext = path.extname(params.sourcePath);
      finalFilePath = path.join(libraryDir, `${id}${ext}`);
      try {
        await fs.copyFile(params.sourcePath, finalFilePath);
      } catch (error) {
        console.error(`[LibraryBridge] Failed to copy file from ${params.sourcePath}:`, error);
        throw error;
      }
    } else if (params.fileType === 'markdown') {
      finalFilePath = path.join(libraryDir, `${id}.md`);
      try {
        await fs.writeFile(finalFilePath, params.content || '', 'utf-8');
      } catch (error) {
        console.error('[LibraryBridge] Failed to write markdown file:', error);
        throw error;
      }
    } else if (params.fileType === 'web') {
      finalFilePath = params.sourcePath || params.content || '';
    } else {
      finalFilePath = path.join(libraryDir, `${id}.txt`);
      try {
        await fs.writeFile(finalFilePath, params.content || '', 'utf-8');
      } catch (error) {
        console.error('[LibraryBridge] Failed to write fallback file:', error);
        throw error;
      }
    }

    const now = Date.now();
    const row: ILibraryItemRow = {
      id,
      name: params.name,
      file_path: finalFilePath,
      file_type: params.fileType,
      source: params.fileType === 'web' ? 'web' : 'local',
      favorite: 0,
      shared: 0,
      private: 1,
      folder_id: params.folderId ?? null,
      parent_id: params.parentId ?? null,
      created_at: now,
      updated_at: now,
      last_opened_at: now,
    };

    try {
      db.getDriver()
        .prepare(
          `INSERT INTO library_items (
            id, name, file_path, file_type, source,
            favorite, shared, private, folder_id, parent_id, created_at, updated_at, last_opened_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          row.id,
          row.name,
          row.file_path,
          row.file_type,
          row.source,
          row.favorite,
          row.shared,
          row.private,
          row.folder_id,
          row.parent_id,
          row.created_at,
          row.updated_at,
          row.last_opened_at
        );
      return rowToLibraryItem(row);
    } catch (error) {
      console.error('[LibraryBridge] Failed to insert item:', error);
      throw error;
    }
  });

  // 3. Delete library item
  ipcBridge.library.deleteItem.provider(async ({ id }) => {
    const db = await getDatabase();
    try {
      const row = db.getDriver().prepare('SELECT * FROM library_items WHERE id = ?').get(id) as
        | ILibraryItemRow
        | undefined;
      if (!row) return false;

      if (row.source !== 'web' && existsSync(row.file_path)) {
        try {
          await fs.unlink(row.file_path);
        } catch (unlinkErr) {
          console.warn(`[LibraryBridge] Could not delete physical file: ${row.file_path}`, unlinkErr);
        }
      }

      // Automatically delete child items recursively or clear their parent_id
      db.getDriver().prepare('UPDATE library_items SET parent_id = NULL WHERE parent_id = ?').run(id);
      db.getDriver().prepare('DELETE FROM library_items WHERE id = ?').run(id);
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to delete item:', error);
      return false;
    }
  });

  // 4. Update library item
  ipcBridge.library.updateItem.provider(async ({ id, updates }) => {
    const db = await getDatabase();
    try {
      const existing = db.getDriver().prepare('SELECT * FROM library_items WHERE id = ?').get(id) as
        | ILibraryItemRow
        | undefined;
      if (!existing) return false;

      const item = rowToLibraryItem(existing);
      const updated: ILibraryItem = {
        ...item,
        ...updates,
        updatedAt: Date.now(),
      };

      if (updates.shared === true) {
        updated.private = false;
      } else if (updates.private === true) {
        updated.shared = false;
      }

      db.getDriver()
        .prepare(
          `UPDATE library_items SET
            name = ?,
            file_path = ?,
            file_type = ?,
            source = ?,
            favorite = ?,
            shared = ?,
            private = ?,
            folder_id = ?,
            parent_id = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          updated.name,
          updated.filePath,
          updated.fileType,
          updated.source,
          updated.favorite ? 1 : 0,
          updated.shared ? 1 : 0,
          updated.private ? 1 : 0,
          updated.folderId ?? null,
          updated.parentId ?? null,
          updated.updatedAt,
          id
        );
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to update item:', error);
      return false;
    }
  });

  // 5. Toggle Favorite
  ipcBridge.library.toggleFavorite.provider(async ({ id }) => {
    const db = await getDatabase();
    try {
      const existing = db.getDriver().prepare('SELECT * FROM library_items WHERE id = ?').get(id) as
        | ILibraryItemRow
        | undefined;
      if (!existing) return false;

      const newFavorite = existing.favorite === 1 ? 0 : 1;
      db.getDriver()
        .prepare('UPDATE library_items SET favorite = ?, updated_at = ? WHERE id = ?')
        .run(newFavorite, Date.now(), id);
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to toggle favorite:', error);
      return false;
    }
  });

  // 6. Toggle Shared
  ipcBridge.library.toggleShared.provider(async ({ id }) => {
    const db = await getDatabase();
    try {
      const existing = db.getDriver().prepare('SELECT * FROM library_items WHERE id = ?').get(id) as
        | ILibraryItemRow
        | undefined;
      if (!existing) return false;

      const newShared = existing.shared === 1 ? 0 : 1;
      const newPrivate = newShared === 1 ? 0 : existing.private;

      db.getDriver()
        .prepare('UPDATE library_items SET shared = ?, private = ?, updated_at = ? WHERE id = ?')
        .run(newShared, newPrivate, Date.now(), id);
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to toggle shared:', error);
      return false;
    }
  });

  // 7. Toggle Private
  ipcBridge.library.togglePrivate.provider(async ({ id }) => {
    const db = await getDatabase();
    try {
      const existing = db.getDriver().prepare('SELECT * FROM library_items WHERE id = ?').get(id) as
        | ILibraryItemRow
        | undefined;
      if (!existing) return false;

      const newPrivate = existing.private === 1 ? 0 : 1;
      const newShared = newPrivate === 1 ? 0 : existing.shared;

      db.getDriver()
        .prepare('UPDATE library_items SET private = ?, shared = ?, updated_at = ? WHERE id = ?')
        .run(newPrivate, newShared, Date.now(), id);
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to toggle private:', error);
      return false;
    }
  });

  // 8. Open library item
  ipcBridge.library.openItem.provider(async ({ id }) => {
    const db = await getDatabase();
    try {
      const row = db.getDriver().prepare('SELECT * FROM library_items WHERE id = ?').get(id) as
        | ILibraryItemRow
        | undefined;
      if (!row) return false;

      db.getDriver().prepare('UPDATE library_items SET last_opened_at = ? WHERE id = ?').run(Date.now(), id);

      const previewType = mapFileTypeToPreviewType(row.file_type);

      if (previewType) {
        let content = '';
        if (row.file_type === 'markdown') {
          try {
            content = await fs.readFile(row.file_path, 'utf-8');
          } catch (readErr) {
            console.error('[LibraryBridge] Failed to read markdown file contents:', readErr);
            content = '';
          }
        } else {
          content = row.file_path;
        }

        ipcBridge.preview.open.emit({
          content,
          contentType: previewType as Parameters<typeof ipcBridge.preview.open.emit>[0]['contentType'],
          metadata: {
            fileName: row.name,
            title: row.name,
          },
        });
        return true;
      } else {
        if (existsSync(row.file_path)) {
          const err = await shell.openPath(row.file_path);
          if (err) {
            console.error('[LibraryBridge] Failed to open path in system:', err);
            return false;
          }
          return true;
        }
        return false;
      }
    } catch (error) {
      console.error('[LibraryBridge] Failed to open item:', error);
      return false;
    }
  });

  // 9. Save note (BlockNote blocks JSON)
  ipcBridge.library.saveNote.provider(async ({ itemId, blocksJson }) => {
    const db = await getDatabase();
    try {
      const now = Date.now();
      const existing = db.getDriver().prepare('SELECT id FROM library_notes WHERE item_id = ?').get(itemId);
      if (existing) {
        db.getDriver()
          .prepare('UPDATE library_notes SET blocks_json = ?, updated_at = ? WHERE item_id = ?')
          .run(blocksJson, now, itemId);
      } else {
        const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        db.getDriver()
          .prepare(
            'INSERT INTO library_notes (id, item_id, blocks_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(id, itemId, blocksJson, now, now);
      }
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to save note:', error);
      return false;
    }
  });

  // 9.1 Get note (BlockNote blocks JSON)
  ipcBridge.library.getNote.provider(async ({ itemId }) => {
    const db = await getDatabase();
    try {
      const row = db.getDriver().prepare('SELECT blocks_json FROM library_notes WHERE item_id = ?').get(itemId) as
        | { blocks_json: string }
        | undefined;
      return row ? row.blocks_json : null;
    } catch (error) {
      console.error('[LibraryBridge] Failed to get note:', error);
      return null;
    }
  });

  // ==================== Folder Management ====================

  // 10. List folders for a category
  ipcBridge.library.listFolders.provider(async ({ category }) => {
    const db = await getDatabase();
    try {
      const rows = db
        .getDriver()
        .prepare('SELECT * FROM library_folders WHERE category = ? ORDER BY created_at ASC')
        .all(category) as ILibraryFolderRow[];
      return rows.map(rowToLibraryFolder);
    } catch (error) {
      console.error('[LibraryBridge] Failed to list folders:', error);
      return [];
    }
  });

  // 11. Create folder
  ipcBridge.library.createFolder.provider(async ({ name, category }) => {
    const db = await getDatabase();
    const id = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const row: ILibraryFolderRow = { id, name, category, created_at: now, updated_at: now };
    try {
      db.getDriver()
        .prepare('INSERT INTO library_folders (id, name, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(row.id, row.name, row.category, row.created_at, row.updated_at);
      return rowToLibraryFolder(row);
    } catch (error) {
      console.error('[LibraryBridge] Failed to create folder:', error);
      throw error;
    }
  });

  // 12. Rename folder
  ipcBridge.library.renameFolder.provider(async ({ id, name }) => {
    const db = await getDatabase();
    try {
      db.getDriver()
        .prepare('UPDATE library_folders SET name = ?, updated_at = ? WHERE id = ?')
        .run(name, Date.now(), id);
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to rename folder:', error);
      return false;
    }
  });

  // 13. Delete folder (items inside move to root: folder_id = NULL)
  ipcBridge.library.deleteFolder.provider(async ({ id }) => {
    const db = await getDatabase();
    try {
      db.getDriver().prepare('UPDATE library_items SET folder_id = NULL WHERE folder_id = ?').run(id);
      db.getDriver().prepare('DELETE FROM library_folders WHERE id = ?').run(id);
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to delete folder:', error);
      return false;
    }
  });

  // 14. Move item to a folder (or null = root)
  ipcBridge.library.moveItem.provider(async ({ id, folderId }) => {
    const db = await getDatabase();
    try {
      db.getDriver()
        .prepare('UPDATE library_items SET folder_id = ?, updated_at = ? WHERE id = ?')
        .run(folderId ?? null, Date.now(), id);
      return true;
    } catch (error) {
      console.error('[LibraryBridge] Failed to move item:', error);
      return false;
    }
  });
}

// Suppress unused import warning for KNOWN_TYPED / DOC_TYPES
void DOC_TYPES;
void KNOWN_TYPED;
