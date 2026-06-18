/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

const LOG_SUFFIXES = ['.log', '.aioncore.log', '.aionrs.log'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const DEFAULT_LOG_DAYS = 3;

export type FeedbackLogAttachment = {
  filename: string;
  data: Buffer;
  contentType: 'application/gzip';
};

function isFeedbackLogFile(file: string): boolean {
  return DATE_PATTERN.test(file) && LOG_SUFFIXES.some((suffix) => file.endsWith(suffix));
}

function normalizeLogDirs(logsDirs: string | string[]): string[] {
  const dirs = Array.isArray(logsDirs) ? logsDirs : [logsDirs];
  const seen = new Set<string>();
  const normalizedDirs: string[] = [];
  for (const dir of dirs) {
    const normalizedDir = path.resolve(dir);
    if (!seen.has(normalizedDir)) {
      seen.add(normalizedDir);
      normalizedDirs.push(normalizedDir);
    }
  }

  return normalizedDirs;
}

export function getRecentFeedbackLogPathsFromDirs(logsDirs: string[], days = DEFAULT_LOG_DAYS): string[] {
  const filesByDir = new Map<string, Set<string>>();
  const dates = new Set<string>();

  for (const logsDir of normalizeLogDirs(logsDirs)) {
    let files: string[];
    try {
      files = fs.readdirSync(logsDir);
    } catch {
      continue;
    }

    const logFiles = new Set<string>();
    for (const file of files) {
      if (!isFeedbackLogFile(file)) {
        continue;
      }

      const match = DATE_PATTERN.exec(file);
      if (match) {
        dates.add(match[0]);
        logFiles.add(file);
      }
    }

    filesByDir.set(logsDir, logFiles);
  }

  const recentDates = [...dates].toSorted().toReversed().slice(0, days);
  const paths: string[] = [];
  for (const dateStr of recentDates) {
    for (const [logsDir, files] of filesByDir) {
      for (const suffix of LOG_SUFFIXES) {
        const filename = `${dateStr}${suffix}`;
        if (files.has(filename)) {
          paths.push(path.join(logsDir, filename));
        }
      }
    }
  }

  return paths;
}

function getLogHeaderName(logPath: string, rootDir: string, showRelativePath: boolean): string {
  if (!showRelativePath) {
    return path.basename(logPath);
  }

  const relativePath = path.relative(rootDir, logPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return path.basename(logPath);
  }

  return relativePath.split(path.sep).join('/');
}

export function getRecentFeedbackLogPaths(logsDir: string, days = DEFAULT_LOG_DAYS): string[] {
  const normalizedDir = normalizeLogDirs(logsDir)[0];
  let files: string[];
  try {
    files = fs.readdirSync(normalizedDir);
  } catch {
    return [];
  }

  const dates = new Set<string>();
  for (const file of files) {
    const match = isFeedbackLogFile(file) ? DATE_PATTERN.exec(file) : null;
    if (match) {
      dates.add(match[0]);
    }
  }

  const recentDates = [...dates].toSorted().toReversed().slice(0, days);
  const paths: string[] = [];
  for (const dateStr of recentDates) {
    for (const suffix of LOG_SUFFIXES) {
      const filePath = path.join(normalizedDir, `${dateStr}${suffix}`);
      if (fs.existsSync(filePath)) {
        paths.push(filePath);
      }
    }
  }

  return paths;
}

export function collectFeedbackLogAttachment(logsDirs: string | string[]): FeedbackLogAttachment | null {
  const normalizedDirs = normalizeLogDirs(logsDirs);
  const logPaths =
    normalizedDirs.length === 1
      ? getRecentFeedbackLogPaths(normalizedDirs[0])
      : getRecentFeedbackLogPathsFromDirs(normalizedDirs);
  if (logPaths.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const logPath of logPaths) {
    const basename = getLogHeaderName(logPath, normalizedDirs[0], normalizedDirs.length > 1);
    const content = fs.readFileSync(logPath, 'utf8');
    parts.push(`=== ${basename} ===\n${content}\n`);
  }

  return {
    filename: 'logs.gz',
    data: zlib.gzipSync(Buffer.from(parts.join('\n'), 'utf8')),
    contentType: 'application/gzip',
  };
}
