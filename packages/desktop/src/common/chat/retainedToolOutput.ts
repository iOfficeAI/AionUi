/**
 * Helpers for AionCore large-tool-output spill payloads.
 *
 * When a tool result exceeds the backend preview budget, AionCore replaces the
 * inline body with a retained-output envelope:
 *   { preview, size, sha256, reference }
 * The full body is recovered via GET /api/conversations/{id}/outputs/{reference}.
 */

export type RetainedToolOutput = {
  preview: string;
  size: number;
  sha256: string;
  reference: string;
};

const isRetainedToolOutput = (value: unknown): value is RetainedToolOutput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.preview === 'string' &&
    typeof candidate.reference === 'string' &&
    typeof candidate.sha256 === 'string' &&
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    candidate.reference.startsWith('v1_') &&
    candidate.sha256.length === 64
  );
};

/**
 * Parse a retained-output envelope from either an object or a JSON string.
 * Returns null when the value is ordinary tool text.
 */
export function parseRetainedToolOutput(value: unknown): RetainedToolOutput | null {
  if (isRetainedToolOutput(value)) {
    return {
      preview: value.preview,
      size: value.size,
      sha256: value.sha256,
      reference: value.reference,
    };
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('"reference"')) return null;
  try {
    return parseRetainedToolOutput(JSON.parse(trimmed) as unknown);
  } catch {
    return null;
  }
}

/** Human-readable byte size for retained-output UI labels. */
export function formatRetainedOutputSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
