/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import OfficeWatchViewer from './OfficeWatchViewer';

interface ExcelPreviewProps {
  filePath?: string;
  content?: string;
}

const ExcelPreview: React.FC<ExcelPreviewProps> = (props) => <OfficeWatchViewer docType='excel' {...props} />;

export default ExcelPreview;
