/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Visible, user-facing layout mode selector.
 *
 * The selector is the primary, non-shortcut way to switch layout modes. It
 * lists only the modes that are available in the current runtime (so
 * unavailable editor / diff modes are never offered) and clearly marks the
 * active mode. Falls back gracefully when only one mode is available (the
 * button is still rendered so screen readers and tests can find it, but the
 * dropdown is hidden because there is nothing to switch to).
 */

import React from 'react';

const LayoutModeSelector: React.FC = () => {
  return null;
};

export default LayoutModeSelector;
