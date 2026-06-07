/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export type ModelSelectorDropdownContextValue = {
  close: () => void;
  active: boolean;
  /** Max height of the anchored popup shell (px). */
  panelMaxHeight: number;
};

export const ModelSelectorDropdownContext = React.createContext<ModelSelectorDropdownContextValue>({
  close: () => {},
  active: false,
  panelMaxHeight: 400,
});
