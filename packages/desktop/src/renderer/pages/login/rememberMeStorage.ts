export const REMEMBER_ME_KEY = 'rememberMe';
export const REMEMBERED_USERNAME_KEY = 'rememberedUsername';
export const LEGACY_REMEMBERED_PASSWORD_KEY = 'rememberedPassword';

export type RememberedLogin = {
  rememberMe: boolean;
  username: string;
};

const reverseText = (text: string): string => text.split('').reverse().join('');

// This is only preference obfuscation; passwords and API keys must never use it.
export const encodeRememberedUsername = (username: string): string => {
  const encoded = btoa(encodeURIComponent(username));
  return reverseText(encoded);
};

export const decodeRememberedUsername = (encodedUsername: string): string => {
  try {
    return decodeURIComponent(atob(reverseText(encodedUsername)));
  } catch {
    return '';
  }
};

export const loadRememberedLogin = (storage: Pick<Storage, 'getItem' | 'removeItem'>): RememberedLogin => {
  storage.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY);
  if (storage.getItem(REMEMBER_ME_KEY) !== 'true') {
    return {
      rememberMe: false,
      username: '',
    };
  }

  return {
    rememberMe: true,
    username: decodeRememberedUsername(storage.getItem(REMEMBERED_USERNAME_KEY) || ''),
  };
};

export const persistRememberedLogin = (
  storage: Pick<Storage, 'removeItem' | 'setItem'>,
  {
    rememberMe,
    username,
  }: {
    rememberMe: boolean;
    username: string;
  }
): void => {
  storage.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY);
  if (!rememberMe) {
    storage.removeItem(REMEMBER_ME_KEY);
    storage.removeItem(REMEMBERED_USERNAME_KEY);
    return;
  }

  storage.setItem(REMEMBER_ME_KEY, 'true');
  storage.setItem(REMEMBERED_USERNAME_KEY, encodeRememberedUsername(username));
};
