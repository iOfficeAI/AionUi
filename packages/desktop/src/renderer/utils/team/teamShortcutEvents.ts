export const TEAM_SWITCH_EVENT = 'aionui:team-switch';
export const TEAM_CREATE_EVENT = 'aionui:team-create';

export function dispatchTeamSwitchEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TEAM_SWITCH_EVENT));
}

export function dispatchTeamCreateEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TEAM_CREATE_EVENT));
}
