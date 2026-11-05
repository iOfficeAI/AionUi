/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { gitHubService } from '../services/github';

export function initGithubBridge(): void {
  ipcBridge.github.getRepo.provider(async (req) => {
    return await gitHubService.getRepoInfo(req?.cwd, req?.project_id);
  });

  ipcBridge.github.setRepo.provider(async (req) => {
    gitHubService.setRepoInfo(req.project_id, req.owner, req.repo);
  });

  ipcBridge.github.setToken.provider(async (req) => {
    gitHubService.setToken(req.token);
  });

  ipcBridge.github.listIssues.provider(async (req) => {
    return await gitHubService.listIssues(req, req.cwd, req.project_id);
  });

  ipcBridge.github.createIssue.provider(async (req) => {
    return await gitHubService.createIssue(req, req.cwd, req.project_id);
  });

  ipcBridge.github.getIssue.provider(async (req) => {
    return await gitHubService.getIssue(req.number, req.owner, req.repo, req.cwd, req.project_id);
  });
}
