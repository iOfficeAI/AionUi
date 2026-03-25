/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  sortByDependencyOrder,
  validateDependencies,
} from '../../../src/process/extensions/resolvers/utils/dependencyResolver';

describe('extensions/dependencyResolver', () => {
  it('应在依赖满足时返回有效结果，并给出正确加载顺序', () => {
    const extensions = [
      { name: 'feature', version: '2.0.0', dependencies: { ui: '~0.5.0' } },
      { name: 'core', version: '1.2.0' },
      { name: 'ui', version: '0.5.3', dependencies: { core: '^1.0.0' } },
    ];

    const result = validateDependencies(extensions);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.loadOrder.indexOf('core')).toBeLessThan(result.loadOrder.indexOf('ui'));
    expect(result.loadOrder.indexOf('ui')).toBeLessThan(result.loadOrder.indexOf('feature'));
  });

  it('应报告缺失依赖与版本不匹配问题', () => {
    const extensions = [
      { name: 'consumer', version: '1.0.0', dependencies: { missing: '^1.0.0', provider: '^0.0.3' } },
      { name: 'provider', version: '0.0.4' },
    ];

    const result = validateDependencies(extensions);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missing',
          extensionName: 'consumer',
          dependencyName: 'missing',
          requiredVersion: '^1.0.0',
        }),
        expect.objectContaining({
          type: 'version_mismatch',
          extensionName: 'consumer',
          dependencyName: 'provider',
          requiredVersion: '^0.0.3',
          installedVersion: '0.0.4',
        }),
      ])
    );
  });

  it('应检测循环依赖', () => {
    const extensions = [
      { name: 'a', version: '1.0.0', dependencies: { b: '^1.0.0' } },
      { name: 'b', version: '1.0.0', dependencies: { a: '^1.0.0' } },
    ];

    const result = validateDependencies(extensions);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'circular',
        }),
      ])
    );
  });

  it('sortByDependencyOrder 应按 loadOrder 排序，未知项置于末尾', () => {
    const sorted = sortByDependencyOrder(
      [
        { name: 'a', version: '1.0.0' },
        { name: 'unknown', version: '1.0.0' },
        { name: 'b', version: '1.0.0' },
      ],
      ['b', 'a']
    );

    expect(sorted.map((item) => item.name)).toEqual(['b', 'a', 'unknown']);
  });
});
