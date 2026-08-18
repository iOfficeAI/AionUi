/**
 * Build the display name requested when creating a team from a conversation.
 * The backend remains responsible for resolving collisions atomically.
 */
export function getAdHocTeamName(sourceTitle: string | undefined, fallbackName: string): string {
  const title = sourceTitle?.trim();
  return title ? `${title} · ${fallbackName}` : fallbackName;
}
