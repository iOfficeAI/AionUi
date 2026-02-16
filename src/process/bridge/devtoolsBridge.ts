/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DevTools IPC bridge — handles session analysis requests from the renderer.
 */

import * as ipcBridge from '@/common/ipcBridge';
import { analyzeSession, listSessionFiles, classifyContextInjections, summarizeContextBreakdown } from '../services/devtools';
import { getClaudeBasePath } from '../services/devtools/sessionDiscovery';
import * as fs from 'fs';
import * as path from 'path';

export function initDevToolsBridge(): void {
  // Analyze a specific Claude Code session
  ipcBridge.devtools.analyzeSession.provider(async ({ sessionId, workspace }) => {
    try {
      const analysis = await analyzeSession(sessionId, workspace);
      if (!analysis) {
        return {
          success: false,
          msg: `Session "${sessionId}" not found. Ensure Claude Code session logs exist in ~/.claude/projects/.`,
        };
      }

      // Compute context injection info
      const contextInfo = classifyContextInjections(analysis.messages);
      const contextBreakdown = summarizeContextBreakdown(contextInfo);

      return {
        success: true,
        data: {
          sessionId: analysis.sessionId,
          projectPath: analysis.projectPath,
          metrics: analysis.metrics,
          tokenAttribution: analysis.tokenAttribution,
          compactionEvents: analysis.compactionEvents,
          toolExecutionSummary: analysis.toolExecutionSummary,
          subagents: analysis.subagents,
          contextBreakdown,
          messageCount: analysis.messageCount,
          model: analysis.model,
          startTime: analysis.startTime,
          endTime: analysis.endTime,
          chunks: JSON.stringify(analysis.chunks),
          messages: JSON.stringify(analysis.messages),
          contextInfo: JSON.stringify(contextInfo),
        },
      };
    } catch (error) {
      console.error('[DevTools] Failed to analyze session:', error);
      return {
        success: false,
        msg: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // List available session files
  ipcBridge.devtools.listSessions.provider(async ({ workspace }) => {
    try {
      const sessions = listSessionFiles(workspace);
      return {
        success: true,
        data: sessions,
      };
    } catch (error) {
      console.error('[DevTools] Failed to list sessions:', error);
      return {
        success: false,
        msg: `Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  // List all projects with their sessions
  ipcBridge.devtools.listProjects.provider(async () => {
    try {
      const claudeBase = getClaudeBasePath();
      const projectsDir = path.join(claudeBase, 'projects');

      if (!fs.existsSync(projectsDir)) {
        return { success: true, data: [] };
      }

      const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true });
      const projects: ipcBridge.IDevToolsProjectInfo[] = [];

      for (const dir of projectDirs) {
        if (!dir.isDirectory()) continue;

        const dirPath = path.join(projectsDir, dir.name);
        const sessions: ipcBridge.IDevToolsSessionListItem[] = [];

        try {
          const files = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const file of files) {
            if (file.isFile() && file.name.endsWith('.jsonl')) {
              const filePath = path.join(dirPath, file.name);
              const sessionId = file.name.replace('.jsonl', '');
              try {
                const stat = fs.statSync(filePath);
                sessions.push({ sessionId, filePath, modifiedAt: stat.mtimeMs });
              } catch {
                // Skip files we can't stat
              }
            }
          }
        } catch {
          continue;
        }

        if (sessions.length === 0) continue;

        sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);

        // Decode project path from encoded directory name
        const projectPath = dir.name.startsWith('-') ? dir.name.replace(/-/g, '/') : dir.name;

        projects.push({
          projectPath,
          encodedPath: dir.name,
          sessionCount: sessions.length,
          latestSessionAt: sessions[0].modifiedAt,
          sessions,
        });
      }

      projects.sort((a, b) => b.latestSessionAt - a.latestSessionAt);
      return { success: true, data: projects };
    } catch (error) {
      console.error('[DevTools] Failed to list projects:', error);
      return {
        success: false,
        msg: `Failed to list projects: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
