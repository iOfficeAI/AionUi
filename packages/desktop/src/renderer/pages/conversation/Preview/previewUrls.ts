export const buildPdfSrc = (file_path?: string, content?: string): string => {
  return file_path ? `file://${encodeURI(file_path)}` : content || '';
};
