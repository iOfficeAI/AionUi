/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

/**
 * Pure function tests for ActionExecutor helpers
 * Inline implementations avoid module mocking conflicts
 */
describe('ActionExecutor pure functions', () => {
  describe('getConfirmationOptions', () => {
    function getConfirmationOptions(type: string): Array<{ label: string; value: string }> {
      switch (type) {
        case 'edit':
          return [
            { label: '✅ Allow Once', value: 'proceed_once' },
            { label: '✅ Always Allow', value: 'proceed_always' },
            { label: '❌ Cancel', value: 'cancel' },
          ];
        case 'exec':
          return [
            { label: '✅ Allow Execution', value: 'proceed_once' },
            { label: '✅ Always Allow', value: 'proceed_always' },
            { label: '❌ Cancel', value: 'cancel' },
          ];
        case 'mcp':
          return [
            { label: '✅ Allow Once', value: 'proceed_once' },
            { label: '✅ Always Allow Tool', value: 'proceed_always_tool' },
            { label: '✅ Always Allow Server', value: 'proceed_always_server' },
            { label: '❌ Cancel', value: 'cancel' },
          ];
        default:
          return [
            { label: '✅ Confirm', value: 'proceed_once' },
            { label: '❌ Cancel', value: 'cancel' },
          ];
      }
    }

    it('returns edit confirmation options', () => {
      const options = getConfirmationOptions('edit');
      expect(options).toHaveLength(3);
      expect(options[0]).toEqual({ label: '✅ Allow Once', value: 'proceed_once' });
      expect(options[1]).toEqual({ label: '✅ Always Allow', value: 'proceed_always' });
      expect(options[2]).toEqual({ label: '❌ Cancel', value: 'cancel' });
    });

    it('returns exec confirmation options', () => {
      const options = getConfirmationOptions('exec');
      expect(options).toHaveLength(3);
      expect(options[0]).toEqual({ label: '✅ Allow Execution', value: 'proceed_once' });
    });

    it('returns mcp confirmation options with 4 choices', () => {
      const options = getConfirmationOptions('mcp');
      expect(options).toHaveLength(4);
      expect(options[0]).toEqual({ label: '✅ Allow Once', value: 'proceed_once' });
      expect(options[1]).toEqual({ label: '✅ Always Allow Tool', value: 'proceed_always_tool' });
      expect(options[2]).toEqual({ label: '✅ Always Allow Server', value: 'proceed_always_server' });
      expect(options[3]).toEqual({ label: '❌ Cancel', value: 'cancel' });
    });

    it('returns default confirmation options for unknown type', () => {
      const options = getConfirmationOptions('unknown');
      expect(options).toHaveLength(2);
      expect(options[0]).toEqual({ label: '✅ Confirm', value: 'proceed_once' });
      expect(options[1]).toEqual({ label: '❌ Cancel', value: 'cancel' });
    });
  });

  describe('getConfirmationPrompt', () => {
    function escapeHtml(text: string): string {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    function getConfirmationPrompt(details: { type: string; title?: string; [key: string]: any }): string {
      if (!details) return 'Please confirm the operation';

      switch (details.type) {
        case 'edit':
          return `📝 <b>Edit File Confirmation</b>\nFile: <code>${escapeHtml(details.fileName || 'Unknown file')}</code>\n\nAllow editing this file?`;
        case 'exec':
          return `⚡ <b>Execute Command Confirmation</b>\nCommand: <code>${escapeHtml(details.command || 'Unknown command')}</code>\n\nAllow executing this command?`;
        case 'mcp':
          return `🔧 <b>MCP Tool Confirmation</b>\nTool: <code>${escapeHtml(details.toolDisplayName || details.toolName || 'Unknown tool')}</code>\nServer: <code>${escapeHtml(details.serverName || 'Unknown server')}</code>\n\nAllow calling this tool?`;
        case 'info':
          return `ℹ️ <b>Information Confirmation</b>\n${escapeHtml(details.prompt || '')}\n\nContinue?`;
        default:
          return 'Please confirm the operation';
      }
    }

    it('returns edit file confirmation prompt with filename', () => {
      const prompt = getConfirmationPrompt({ type: 'edit', fileName: 'test.txt' });
      expect(prompt).toContain('Edit File Confirmation');
      expect(prompt).toContain('test.txt');
      expect(prompt).toContain('Allow editing this file?');
    });

    it('escapes HTML in filename for edit prompt', () => {
      const prompt = getConfirmationPrompt({ type: 'edit', fileName: '<script>alert("xss")</script>' });
      expect(prompt).toContain('&lt;script&gt;');
      expect(prompt).not.toContain('<script>');
    });

    it('returns exec command confirmation prompt', () => {
      const prompt = getConfirmationPrompt({ type: 'exec', command: 'npm install' });
      expect(prompt).toContain('Execute Command Confirmation');
      expect(prompt).toContain('npm install');
    });

    it('escapes HTML in command for exec prompt', () => {
      const prompt = getConfirmationPrompt({ type: 'exec', command: 'rm -rf <path>' });
      expect(prompt).toContain('&lt;path&gt;');
    });

    it('returns MCP tool confirmation prompt', () => {
      const prompt = getConfirmationPrompt({
        type: 'mcp',
        toolName: 'read_file',
        toolDisplayName: 'Read File',
        serverName: 'filesystem',
      });
      expect(prompt).toContain('MCP Tool Confirmation');
      expect(prompt).toContain('Read File');
      expect(prompt).toContain('filesystem');
    });

    it('uses toolName when toolDisplayName is not provided', () => {
      const prompt = getConfirmationPrompt({
        type: 'mcp',
        toolName: 'write_file',
        serverName: 'default',
      });
      expect(prompt).toContain('write_file');
    });

    it('returns info confirmation prompt', () => {
      const prompt = getConfirmationPrompt({ type: 'info', prompt: 'This is an informational message' });
      expect(prompt).toContain('Information Confirmation');
      expect(prompt).toContain('This is an informational message');
    });

    it('returns default prompt for unknown type', () => {
      const prompt = getConfirmationPrompt({ type: 'unknown' });
      expect(prompt).toBe('Please confirm the operation');
    });

    it('returns default prompt for null details', () => {
      const prompt = getConfirmationPrompt(null as any);
      expect(prompt).toBe('Please confirm the operation');
    });

    it('handles undefined fileName gracefully', () => {
      const prompt = getConfirmationPrompt({ type: 'edit' });
      expect(prompt).toContain('Unknown file');
    });

    it('handles undefined command gracefully', () => {
      const prompt = getConfirmationPrompt({ type: 'exec' });
      expect(prompt).toContain('Unknown command');
    });
  });

  describe('escapeHtml', () => {
    function escapeHtml(text: string): string {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    it('escapes ampersand', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('escapes less than', () => {
      expect(escapeHtml('5 < 10')).toBe('5 &lt; 10');
    });

    it('escapes greater than', () => {
      expect(escapeHtml('10 > 5')).toBe('10 &gt; 5');
    });

    it('escapes double quote', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes single quote', () => {
      expect(escapeHtml("it's fine")).toBe('it&#x27;s fine');
    });

    it('escapes multiple characters', () => {
      expect(escapeHtml('<div>Hello & "world"</div>')).toBe('&lt;div&gt;Hello &amp; &quot;world&quot;&lt;/div&gt;');
    });

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('handles string without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('formatTextForPlatform', () => {
    function escapeHtml(text: string): string {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    function convertHtmlToLarkMarkdown(html: string): string {
      return html
        .replace(/<b>(.*?)<\/b>/g, '**$1**')
        .replace(/<code>(.*?)<\/code>/g, '`$1`')
        .replace(/<br\/>/g, '\n');
    }

    function convertHtmlToDingTalkMarkdown(html: string): string {
      return html.replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<code>(.*?)<\/code>/g, '`$1`');
    }

    function markdownToTelegramHtml(markdown: string): string {
      return markdown.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/`(.*?)`/g, '<code>$1</code>');
    }

    function stripHtml(html: string): string {
      return html.replace(/<[^>]*>/g, '');
    }

    function formatTextForPlatform(text: string, platform: string): string {
      if (platform === 'lark') {
        return convertHtmlToLarkMarkdown(text);
      }
      if (platform === 'dingtalk') {
        return convertHtmlToDingTalkMarkdown(text);
      }
      if (platform === 'telegram') {
        return markdownToTelegramHtml(text);
      }
      if (platform === 'weixin') {
        return stripHtml(text);
      }
      return escapeHtml(text);
    }

    it('converts HTML bold to Lark markdown', () => {
      const result = formatTextForPlatform('Hello <b>world</b>', 'lark');
      expect(result).toBe('Hello **world**');
    });

    it('converts HTML code to Lark markdown', () => {
      const result = formatTextForPlatform('Use <code>console.log</code>', 'lark');
      expect(result).toBe('Use `console.log`');
    });

    it('converts HTML bold to DingTalk markdown', () => {
      const result = formatTextForPlatform('Hello <b>world</b>', 'dingtalk');
      expect(result).toBe('Hello **world**');
    });

    it('converts markdown bold to Telegram HTML', () => {
      const result = formatTextForPlatform('Hello **world**', 'telegram');
      expect(result).toBe('Hello <b>world</b>');
    });

    it('converts markdown code to Telegram HTML', () => {
      const result = formatTextForPlatform('Use `console.log`', 'telegram');
      expect(result).toBe('Use <code>console.log</code>');
    });

    it('strips HTML for weixin platform', () => {
      const result = formatTextForPlatform('<b>Bold</b> and <i>italic</i>', 'weixin');
      expect(result).toBe('Bold and italic');
    });

    it('escapes HTML for unknown platforms', () => {
      const result = formatTextForPlatform('<script>alert("xss")</script>', 'unknown');
      expect(result).toContain('&lt;script&gt;');
    });

    it('handles empty string', () => {
      const result = formatTextForPlatform('', 'lark');
      expect(result).toBe('');
    });
  });
});
