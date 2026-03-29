/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import OfficeWatchViewer from './OfficeWatchViewer';

interface OfficeDocPreviewProps {
  filePath?: string;
  content?: string;
}

const OfficeDocPreview: React.FC<OfficeDocPreviewProps> = (props) => <OfficeWatchViewer docType='word' {...props} />;

export default OfficeDocPreview;
