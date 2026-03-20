/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFileRefs } from '../../../src/process/extensions/resolvers/utils/fileResolver';

describe('extensions/fileResolver', () => {
  let extensionDir = '';
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    extensionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-ext-file-resolver-'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await fs.rm(extensionDir, { recursive: true, force: true });
  });

  it('应解析文本文件引用并去除末尾换行', async () => {
    await fs.writeFile(path.join(extensionDir, 'prompt.txt'), 'hello world\n', 'utf-8');

    const result = await resolveFileRefs('$file:prompt.txt', extensionDir);

    expect(result).toBe('hello world');
  });

  it('应支持 JSON/JSONC 中的嵌套 $file 引用', async () => {
    await fs.mkdir(path.join(extensionDir, 'meta'), { recursive: true });
    await fs.writeFile(path.join(extensionDir, 'meta', 'title.txt'), 'My Title\n', 'utf-8');
    await fs.writeFile(path.join(extensionDir, 'meta', 'name.txt'), 'Alice\n', 'utf-8');
    await fs.writeFile(path.join(extensionDir, 'data.json'), '{"name":"$file:meta/name.txt"}', 'utf-8');
    await fs.writeFile(
      path.join(extensionDir, 'config.jsonc'),
      `{
        // with comment
        "title": "$file:meta/title.txt",
        "items": ["$file:data.json", "plain"]
      }`,
      'utf-8'
    );

    const result = await resolveFileRefs({ config: '$file:config.jsonc' }, extensionDir);

    expect(result).toEqual({
      config: {
        title: 'My Title',
        items: [{ name: 'Alice' }, 'plain'],
      },
    });
  });

  it('应阻止目录穿越并保留原始引用', async () => {
    const outsideFile = path.join(path.dirname(extensionDir), 'outside.txt');
    await fs.writeFile(outsideFile, 'outside', 'utf-8');

    const result = await resolveFileRefs('$file:../outside.txt', extensionDir);

    expect(result).toBe('$file:../outside.txt');
    expect(warnSpy).toHaveBeenCalled();

    await fs.rm(outsideFile, { force: true });
  });

  it('应在循环引用时回退为原始引用字符串', async () => {
    await fs.writeFile(path.join(extensionDir, 'a.json'), '{"next":"$file:b.json"}', 'utf-8');
    await fs.writeFile(path.join(extensionDir, 'b.json'), '{"next":"$file:a.json"}', 'utf-8');

    const result = await resolveFileRefs('$file:a.json', extensionDir);

    expect(result).toEqual({
      next: {
        next: '$file:a.json',
      },
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('应在文件不存在时保留原始引用', async () => {
    const result = await resolveFileRefs('$file:not-exists.txt', extensionDir);

    expect(result).toBe('$file:not-exists.txt');
    expect(warnSpy).toHaveBeenCalled();
  });
});
