import { describe, expect, it } from 'vitest';

import type { Entry, FactCache, PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import {
  ancestorRels,
  applyDelta,
  applySnapshot,
  buildRemoveRequest,
  buildRenameRequest,
  buildTreeData,
  canRemoveRoot,
  deriveWant,
  isDescendantOrSelf,
  joinRel,
  keyToRef,
  migrateKey,
  parentRel,
  peKey,
  reconcileDiff,
  subtreeKeys,
} from '@/renderer/pages/conversation/explorer/explorerModel';

const set = (...keys: PeKey[]): Set<PeKey> => new Set(keys);
const file = (name: string): Entry => ({ name, kind: 'file' });
const dir = (name: string): Entry => ({ name, kind: 'dir' });

// ── PeKey identity ──────────────────────────────────────────────────────────

describe('PeKey', () => {
  it('round-trips pe_id + relative_path including nested and root', () => {
    expect(keyToRef(peKey('pe1', 'a/b/c'))).toEqual({ pe_id: 'pe1', relative_path: 'a/b/c' });
    expect(keyToRef(peKey('pe1', ''))).toEqual({ pe_id: 'pe1', relative_path: '' });
  });

  it('splits on the NUL separator even when pe_id itself contains slashes', () => {
    // Tripwire: with SEP='/', keyToRef would split at the first slash and mangle
    // pe_id → { pe_id: 'pe', relative_path: 'with/slash\0a/b' }. The NUL split
    // keeps the pe_id intact regardless of slashes inside it.
    const key = peKey('pe/with/slash', 'a/b');
    expect(keyToRef(key)).toEqual({ pe_id: 'pe/with/slash', relative_path: 'a/b' });
  });

  it('does not collide two distinct (pe_id, relative_path) pairs that a slash separator would merge', () => {
    // With SEP='/', both would serialize to 'a/b/c' and become indistinguishable.
    // The NUL separator keeps them apart.
    expect(peKey('a', 'b/c')).not.toBe(peKey('a/b', 'c'));
    expect(keyToRef(peKey('a', 'b/c'))).toEqual({ pe_id: 'a', relative_path: 'b/c' });
    expect(keyToRef(peKey('a/b', 'c'))).toEqual({ pe_id: 'a/b', relative_path: 'c' });
  });

  it('joinRel joins with / and treats root as no prefix', () => {
    expect(joinRel('', 'src')).toBe('src');
    expect(joinRel('src', 'main.ts')).toBe('src/main.ts');
  });
});

// ── ancestors / want ─────────────────────────────────────────────────────────

describe('ancestorRels', () => {
  it('root has no ancestors', () => {
    expect(ancestorRels('')).toEqual([]);
  });
  it('lists parents down to root', () => {
    expect(ancestorRels('a')).toEqual(['']);
    expect(ancestorRels('a/b/c')).toEqual(['a/b', 'a', '']);
  });
});

describe('deriveWant', () => {
  it('root is wanted iff expanded (no ancestor rule)', () => {
    expect(deriveWant(set(peKey('pe1', '')))).toEqual(set(peKey('pe1', '')));
  });

  it('nested dir wanted only when full ancestor chain is expanded', () => {
    const expanded = set(peKey('pe1', ''), peKey('pe1', 'a'), peKey('pe1', 'a/b'));
    expect(deriveWant(expanded)).toEqual(expanded);
  });

  it('drops a dir whose ancestor is collapsed (gap → not visible)', () => {
    // 'a/b' expanded but 'a' is not → 'a/b' is off-screen → excluded from want.
    const expanded = set(peKey('pe1', ''), peKey('pe1', 'a/b'));
    expect(deriveWant(expanded)).toEqual(set(peKey('pe1', '')));
  });

  it('treats each pe independently', () => {
    const expanded = set(peKey('pe1', ''), peKey('pe2', ''), peKey('pe2', 'x'));
    expect(deriveWant(expanded)).toEqual(expanded);
  });
});

describe('reconcileDiff', () => {
  it('computes toAdd = want − current and toRemove = current − want', () => {
    const want = set(peKey('pe1', ''), peKey('pe1', 'a'));
    const current = set(peKey('pe1', ''), peKey('pe1', 'old'));
    const diff = reconcileDiff(want, current);
    expect(diff.toAdd).toEqual([peKey('pe1', 'a')]);
    expect(diff.toRemove).toEqual([peKey('pe1', 'old')]);
  });

  it('is empty when want equals current', () => {
    const s = set(peKey('pe1', ''));
    expect(reconcileDiff(s, s)).toEqual({ toAdd: [], toRemove: [] });
  });
});

// ── fact cache ───────────────────────────────────────────────────────────────

describe('applySnapshot', () => {
  it('replaces the listing and returns a new cache (immutable)', () => {
    const cache: FactCache = new Map([[peKey('pe1', ''), [file('old.txt')]]]);
    const next = applySnapshot(cache, peKey('pe1', ''), [dir('src'), file('README.md')]);
    expect(next.get(peKey('pe1', ''))?.map((e) => e.name)).toEqual(['src', 'README.md']);
    expect(cache.get(peKey('pe1', ''))?.map((e) => e.name)).toEqual(['old.txt']); // original untouched
  });
});

describe('applyDelta', () => {
  const key = peKey('pe1', 'src');
  const base = (): FactCache => new Map([[key, [file('a.ts'), dir('sub')]]]);

  it('added appends (and dedups by name)', () => {
    const next = applyDelta(base(), key, [{ op: 'added', name: 'b.ts', kind: 'file' }]);
    expect(
      next
        .get(key)
        ?.map((e) => e.name)
        .toSorted()
    ).toEqual(['a.ts', 'b.ts', 'sub']);
  });

  it('removed drops the entry', () => {
    const next = applyDelta(base(), key, [{ op: 'removed', name: 'a.ts' }]);
    expect(next.get(key)?.map((e) => e.name)).toEqual(['sub']);
  });

  it('renamed changes the name in place', () => {
    const next = applyDelta(base(), key, [{ op: 'renamed', from: 'a.ts', to: 'c.ts' }]);
    expect(
      next
        .get(key)
        ?.map((e) => e.name)
        .toSorted()
    ).toEqual(['c.ts', 'sub']);
  });

  it('leaves an uncached directory untouched', () => {
    const cache = base();
    const next = applyDelta(cache, peKey('pe1', 'unknown'), [{ op: 'added', name: 'x', kind: 'file' }]);
    expect(next).toBe(cache);
  });

  it('renamed from a non-existent name is a no-op on the listing', () => {
    const next = applyDelta(base(), key, [{ op: 'renamed', from: 'ghost.ts', to: 'c.ts' }]);
    expect(
      next
        .get(key)
        ?.map((e) => e.name)
        .toSorted()
    ).toEqual(['a.ts', 'sub']);
  });

  it('removed of a non-existent name leaves the listing unchanged', () => {
    const next = applyDelta(base(), key, [{ op: 'removed', name: 'ghost.ts' }]);
    expect(
      next
        .get(key)
        ?.map((e) => e.name)
        .toSorted()
    ).toEqual(['a.ts', 'sub']);
  });

  it('added of an existing name replaces its kind (file → dir)', () => {
    const next = applyDelta(base(), key, [{ op: 'added', name: 'a.ts', kind: 'dir' }]);
    const entry = next.get(key)?.find((e) => e.name === 'a.ts');
    expect(entry?.kind).toBe('dir');
    // Still a single entry for that name (added dedups by name before pushing).
    expect(next.get(key)?.filter((e) => e.name === 'a.ts')).toHaveLength(1);
  });

  it('renamed onto an already-existing name dedups (single entry, no dup React key)', () => {
    // Renaming 'a.ts' → 'sub' (which already exists) drops the stale 'sub' so the
    // projection never yields two entries sharing a name/key. The renamed source
    // wins; a later authoritative snapshot still reconciles the true listing.
    const next = applyDelta(base(), key, [{ op: 'renamed', from: 'a.ts', to: 'sub' }]);
    const subs = next.get(key)?.filter((e) => e.name === 'sub');
    expect(subs).toHaveLength(1);
    expect(subs?.[0].kind).toBe('file'); // the renamed 'a.ts' (a file) occupies the name
    expect(next.get(key)?.map((e) => e.name)).toEqual(['sub']);
  });

  it('renamed onto an existing name is still a no-op when the source is absent', () => {
    // `from` missing → nothing to rename → the existing target is left intact
    // (the dedup only fires when the rename actually creates the target).
    const next = applyDelta(base(), key, [{ op: 'renamed', from: 'ghost.ts', to: 'sub' }]);
    expect(
      next
        .get(key)
        ?.map((e) => e.name)
        .toSorted()
    ).toEqual(['a.ts', 'sub']);
  });
});

// ── anti-stale: descendant / subtree / migrate ───────────────────────────────

describe('isDescendantOrSelf', () => {
  it('matches self and descendants within the same pe', () => {
    expect(isDescendantOrSelf(peKey('pe1', 'a'), peKey('pe1', 'a'))).toBe(true);
    expect(isDescendantOrSelf(peKey('pe1', 'a/b'), peKey('pe1', 'a'))).toBe(true);
    expect(isDescendantOrSelf(peKey('pe1', 'ab'), peKey('pe1', 'a'))).toBe(false); // prefix, not path segment
  });
  it('root ancestor matches the whole pe but not other pes', () => {
    expect(isDescendantOrSelf(peKey('pe1', 'a/b'), peKey('pe1', ''))).toBe(true);
    expect(isDescendantOrSelf(peKey('pe2', 'a'), peKey('pe1', ''))).toBe(false);
  });
});

describe('subtreeKeys (removed cascade)', () => {
  it('collects the removed dir and all descendants, leaving siblings', () => {
    const keys = [peKey('pe1', 'a'), peKey('pe1', 'a/b'), peKey('pe1', 'a/b/c'), peKey('pe1', 'other')];
    expect(subtreeKeys(keys, peKey('pe1', 'a')).toSorted()).toEqual(
      [peKey('pe1', 'a'), peKey('pe1', 'a/b'), peKey('pe1', 'a/b/c')].toSorted()
    );
  });
});

describe('migrateKey (renamed migration)', () => {
  it('rewrites self and descendants from old prefix to new', () => {
    const from = peKey('pe1', 'a');
    const to = peKey('pe1', 'z');
    expect(migrateKey(peKey('pe1', 'a'), from, to)).toBe(peKey('pe1', 'z'));
    expect(migrateKey(peKey('pe1', 'a/b/c'), from, to)).toBe(peKey('pe1', 'z/b/c'));
  });
  it('leaves unrelated keys and other pes untouched', () => {
    const from = peKey('pe1', 'a');
    const to = peKey('pe1', 'z');
    expect(migrateKey(peKey('pe1', 'other'), from, to)).toBe(peKey('pe1', 'other'));
    expect(migrateKey(peKey('pe2', 'a'), from, to)).toBe(peKey('pe2', 'a'));
  });
});

// ── projection ───────────────────────────────────────────────────────────────

describe('buildTreeData', () => {
  const roots = [{ pe_id: 'pe1', title: 'app' }];

  it('renders a root with no children when unexpanded', () => {
    const tree = buildTreeData(new Map(), new Set(), roots);
    expect(tree).toEqual([{ key: peKey('pe1', ''), title: 'app', isLeaf: false }]);
  });

  it('pulls one level for an expanded root; files are leaves', () => {
    const cache: FactCache = new Map([[peKey('pe1', ''), [dir('src'), file('README.md')]]]);
    const tree = buildTreeData(cache, set(peKey('pe1', '')), roots);
    expect(tree[0].children).toEqual([
      { key: peKey('pe1', 'src'), title: 'src', isLeaf: false },
      { key: peKey('pe1', 'README.md'), title: 'README.md', isLeaf: true },
    ]);
  });

  it('descends only expanded directories (lazy)', () => {
    const cache: FactCache = new Map([
      [peKey('pe1', ''), [dir('src')]],
      [peKey('pe1', 'src'), [file('main.ts')]],
    ]);
    // Root expanded but 'src' not → 'src' node present, no children.
    const collapsed = buildTreeData(cache, set(peKey('pe1', '')), roots);
    expect(collapsed[0].children?.[0]).toEqual({ key: peKey('pe1', 'src'), title: 'src', isLeaf: false });

    // Both expanded → 'src' descends to its listing.
    const expanded = buildTreeData(cache, set(peKey('pe1', ''), peKey('pe1', 'src')), roots);
    expect(expanded[0].children?.[0].children).toEqual([
      { key: peKey('pe1', 'src/main.ts'), title: 'main.ts', isLeaf: true },
    ]);
  });

  it('marks excluded entries', () => {
    const cache: FactCache = new Map([[peKey('pe1', ''), [{ name: 'node_modules', kind: 'dir', excluded: true }]]]);
    const tree = buildTreeData(cache, set(peKey('pe1', '')), roots);
    expect(tree[0].children?.[0].excluded).toBe(true);
  });

  it('renders multiple roots independently', () => {
    const tree = buildTreeData(new Map(), new Set(), [
      { pe_id: 'pe1', title: 'app' },
      { pe_id: 'pe2', title: 'lib' },
    ]);
    expect(tree.map((n) => n.key)).toEqual([peKey('pe1', ''), peKey('pe2', '')]);
  });

  // Tripwire: children display order is directories-first (symlinks grouped with
  // files), each group by name case-insensitively — regardless of the backend's
  // snapshot order. Mutation-verified: removing the dir-priority makes dirs
  // interleave with files (2 assertions fail); replacing the case-insensitive
  // name compare with a naive codepoint compare (uppercase before lowercase)
  // reorders the file group and fails the expected order below.
  const symlink = (name: string): Entry => ({ name, kind: 'symlink' });

  it('orders children directories-first, then files/symlinks, each case-insensitive by name', () => {
    const scrambled: Entry[] = [
      file('Banana.txt'),
      dir('src'),
      file('apple.md'),
      dir('Zebra'),
      symlink('link.sh'),
      file('README.md'),
      dir('assets'),
    ];
    const cache: FactCache = new Map([[peKey('pe1', ''), scrambled]]);
    const tree = buildTreeData(cache, set(peKey('pe1', '')), roots);
    const titles = (tree[0].children ?? []).map((n) => n.title);

    // dirs (case-insensitive alpha), then files+symlink (case-insensitive alpha)
    expect(titles).toEqual(['assets', 'src', 'Zebra', 'apple.md', 'Banana.txt', 'link.sh', 'README.md']);

    // Explicit group boundary: every dir precedes every non-dir.
    const kindByTitle = new Map(scrambled.map((e) => [e.name, e.kind]));
    const lastDirIdx = titles.map((t) => kindByTitle.get(t) === 'dir').lastIndexOf(true);
    const firstNonDirIdx = titles.findIndex((t) => kindByTitle.get(t) !== 'dir');
    expect(lastDirIdx).toBeLessThan(firstNonDirIdx);
  });

  it('does not reorder pe roots (kept in backend order_index)', () => {
    const tree = buildTreeData(new Map(), new Set(), [
      { pe_id: 'peZ', title: 'zzz' },
      { pe_id: 'peA', title: 'aaa' },
    ]);
    // roots stay as given (not alphabetized) — only children are sorted.
    expect(tree.map((n) => n.title)).toEqual(['zzz', 'aaa']);
  });
});

// ── additional edge coverage (Reviewer ⚪) ────────────────────────────────────

describe('edge coverage', () => {
  const roots = [{ pe_id: 'pe1', title: 'app' }];

  it('applyDelta added carries the excluded flag', () => {
    const key = peKey('pe1', '');
    const cache: FactCache = new Map([[key, []]]);
    const next = applyDelta(cache, key, [{ op: 'added', name: 'node_modules', kind: 'dir', excluded: true }]);
    expect(next.get(key)?.find((e) => e.name === 'node_modules')?.excluded).toBe(true);
  });

  it('deriveWant drops a deep dir when a middle ancestor is collapsed', () => {
    // 'a' and 'a/b/c' expanded, but 'a/b' is not → 'a/b/c' off-screen.
    const expanded = set(peKey('pe1', ''), peKey('pe1', 'a'), peKey('pe1', 'a/b/c'));
    expect(deriveWant(expanded)).toEqual(set(peKey('pe1', ''), peKey('pe1', 'a')));
  });

  it('migrateKey with an empty from-prefix rewrites only the exact root, not descendants', () => {
    const from = peKey('pe1', '');
    const to = peKey('pe1', 'z');
    expect(migrateKey(peKey('pe1', ''), from, to)).toBe(peKey('pe1', 'z'));
    expect(migrateKey(peKey('pe1', 'a'), from, to)).toBe(peKey('pe1', 'a'));
  });

  it('buildTreeData marks a symlink as a leaf', () => {
    const cache: FactCache = new Map([[peKey('pe1', ''), [{ name: 'link', kind: 'symlink' }]]]);
    const tree = buildTreeData(cache, set(peKey('pe1', '')), roots);
    expect(tree[0].children?.[0]).toMatchObject({ key: peKey('pe1', 'link'), title: 'link', isLeaf: true });
  });

  it('buildTreeData descends an expanded excluded directory (manual expand is not blocked)', () => {
    const cache: FactCache = new Map([
      [peKey('pe1', ''), [{ name: 'node_modules', kind: 'dir', excluded: true }]],
      [peKey('pe1', 'node_modules'), [file('index.js')]],
    ]);
    const tree = buildTreeData(cache, set(peKey('pe1', ''), peKey('pe1', 'node_modules')), roots);
    expect(tree[0].children?.[0].children).toEqual([
      { key: peKey('pe1', 'node_modules/index.js'), title: 'index.js', isLeaf: true },
    ]);
  });

  it('projects role + runtimeStatus onto root nodes, not onto children', () => {
    const cache: FactCache = new Map([[peKey('pe1', ''), [dir('sub'), file('a.ts')]]]);
    const tree = buildTreeData(cache, set(peKey('pe1', '')), [
      { pe_id: 'pe1', title: 'app', role: 'workspace', runtimeStatus: 'missing' },
    ]);
    expect(tree[0].role).toBe('workspace');
    expect(tree[0].runtimeStatus).toBe('missing');
    // Children never carry root-only metadata.
    for (const child of tree[0].children ?? []) {
      expect(child.role).toBeUndefined();
      expect(child.runtimeStatus).toBeUndefined();
    }
  });

  it('omits role/runtimeStatus on the root node when the RootRef does not carry them', () => {
    const tree = buildTreeData(new Map(), set(), [{ pe_id: 'pe1', title: 'app' }]);
    expect(tree[0].role).toBeUndefined();
    expect(tree[0].runtimeStatus).toBeUndefined();
  });
});

describe('canRemoveRoot', () => {
  it('allows removing an attached root', () => {
    expect(canRemoveRoot('attached', 'peA', 'peW')).toBe(true);
  });

  it('forbids removing the workspace root (by role)', () => {
    expect(canRemoveRoot('workspace', 'peW', 'peW')).toBe(false);
  });

  it('forbids removing a root whose pe_id equals the workspace pe_id (defensive, even if mislabeled attached)', () => {
    expect(canRemoveRoot('attached', 'peW', 'peW')).toBe(false);
  });

  it('forbids removing when role is undefined', () => {
    expect(canRemoveRoot(undefined, 'peA', 'peW')).toBe(false);
  });
});

describe('parentRel', () => {
  it('returns the parent dir of a nested path', () => {
    expect(parentRel('a/b/c.txt')).toBe('a/b');
  });

  it('returns empty string for a top-level entry (no separator)', () => {
    expect(parentRel('file.txt')).toBe('');
  });
});

describe('buildRenameRequest — rename request builder (parity with legacy tree)', () => {
  const pe = 'peX';

  it('builds fs/rename from the original path to the renamed sibling', () => {
    const req = buildRenameRequest({ peId: pe, targetDir: 'docs', origRel: 'docs/old.md' }, 'new.md');
    expect(req).toEqual({
      method: 'fs/rename',
      params: { from: { pe_id: pe, relative_path: 'docs/old.md' }, to: { pe_id: pe, relative_path: 'docs/new.md' } },
    });
  });

  it('renames a top-level entry (empty targetDir)', () => {
    const req = buildRenameRequest({ peId: pe, targetDir: '', origRel: 'a.md' }, 'b.md');
    expect(req).toEqual({
      method: 'fs/rename',
      params: { from: { pe_id: pe, relative_path: 'a.md' }, to: { pe_id: pe, relative_path: 'b.md' } },
    });
  });

  it('returns null for an empty / whitespace-only name (no round-trip)', () => {
    expect(buildRenameRequest({ peId: pe, targetDir: 'docs', origRel: 'docs/x.md' }, '   ')).toBeNull();
  });

  it('returns null for a rename whose target equals the original (no-op)', () => {
    const req = buildRenameRequest({ peId: pe, targetDir: 'docs', origRel: 'docs/same.md' }, 'same.md');
    expect(req).toBeNull();
  });

  it('trims the name before building the path', () => {
    const req = buildRenameRequest({ peId: pe, targetDir: 'docs', origRel: 'docs/x.md' }, '  y.md  ');
    expect(req).toEqual({
      method: 'fs/rename',
      params: { from: { pe_id: pe, relative_path: 'docs/x.md' }, to: { pe_id: pe, relative_path: 'docs/y.md' } },
    });
  });
});

describe('buildRemoveRequest', () => {
  it('builds fs/remove targeting the entry', () => {
    expect(buildRemoveRequest('peY', 'a/b.txt')).toEqual({
      method: 'fs/remove',
      params: { target: { pe_id: 'peY', relative_path: 'a/b.txt' } },
    });
  });
});
