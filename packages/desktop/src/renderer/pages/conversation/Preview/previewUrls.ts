export const buildPdfSrc = (file_path?: string, content?: string): string => {
  if (content) return content;
  if (file_path) return `file://${encodeURI(file_path)}`;
  return '';
};
