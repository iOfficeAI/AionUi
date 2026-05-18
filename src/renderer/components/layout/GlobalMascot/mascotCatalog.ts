import cuteMascotImage from './cute-clean.png';
import geminiMascotAImage from './mascot-gemini-a.png';
import geminiMascotCImage from './mascot-gemini-c.png';

export const GLOBAL_MASCOT_CHANGED_EVENT = 'aionui:global-mascot-changed';
export const DEFAULT_GLOBAL_MASCOT_ENABLED = false;

export const GLOBAL_MASCOT_OPTIONS = [
  {
    frameHeight: 40,
    frameWidth: 72,
    id: 'cute',
    image: cuteMascotImage,
    labelKey: 'settings.mascotImageOptionCute',
  },
  {
    frameHeight: 56,
    frameWidth: 56,
    id: 'geminiA',
    image: geminiMascotAImage,
    labelKey: 'settings.mascotImageOptionGeminiA',
  },
  {
    frameHeight: 56,
    frameWidth: 56,
    id: 'geminiC',
    image: geminiMascotCImage,
    labelKey: 'settings.mascotImageOptionGeminiC',
  },
] as const;

export type GlobalMascotOption = (typeof GLOBAL_MASCOT_OPTIONS)[number];
export type GlobalMascotOptionId = GlobalMascotOption['id'];

export const DEFAULT_GLOBAL_MASCOT_ID: GlobalMascotOptionId = 'cute';

export const resolveGlobalMascotOption = (value: string | null | undefined): GlobalMascotOption => {
  return GLOBAL_MASCOT_OPTIONS.find((option) => option.id === value) ?? GLOBAL_MASCOT_OPTIONS[0];
};
