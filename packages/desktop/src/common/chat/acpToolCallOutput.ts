/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AcpRawOutput,
  ToolCallContentItem,
  ToolCallLocationItem,
  ToolCallUpdate,
} from '@/common/types/platform/acpTypes';

const INLINE_IMAGE_RESULT_LIMIT = 64 * 1024;
const TOOL_FIELD_STRING_LIMIT = 8 * 1024;
const TOOL_FIELD_PAYLOAD_LIMIT = 64 * 1024;
const TOOL_ARRAY_ITEM_LIMIT = 32;
const TOOL_OBJECT_KEY_LIMIT = 64;
const TOOL_VALUE_DEPTH_LIMIT = 8;
const TOOL_STRING_TRUNCATED_MARKER = '\n...[truncated]';
const IMAGE_PATH_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif)$/i;

type CompactState = { truncated: boolean };
type CompactToolCallContent = ToolCallUpdate & {
  _compact?: {
    truncated?: boolean;
    original_size?: number;
    preview_chars?: number;
  };
};

const serializedLength = (value: unknown): number => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

const truncateToolString = (value: string, state: CompactState): string => {
  if (value.length <= TOOL_FIELD_STRING_LIMIT) return value;
  state.truncated = true;
  let end = TOOL_FIELD_STRING_LIMIT - TOOL_STRING_TRUNCATED_MARKER.length;
  const lastCodeUnit = value.charCodeAt(end - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end -= 1;
  return `${value.slice(0, end)}${TOOL_STRING_TRUNCATED_MARKER}`;
};

const compactToolValue = (value: unknown, state: CompactState, depth = 0): unknown => {
  if (typeof value === 'string') return truncateToolString(value, state);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= TOOL_VALUE_DEPTH_LIMIT) {
    state.truncated = true;
    return { _omitted: true, _reason: 'depth_limit' };
  }
  if (Array.isArray(value)) {
    if (value.length > TOOL_ARRAY_ITEM_LIMIT) state.truncated = true;
    return value.slice(0, TOOL_ARRAY_ITEM_LIMIT).map((item) => compactToolValue(item, state, depth + 1));
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > TOOL_OBJECT_KEY_LIMIT) state.truncated = true;
  return Object.fromEntries(
    entries.slice(0, TOOL_OBJECT_KEY_LIMIT).map(([key, item]) => [key, compactToolValue(item, state, depth + 1)])
  );
};

const compactToolRecord = (
  value: Record<string, unknown> | undefined,
  state: CompactState
): Record<string, unknown> | undefined => {
  if (!value) return value;
  const compacted = compactToolValue(value, state) as Record<string, unknown>;
  const payloadLength = serializedLength(compacted);
  if (payloadLength <= TOOL_FIELD_PAYLOAD_LIMIT) return compacted;
  state.truncated = true;
  return {
    _omitted: true,
    _reason: 'payload_too_large',
    _bytes: serializedLength(value),
  };
};

const isProbablyInlineImageResult = (value: string): boolean =>
  value.length > INLINE_IMAGE_RESULT_LIMIT &&
  (value.startsWith('iVBORw0KGgo') ||
    value.startsWith('/9j/') ||
    value.startsWith('UklGR') ||
    value.startsWith('data:image/'));

const isImagePath = (path: string): boolean => IMAGE_PATH_EXTENSION_RE.test(path);

