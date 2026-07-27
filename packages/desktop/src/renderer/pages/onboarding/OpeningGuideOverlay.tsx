/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visibility-controlled wrapper around {@link OpeningGuide}, for replaying the
 * opening animation on demand (e.g. a "Replay opening animation" button in
 * Settings). It renders nothing when hidden and does NOT touch the
 * first-launch "seen" flag — closing it simply calls `onClose`.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <Button onClick={() => setOpen(true)}>重新播放开机动画</Button>
 *   <OpeningGuideOverlay visible={open} onClose={() => setOpen(false)} />
 */

import React from 'react';
import OpeningGuide from './OpeningGuide';

export type OpeningGuideOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

const OpeningGuideOverlay: React.FC<OpeningGuideOverlayProps> = ({ visible, onClose }) => {
  if (!visible) return null;
  return <OpeningGuide onFinish={onClose} />;
};

export default OpeningGuideOverlay;
