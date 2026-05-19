/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpRawOutput, ToolCallUpdate } from '@/common/types/platform/acpTypes';

const INLINE_IMAGE_RESULT_LIMIT = 64 * 1024;

const mimeTypeFromImagePath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
};

const sanitizeAcpRawOutput = (rawOutput?: AcpRawOutput): AcpRawOutput | undefined => {
  if (!rawOutput) return rawOutput;

  const result = rawOutput.result;
  const savedPath = rawOutput.saved_path;
  if (typeof result !== 'string' || result.length <= INLINE_IMAGE_RESULT_LIMIT || typeof savedPath !== 'string') {
    return rawOutput;
  }

  const { result: _result, ...rest } = rawOutput;
  return {
    ...rest,
    image: rawOutput.image || {
      path: savedPath,
      mime_type: mimeTypeFromImagePath(savedPath),
      source: 'codex_image_generation',
    },
    result_omitted: true,
    result_omitted_reason: rawOutput.result_omitted_reason || 'image_base64',
    result_bytes: rawOutput.result_bytes || result.length,
  };
};

export const sanitizeAcpToolUpdate = (update: ToolCallUpdate['update']): ToolCallUpdate['update'] => ({
  ...update,
  rawOutput: sanitizeAcpRawOutput(update.rawOutput),
  raw_output: sanitizeAcpRawOutput(update.raw_output),
});

export const sanitizeAcpToolCallContent = (content: ToolCallUpdate): ToolCallUpdate => ({
  ...content,
  update: sanitizeAcpToolUpdate(content.update),
});

export const getAcpImagePath = (update: ToolCallUpdate['update']): string | undefined => {
  const rawOutput = update.rawOutput || update.raw_output;
  const imagePath = rawOutput?.image?.path;
  if (typeof imagePath === 'string' && imagePath) return imagePath;

  const savedPath = rawOutput?.saved_path;
  if (typeof savedPath === 'string' && savedPath) return savedPath;

  return undefined;
};

export const getAcpImageFileName = (path: string): string => path.split(/[/\\]/).pop() || 'generated-image.png';
