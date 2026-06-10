/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const DISMISSED_KEY = 'chisl.connectWizard.dismissed';

/** Whether the user has explicitly skipped the connect wizard. */
export const isConnectWizardDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

/** Persist the "skip for now" dismissal so the wizard does not resurface. */
export const dismissConnectWizard = (): void => {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // localStorage unavailable
  }
};

/**
 * Clear the dismissal flag so the wizard can resurface on the next
 * zero-agent visit. Called when the wizard completes successfully from
 * any source (first-run or settings relaunch).
 */
export const clearConnectWizardDismissal = (): void => {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // localStorage unavailable
  }
};
