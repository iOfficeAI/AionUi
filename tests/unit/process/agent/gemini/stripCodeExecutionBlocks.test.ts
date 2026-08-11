import { describe, expect, it } from 'vitest';
import { stripCodeExecutionBlocks } from '@process/agent/gemini/utils';

describe('stripCodeExecutionBlocks', () => {
  it('should strip single code_execution line', () => {
    const input = `code_execution {"code":"import os; print(os.getcwd())"}`;
    expect(stripCodeExecutionBlocks(input)).toBe('');
  });

  it('should strip multiple code_execution lines', () => {
    const input = [
      `code_execution {"code":"import os; print(os.getcwd())"}`,
      `code_execution {"code":"import os; print(os.listdir('.'))"}`,
      `code_execution {"code":"print('hello')"}`,
    ].join('\n');
    expect(stripCodeExecutionBlocks(input)).toBe('');
  });

  it('should strip code_execution lines while preserving surrounding text', () => {
    const input = [
      `code_execution {"code":"import os; print(os.getcwd())"}`,
      `code_execution {"code":"import os; print(os.listdir('.'))"}`,
      '你好, 很高兴见到你。我是 Gemini CLI。',
      '',
      '请告诉我你今天想处理的具体需求。',
    ].join('\n');
    const expected = ['你好, 很高兴见到你。我是 Gemini CLI。', '', '请告诉我你今天想处理的具体需求。'].join('\n');
    expect(stripCodeExecutionBlocks(input)).toBe(expected);
  });

  it('should strip code_execution_result lines', () => {
    const input = [
      `code_execution {"code":"print(1+1)"}`,
      `code_execution_result {"output":"2"}`,
      'The answer is 2.',
    ].join('\n');
    expect(stripCodeExecutionBlocks(input)).toBe('The answer is 2.');
  });

  it('should not strip text that merely contains "code_execution" as a substring', () => {
    const input = 'The code_execution feature allows running Python code.';
    expect(stripCodeExecutionBlocks(input)).toBe(input);
  });

  it('should collapse excessive blank lines after stripping', () => {
    const input = [`code_execution {"code":"import os"}`, '', '', '', 'Hello world'].join('\n');
    expect(stripCodeExecutionBlocks(input)).toBe('Hello world');
  });

  it('should return empty string when input is only code_execution blocks', () => {
    const input = [
      `code_execution {"code":"import os; print(os.getcwd())"}`,
      `code_execution {"code":"import os; print(os.listdir('.'))"}`,
    ].join('\n');
    expect(stripCodeExecutionBlocks(input)).toBe('');
  });

  it('should handle text with no code_execution blocks unchanged', () => {
    const input = 'This is a normal response with no special blocks.';
    expect(stripCodeExecutionBlocks(input)).toBe(input);
  });

  it('should handle code_execution with complex JSON content', () => {
    const input = `code_execution {"code":"import os; print(os.listdir('.gemini')) if os.path.exists('.gemini') else print('No .gemini dir')"}`;
    expect(stripCodeExecutionBlocks(input)).toBe('');
  });

  it('should handle interleaved code_execution and text lines', () => {
    const input = [
      `code_execution {"code":"x = 1"}`,
      `code_execution_result {"output":""}`,
      `code_execution {"code":"print(x + 1)"}`,
      `code_execution_result {"output":"2"}`,
      'Based on the calculation, the result is 2.',
    ].join('\n');
    expect(stripCodeExecutionBlocks(input)).toBe('Based on the calculation, the result is 2.');
  });
});
