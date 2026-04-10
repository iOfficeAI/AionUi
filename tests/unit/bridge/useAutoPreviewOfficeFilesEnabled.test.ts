import { describe, expect, it } from 'vitest';
import {
  findNewOfficeFiles,
  isOfficeAutoPreviewTriggerMessage,
} from '@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled';

describe('useAutoPreviewOfficeFilesEnabled helpers', () => {
  it('treats only tool activity messages as Office scan triggers', () => {
    expect(isOfficeAutoPreviewTriggerMessage({ type: 'tool_call' })).toBe(true);
    expect(isOfficeAutoPreviewTriggerMessage({ type: 'tool_group' })).toBe(true);
    expect(isOfficeAutoPreviewTriggerMessage({ type: 'acp_tool_call' })).toBe(true);
    expect(isOfficeAutoPreviewTriggerMessage({ type: 'codex_tool_call' })).toBe(true);
    expect(isOfficeAutoPreviewTriggerMessage({ type: 'text' })).toBe(false);
    expect(isOfficeAutoPreviewTriggerMessage({ type: 'thinking' })).toBe(false);
  });

  it('returns only files that were not present in the previous baseline', () => {
    const knownFiles = new Set(['/workspace/report.docx', '/workspace/slides.pptx']);
    const currentFiles = [
      '/workspace/report.docx',
      '/workspace/slides.pptx',
      '/workspace/summary.docx',
      '/workspace/finance/budget.xlsx',
    ];

    expect(findNewOfficeFiles(currentFiles, knownFiles)).toEqual([
      '/workspace/summary.docx',
      '/workspace/finance/budget.xlsx',
    ]);
  });
});
