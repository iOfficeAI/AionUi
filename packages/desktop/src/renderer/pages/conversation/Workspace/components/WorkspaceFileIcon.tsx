import React from 'react';
import {
  Code,
  Data,
  FileCode,
  FileText,
  FileWord,
  FolderClose,
  FolderOpen,
  ImageFiles,
  FileCode as JsonIcon,
  Magic,
  Pic,
  Play,
  Setting,
  Terminal,
  FileEditing,
  DocDetail,
  Zip,
} from '@icon-park/react';

interface WorkspaceFileIconProps {
  name: string;
  isFolder?: boolean;
  expanded?: boolean;
  size?: number;
  className?: string;
}

export const WorkspaceFileIcon: React.FC<WorkspaceFileIconProps> = ({
  name,
  isFolder,
  expanded,
  size = 14,
  className = '',
}) => {
  if (isFolder) {
    if (expanded) {
      return <FolderOpen theme='outline' size={size} fill='currentColor' className={className} />;
    }
    return <FolderClose theme='outline' size={size} fill='currentColor' className={className} />;
  }

  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
      return <Code theme='outline' size={size} fill='#3178c6' className={className} />;
    case 'js':
    case 'jsx':
      return <Code theme='outline' size={size} fill='#f7df1e' className={className} />;
    case 'css':
    case 'scss':
    case 'less':
      return <Magic theme='outline' size={size} fill='#264de4' className={className} />;
    case 'json':
      return <JsonIcon theme='outline' size={size} fill='#cb3837' className={className} />;
    case 'md':
    case 'mdx':
      return <FileWord theme='outline' size={size} fill='#000000' className={className} />;
    case 'html':
    case 'htm':
      return <Code theme='outline' size={size} fill='#e34f26' className={className} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return <Pic theme='outline' size={size} fill='#18a058' className={className} />;
    case 'sh':
    case 'bash':
    case 'zsh':
      return <Terminal theme='outline' size={size} fill='#4EAA25' className={className} />;
    case 'env':
      return <Setting theme='outline' size={size} fill='#f6d365' className={className} />;
    case 'zip':
    case 'tar':
    case 'gz':
      return <Zip theme='outline' size={size} fill='#f6d365' className={className} />;
    default:
      return <FileText theme='outline' size={size} fill='currentColor' className={className} />;
  }
};
