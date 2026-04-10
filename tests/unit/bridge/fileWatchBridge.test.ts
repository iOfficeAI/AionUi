import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';
import {
  isIgnoredOfficeTempFileName,
  scanWorkspaceOfficeFiles,
  shouldSkipWorkspaceOfficeScanDir,
} from '@/process/bridge/fileWatchBridge';

describe('fileWatchBridge office scan helpers', () => {
  it('detects Office temporary marker files', () => {
    expect(isIgnoredOfficeTempFileName('~$draft.docx')).toBe(true);
    expect(isIgnoredOfficeTempFileName('~report.xlsx')).toBe(true);
    expect(isIgnoredOfficeTempFileName('～slides.pptx')).toBe(true);
    expect(isIgnoredOfficeTempFileName('report.docx')).toBe(false);
  });

  it('skips hidden and heavyweight directories during workspace scans', () => {
    expect(shouldSkipWorkspaceOfficeScanDir('.git')).toBe(true);
    expect(shouldSkipWorkspaceOfficeScanDir('.claude')).toBe(true);
    expect(shouldSkipWorkspaceOfficeScanDir('node_modules')).toBe(true);
    expect(shouldSkipWorkspaceOfficeScanDir('dist')).toBe(true);
    expect(shouldSkipWorkspaceOfficeScanDir('docs')).toBe(false);
  });
});

describe('scanWorkspaceOfficeFiles', () => {
  it('returns only previewable Office files from non-ignored directories', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'aionui-office-scan-'));

    try {
      await mkdir(path.join(workspace, 'docs', 'nested'), { recursive: true });
      await mkdir(path.join(workspace, 'node_modules', 'pkg'), { recursive: true });
      await mkdir(path.join(workspace, '.git', 'objects'), { recursive: true });

      await writeFile(path.join(workspace, 'report.docx'), '');
      await writeFile(path.join(workspace, 'docs', 'nested', 'budget.xlsx'), '');
      await writeFile(path.join(workspace, 'docs', 'nested', '~$budget.xlsx'), '');
      await writeFile(path.join(workspace, 'docs', 'nested', '～draft.docx'), '');
      await writeFile(path.join(workspace, 'node_modules', 'pkg', 'ignored.pptx'), '');
      await writeFile(path.join(workspace, '.git', 'objects', 'ignored.docx'), '');

      await expect(scanWorkspaceOfficeFiles(workspace)).resolves.toEqual([
        path.join(workspace, 'docs', 'nested', 'budget.xlsx'),
        path.join(workspace, 'report.docx'),
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
