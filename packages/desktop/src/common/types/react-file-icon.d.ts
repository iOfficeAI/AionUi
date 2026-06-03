declare module 'react-file-icon' {
  import type { FC } from 'react';

  export type FileIconProps = {
    extension?: string;
    color?: string;
    fold?: boolean;
    foldColor?: string;
    glyphColor?: string;
    gradientColor?: string;
    gradientOpacity?: number;
    labelColor?: string;
    labelTextColor?: string;
    labelUppercase?: boolean;
    radius?: number;
    type?: 'image' | 'document' | 'spreadsheet' | 'vector' | 'audio' | 'compressed' | 'binary' | 'presentation' | 'code' | 'settings' | 'video' | '3d' | 'acrobat' | 'font' | 'drive' | 'database';
  };

  export const FileIcon: FC<FileIconProps>;
  export const defaultStyles: Record<string, FileIconProps>;
}
