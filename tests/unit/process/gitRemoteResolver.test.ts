/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseGitHubRemoteUrl, parseGitRemotesOutput } from '@/process/services/github/gitRemoteResolver';

describe('gitRemoteResolver', () => {
  describe('parseGitHubRemoteUrl', () => {
    it('parses ssh git url', () => {
      const parsed = parseGitHubRemoteUrl('git@github.com:iOfficeAI/AionUi.git');
      expect(parsed).toEqual({ owner: 'iOfficeAI', repo: 'AionUi' });
    });

    it('parses ssh git url without .git extension', () => {
      const parsed = parseGitHubRemoteUrl('git@github.com:EduCosta85/AionUi');
      expect(parsed).toEqual({ owner: 'EduCosta85', repo: 'AionUi' });
    });

    it('parses https git url', () => {
      const parsed = parseGitHubRemoteUrl('https://github.com/facebook/react.git');
      expect(parsed).toEqual({ owner: 'facebook', repo: 'react' });
    });

    it('parses https git url with auth token and trailing slash', () => {
      const parsed = parseGitHubRemoteUrl('https://token@github.com/octocat/Hello-World.git');
      expect(parsed).toEqual({ owner: 'octocat', repo: 'Hello-World' });
    });

    it('returns null for non-github urls', () => {
      expect(parseGitHubRemoteUrl('https://gitlab.com/owner/repo.git')).toBeNull();
      expect(parseGitHubRemoteUrl('https://bitbucket.org/owner/repo.git')).toBeNull();
      expect(parseGitHubRemoteUrl('')).toBeNull();
    });
  });

  describe('parseGitRemotesOutput', () => {
    it('parses multi-remote git output and prioritizes upstream then origin', () => {
      const output = `
origin\tgit@github.com:EduCosta85/AionUi.git (fetch)
origin\tgit@github.com:EduCosta85/AionUi.git (push)
upstream\tgit@github.com:iOfficeAI/AionUi.git (fetch)
upstream\tgit@github.com:iOfficeAI/AionUi.git (push)
other\thttps://github.com/someone/other.git (fetch)
`;
      const remotes = parseGitRemotesOutput(output);
      expect(remotes).toHaveLength(3);
      expect(remotes[0].remoteName).toBe('upstream');
      expect(remotes[0].owner).toBe('iOfficeAI');
      expect(remotes[0].repo).toBe('AionUi');

      expect(remotes[1].remoteName).toBe('origin');
      expect(remotes[1].owner).toBe('EduCosta85');
      expect(remotes[1].repo).toBe('AionUi');

      expect(remotes[2].remoteName).toBe('other');
    });

    it('handles empty or non-matching git remote output', () => {
      expect(parseGitRemotesOutput('')).toEqual([]);
      expect(parseGitRemotesOutput('origin\thttps://gitlab.com/my/project.git (fetch)')).toEqual([]);
    });
  });

  describe('detectGitHubRemotes', () => {
    it('returns empty array when cwd is undefined', async () => {
      const { detectGitHubRemotes } = await import('@/process/services/github/gitRemoteResolver');
      const remotes = await detectGitHubRemotes(undefined);
      expect(remotes).toEqual([]);
    });

    it('detects remotes in existing workspace cwd', async () => {
      const { detectGitHubRemotes } = await import('@/process/services/github/gitRemoteResolver');
      const remotes = await detectGitHubRemotes(process.cwd());
      expect(Array.isArray(remotes)).toBe(true);
      expect(remotes.length).toBeGreaterThan(0);
    });

    it('handles invalid directory gracefully and returns empty array', async () => {
      const { detectGitHubRemotes } = await import('@/process/services/github/gitRemoteResolver');
      const remotes = await detectGitHubRemotes('/non/existent/directory/12345');
      expect(remotes).toEqual([]);
    });
  });
});
