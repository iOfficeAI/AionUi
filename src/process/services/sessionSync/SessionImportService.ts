/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuid } from 'uuid';
import type { AionUIDatabase } from '@process/services/database';
import type { TChatConversation } from '@/common/config/storage';
import type { DiscoveredSession } from './types';
import type { IStatement } from '@process/services/database/drivers/ISqliteDriver';

/**
 * Imports discovered desktop CLI sessions into AionUi's database.
 */
export class SessionImportService {
  private existingSourcePathsStmt: IStatement | null = null;

  constructor(private db: AionUIDatabase) {}

  async importSessions(sessions: DiscoveredSession[]): Promise<number> {
    const existingSourcePaths = this.getExistingSourcePaths();
    let imported = 0;

    this.db.getDriver().transaction(() => {
      for (const session of sessions) {
        if (existingSourcePaths.has(session.sourcePath)) continue;

        const conversation = this.buildConversation(session);
        this.db.createConversation(conversation);
        imported++;
      }
    })();

    return imported;
  }

  /**
   * Collect all `desktopSessionSourcePath` values from existing acp conversations.
   * Optimized to use direct SQL query on the extra column with prepared statement caching.
   */
  private getExistingSourcePaths(): Set<string> {
    const paths = new Set<string>();
    try {
      if (!this.existingSourcePathsStmt) {
        // Use json_extract to pull only the sourcePath directly from SQLite (requires SQLite >= 3.38)
        this.existingSourcePathsStmt = this.db
          .getDriver()
          .prepare(
            "SELECT json_extract(extra, '$.desktopSessionSourcePath') AS sourcePath FROM conversations WHERE type = 'acp' AND json_extract(extra, '$.desktopSessionSourcePath') IS NOT NULL"
          );
      }

      const rows = this.existingSourcePathsStmt.all() as Array<{ sourcePath: string }>;

      for (const row of rows) {
        paths.add(row.sourcePath);
      }
    } catch (err) {
      console.error('[SessionImportService] Failed to query existing source paths via SQL', err);
      throw err;
    }
    return paths;
  }

  private buildConversation(session: DiscoveredSession): TChatConversation {
    return {
      id: uuid(),
      name: session.name,
      type: 'acp',
      createTime: session.lastModified,
      modifyTime: session.lastModified,
      source: 'desktop-sync',
      extra: {
        workspace: session.workspace,
        backend: session.agentType,
        customWorkspace: true,
        acpSessionId: session.sessionId,
        desktopSessionSourcePath: session.sourcePath,
      },
    };
  }
}
