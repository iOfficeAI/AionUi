/**
 * Lightweight ipc bridge helpers added separately to avoid touching existing exports
 */
import { bridge } from '@office-ai/platform';

export const showSave = bridge.buildProvider<string | undefined, { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }>('show-save');

export const saveTextFile = bridge.buildProvider<{ success: boolean; msg?: string }, { fullPath: string; content: string }>('save-text-file');
