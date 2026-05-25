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

export function getRecentFeedbackLogPaths(logsDir: string, days = DEFAULT_LOG_DAYS): string[] {
  let files: string[];
  try {
    files = fs.readdirSync(logsDir);
  } catch {
    return [];
  }

  const dates = new Set<string>();
  for (const file of files) {
    const match = DATE_PATTERN.exec(file);
    if (match && LOG_SUFFIXES.some((suffix) => file.endsWith(suffix))) {
      dates.add(match[0]);
    }
  }

  const recentDates = [...dates].toSorted().toReversed().slice(0, days);
  const paths: string[] = [];
  for (const dateStr of recentDates) {
    for (const suffix of LOG_SUFFIXES) {
      const filePath = path.join(logsDir, `${dateStr}${suffix}`);
      if (fs.existsSync(filePath)) {
        paths.push(filePath);
      }
    }
  }

  return paths;
}

export function collectFeedbackLogAttachment(logsDir: string): FeedbackLogAttachment | null {
  const logPaths = getRecentFeedbackLogPaths(logsDir);
  if (logPaths.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const logPath of logPaths) {
    const basename = path.basename(logPath);
    const content = fs.readFileSync(logPath, 'utf8');
    parts.push(`=== ${basename} ===\n${content}\n`);
  }

  return {
    filename: 'logs.gz',
    data: zlib.gzipSync(Buffer.from(parts.join('\n'), 'utf8')),
    contentType: 'application/gzip',
  };
}
