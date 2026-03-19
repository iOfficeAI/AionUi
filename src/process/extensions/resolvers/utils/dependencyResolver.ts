/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type ParsedVersion = { major: number; minor: number; patch: number };

function parseVersion(version: string): ParsedVersion | null {
  const clean = version.replace(/^[\^~]/, '');
  const parts = clean.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

function satisfiesVersion(version: string, range: string): boolean {
  const parsedVersion = parseVersion(version);
  const parsedRange = parseVersion(range);
  if (!parsedVersion || !parsedRange) return false;
  if (range === version) return true;

  if (range.startsWith('^')) {
    // Per semver spec: ^0.x.y is special
    // ^0.0.z  → only matches exact z  (equivalent to =0.0.z)
    // ^0.y.z  → matches 0.y.z .. 0.y.* (equivalent to ~0.y.z)
    // ^X.y.z  (X>=1) → matches X.y.z .. X.*.*
    if (parsedRange.major === 0) {
      if (parsedRange.minor === 0) {
        // ^0.0.z — must match exactly
        return parsedVersion.major === 0 && parsedVersion.minor === 0 && parsedVersion.patch === parsedRange.patch;
      }
      // ^0.y.z — same major (0) + same minor + patch >= range patch
      return (
        parsedVersion.major === 0 &&
        parsedVersion.minor === parsedRange.minor &&
        parsedVersion.patch >= parsedRange.patch
      );
    }
    return (
      parsedVersion.major === parsedRange.major &&
      (parsedVersion.minor > parsedRange.minor ||
        (parsedVersion.minor === parsedRange.minor && parsedVersion.patch >= parsedRange.patch))
    );
  }
  if (range.startsWith('~')) {
    return (
      parsedVersion.major === parsedRange.major &&
      parsedVersion.minor === parsedRange.minor &&
      parsedVersion.patch >= parsedRange.patch
    );
  }

  // Bare version (no range prefix) — exact major.minor.patch match
  return (
    parsedVersion.major === parsedRange.major &&
    parsedVersion.minor === parsedRange.minor &&
    parsedVersion.patch === parsedRange.patch
  );
}

type ExtensionMeta = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
};

type DependencyIssue = {
  type: 'missing' | 'version_mismatch' | 'circular';
  extensionName: string;
  dependencyName: string;
  requiredVersion?: string;
  installedVersion?: string;
  message: string;
};

function detectCircularDependencies(
  graph: Map<string, Set<string>>,
  start: string,
  visited: Set<string>,
  currentPath: Set<string>
): [string, string] | null {
  visited.add(start);
  currentPath.add(start);
  const deps = graph.get(start);
  if (deps) {
    for (const dep of deps) {
      if (!visited.has(dep)) {
        const cycle = detectCircularDependencies(graph, dep, visited, currentPath);
        if (cycle) return cycle;
      } else if (currentPath.has(dep)) {
        return [dep, start];
      }
    }
  }
  currentPath.delete(start);
  return null;
}

function topologicalSort(graph: Map<string, Set<string>>, nodes: string[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  function visit(node: string): void {
    if (visited.has(node)) return;
    visited.add(node);
    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        visit(dep);
      }
    }
    result.push(node);
  }
  for (const node of nodes) {
    visit(node);
  }
  return result;
}

export function validateDependencies(extensions: ExtensionMeta[]): {
  valid: boolean;
  issues: DependencyIssue[];
  loadOrder: string[];
} {
  const issues: DependencyIssue[] = [];
  const extensionMap = new Map<string, ExtensionMeta>();
  const dependencyGraph = new Map<string, Set<string>>();

  for (const ext of extensions) {
    extensionMap.set(ext.name, ext);
    dependencyGraph.set(ext.name, new Set());
    if (ext.dependencies) {
      for (const [depName] of Object.entries(ext.dependencies)) {
        dependencyGraph.get(ext.name)!.add(depName);
      }
    }
  }

  for (const ext of extensions) {
    if (!ext.dependencies) continue;
    for (const [depName, requiredVersion] of Object.entries(ext.dependencies)) {
      const dep = extensionMap.get(depName);
      if (!dep) {
        issues.push({
          type: 'missing',
          extensionName: ext.name,
          dependencyName: depName,
          requiredVersion,
          message: `Extension "${ext.name}" requires "${depName}@${requiredVersion}" which is not installed`,
        });
      } else {
        const installedVersion = dep.version;
        if (!satisfiesVersion(installedVersion, requiredVersion)) {
          issues.push({
            type: 'version_mismatch',
            extensionName: ext.name,
            dependencyName: depName,
            requiredVersion,
            installedVersion,
            message: `Extension "${ext.name}" requires "${depName}@${requiredVersion}" but version ${installedVersion} is installed`,
          });
        }
      }
    }
  }

  const visited = new Set<string>();
  for (const ext of extensions) {
    if (!visited.has(ext.name)) {
      const cycle = detectCircularDependencies(dependencyGraph, ext.name, visited, new Set());
      if (cycle) {
        issues.push({
          type: 'circular',
          extensionName: cycle[1],
          dependencyName: cycle[0],
          message: `Circular dependency detected: ${cycle[0]} -> ${cycle[1]}`,
        });
      }
    }
  }

  const loadOrder = topologicalSort(
    dependencyGraph,
    extensions.map((e) => e.name)
  );

  return {
    valid: issues.length === 0,
    issues,
    loadOrder,
  };
}

export function sortByDependencyOrder(extensions: ExtensionMeta[], loadOrder: string[]): ExtensionMeta[] {
  const orderMap = new Map(loadOrder.map((name, idx) => [name, idx]));
  return [...extensions].toSorted((a, b) => {
    const orderA = orderMap.get(a.name) ?? Infinity;
    const orderB = orderMap.get(b.name) ?? Infinity;
    return orderA - orderB;
  });
}