const isAbsoluteLocalPath = (path: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/');

const normalizeArtifactAlias = (path: string): string => path.replace(/\\/g, '/').replace(/^\.\//, '');

const mimeTypeFromImagePath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
};

const sanitizeAcpRawOutput = (rawOutput: AcpRawOutput | undefined, state: CompactState): AcpRawOutput | undefined => {
  if (!rawOutput) return rawOutput;

  let sanitizedOutput = rawOutput;
  const imageContent = rawOutput.image_content;
  if (typeof imageContent === 'object' && imageContent !== null) {
    const imageContentRecord = imageContent as Record<string, unknown>;
    const imageData = imageContentRecord.data;
    if (typeof imageData === 'string' && imageData.length > INLINE_IMAGE_RESULT_LIMIT) {
      const { data: _data, ...imageContentWithoutData } = imageContentRecord;
      state.truncated = true;
      sanitizedOutput = {
        ...rawOutput,
        image_content: {
          ...imageContentWithoutData,
          data_omitted: true,
          data_bytes: imageData.length,
        },
      };
    }
  }

  const result = sanitizedOutput.result;
  const savedPath = sanitizedOutput.saved_path;
  if (typeof result !== 'string' || !isProbablyInlineImageResult(result)) {
    return compactToolRecord(sanitizedOutput, state) as AcpRawOutput;
  }

  state.truncated = true;
  const { result: _result, ...rest } = sanitizedOutput;
  const sanitized: AcpRawOutput = {
    ...rest,
    result_omitted: true,
    result_omitted_reason: sanitizedOutput.result_omitted_reason || 'image_base64',
    result_bytes: sanitizedOutput.result_bytes || result.length,
  };

  if (sanitizedOutput.image || (typeof savedPath === 'string' && savedPath)) {
    const path = sanitizedOutput.image?.path || savedPath;
    sanitized.image = sanitizedOutput.image || {
      path,
      mime_type: mimeTypeFromImagePath(path),
      source: 'codex_image_generation',
    };
  }

  return compactToolRecord(sanitized, state) as AcpRawOutput;
};

const compactToolContent = (
  content: ToolCallContentItem[] | undefined,
  state: CompactState
): ToolCallContentItem[] | undefined => {
  if (!content) return content;
  const compacted = compactToolValue(content, state) as ToolCallContentItem[];
  if (serializedLength(compacted) <= TOOL_FIELD_PAYLOAD_LIMIT) return compacted;
  state.truncated = true;
  return undefined;
};

const compactToolLocations = (
  locations: ToolCallLocationItem[] | undefined,
  state: CompactState
): ToolCallLocationItem[] | undefined => {
  if (!locations) return locations;
  return compactToolValue(locations, state) as ToolCallLocationItem[];
};

const sanitizeAcpToolUpdateWithState = (
  update: ToolCallUpdate['update'],
  state: CompactState
): ToolCallUpdate['update'] => {
  const compatibleUpdate = update as ToolCallUpdate['update'] & {
    raw_input?: Record<string, unknown>;
  };
  return {
    ...update,
    title: truncateToolString(update.title, state),
    rawInput: compactToolRecord(update.rawInput, state),
    ...(compatibleUpdate.raw_input ? { raw_input: compactToolRecord(compatibleUpdate.raw_input, state) } : {}),
    rawOutput: sanitizeAcpRawOutput(update.rawOutput, state),
    raw_output: sanitizeAcpRawOutput(update.raw_output, state),
    content: compactToolContent(update.content, state),
    locations: compactToolLocations(update.locations, state),
  };
};

export const sanitizeAcpToolUpdate = (update: ToolCallUpdate['update']): ToolCallUpdate['update'] =>
  sanitizeAcpToolUpdateWithState(update, { truncated: false });

export const sanitizeAcpToolCallContent = (content: ToolCallUpdate): ToolCallUpdate => {
  const state: CompactState = { truncated: false };
  const originalSize = serializedLength(content);
  const compatibleContent = content as CompactToolCallContent;
  const sanitized: CompactToolCallContent = {
    ...content,
    update: sanitizeAcpToolUpdateWithState(content.update, state),
  };
  if (state.truncated) {
    sanitized._compact = {
      ...compatibleContent._compact,
      truncated: true,
      original_size: compatibleContent._compact?.original_size ?? originalSize,
      preview_chars: TOOL_FIELD_STRING_LIMIT,
    };
  }
  return sanitized;
};

export const getAcpImagePath = (update: ToolCallUpdate['update']): string | undefined => {
  const rawOutput = update.rawOutput || update.raw_output;
  const imagePath = rawOutput?.image?.path;
  if (typeof imagePath === 'string' && imagePath) return imagePath;

  const generatedPath = rawOutput?.path;
  if (
    typeof generatedPath === 'string' &&
    generatedPath &&
    rawOutput?.type === 'ImageGen' &&
    isImagePath(generatedPath)
  ) {
    return generatedPath;
  }

  const imageContent = rawOutput?.image_content;
  const mimeType =
    typeof imageContent === 'object' && imageContent !== null
      ? (imageContent as Record<string, unknown>).mime_type
      : undefined;
  const compatibleUpdate = update as ToolCallUpdate['update'] & {
    raw_input?: Record<string, unknown>;
  };
  const rawInput = update.rawInput || compatibleUpdate.raw_input;
  const targetFile = rawInput?.target_file;
  if (
    typeof mimeType === 'string' &&
    mimeType.startsWith('image/') &&
    typeof targetFile === 'string' &&
    isImagePath(targetFile)
  ) {
    return targetFile;
  }

  const savedPath = rawOutput?.saved_path;
  if (
    typeof savedPath === 'string' &&
    savedPath &&
    (rawOutput?.result_omitted_reason === 'image_base64' || isImagePath(savedPath))
  ) {
    return savedPath;
  }

  return undefined;
};

export const getAcpImageFileName = (path: string): string => path.split(/[/\\]/).pop() || 'generated-image.png';

/**
 * Build stable relative aliases for an ACP-generated local artifact. Agents
 * commonly mention `images/1.jpg` in prose while the tool result carries the
 * only usable absolute session path.
 */
export const getAcpArtifactPathAliases = (update: ToolCallUpdate['update']): Readonly<Record<string, string>> => {
  const rawOutput = update.rawOutput || update.raw_output;
  if (!rawOutput) return {};

  const candidates = [
    rawOutput.image?.path,
    rawOutput.path,
    rawOutput.saved_path,
    rawOutput.absolute_path,
    rawOutput.file_path,
  ].filter((value): value is string => typeof value === 'string' && isAbsoluteLocalPath(value));
  const aliases: Record<string, string> = {};
  for (const absolutePath of candidates) {
    const normalizedPath = normalizeArtifactAlias(absolutePath);
    const parts = normalizedPath.split('/').filter(Boolean);
    const fileName = parts.at(-1);
    if (!fileName) continue;

    aliases[fileName] = absolutePath;
    const parentName = parts.at(-2);
    if (parentName) aliases[`${parentName}/${fileName}`] = absolutePath;

    const sessionFolder = rawOutput.session_folder;
    const outputFileName = rawOutput.filename;
    if (typeof sessionFolder === 'string' && typeof outputFileName === 'string') {
      aliases[normalizeArtifactAlias(`${sessionFolder}/${outputFileName}`)] = absolutePath;
    }
  }
  return aliases;
};
