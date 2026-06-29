export const STANDALONE_CHAT_SURFACE_WIDTH_CLASS =
  'w-[calc(100%-24px)] md:w-[calc(100%-clamp(80px,10vw,240px))] max-w-none mx-auto';

export const TEAM_CHAT_SURFACE_WIDTH_CLASS = 'w-full max-w-full';

/** Returns the width class for shared chat rows and send boxes. */
export const getChatSurfaceWidthClass = (isTeamMode: boolean): string =>
  isTeamMode ? TEAM_CHAT_SURFACE_WIDTH_CLASS : STANDALONE_CHAT_SURFACE_WIDTH_CLASS;
