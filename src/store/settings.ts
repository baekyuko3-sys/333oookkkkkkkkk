import { readPersistentState, writePersistentState } from './usePersistentState';

export interface PhoneSettings {
  apiProvider: string;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  userName: string;
  userBio: string;
  timeAware: boolean;
  soundEnabled: boolean;
}

const KEY = 'phone:settings';

export const DEFAULT_PHONE_SETTINGS: PhoneSettings = {
  apiProvider: '',
  apiBaseUrl: '',
  apiKey: '',
  model: '',
  userName: '',
  userBio: '',
  timeAware: true,
  soundEnabled: true,
};

export function loadPhoneSettings(): PhoneSettings {
  return {
    ...DEFAULT_PHONE_SETTINGS,
    ...readPersistentState<Partial<PhoneSettings>>(KEY, {}),
  };
}

export function savePhoneSettings(settings: PhoneSettings): void {
  writePersistentState(KEY, settings);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('phone-settings-updated'));
}

export function resetPhoneSettings(): void {
  writePersistentState(KEY, DEFAULT_PHONE_SETTINGS);
}
