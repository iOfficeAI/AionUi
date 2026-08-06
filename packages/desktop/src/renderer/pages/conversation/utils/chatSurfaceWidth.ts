export const CHAT_SURFACE_CONTAINER_CLASS = 'chat-surface-container';

export const CHAT_SURFACE_WIDTH_CLASS = 'chat-surface-fluid';

/**
 * Width class for shared chat rows and send boxes.
 *
 * Team and standalone conversations use the same class. `.chat-surface-fluid` is
 * full-width by default and only reserves side gutters once its *container* is
 * wide enough (see messages.css), so the layout follows the column a chat is
 * given rather than the mode it is in:
 *
 * - Team parallel view gives each agent a ~400px column. That stays below the
 *   gutter threshold, so those columns keep rendering full width — indenting a
 *   column that narrow would only squeeze the text further.
 * - Team single view fills the whole chat area, so it gets the same gutters as a
 *   standalone conversation. That is also what gives the anchor rail somewhere to
 *   sit instead of crowding the message text.
 *
 * Superseding an earlier fix (#3464) that pinned team mode to full width: the
 * problem then was narrow parallel columns being indented, which the container
 * query already prevents. The mode no longer needs to decide.
 */
export const getChatSurfaceWidthClass = (): string => CHAT_SURFACE_WIDTH_CLASS;
