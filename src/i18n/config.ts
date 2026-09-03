import i18n from 'i18next';
import type { BackendModule, ReadCallback, Services, InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED_LANGUAGES = [
  'en', 'sv', 'de', 'fr', 'es', 'pl', 'uk', 'ro', 'lt', 'et',
] as const;

// The ten locale files are ~3 MB of raw JSON. Imported statically they sat in
// the entry chunk, so every visitor downloaded ten languages to read one —
// 833 kB gzip of a 1 183 kB entry. Vite turns this glob into one chunk per
// file and the backend below fetches only the language actually in use (plus
// the `en` fallback, which the shorter locales genuinely need).
const localeLoaders = import.meta.glob<{ default: Record<string, unknown> }>(
  './locales/{en,sv,de,fr,es,pl,uk,ro,lt,et}.json',
);

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init: (_services: Services, _backendOptions: unknown, _i18nextOptions: InitOptions) => {},
  read: (language: string, _namespace: string, callback: ReadCallback) => {
    const load = localeLoaders[`./locales/${language}.json`];
    // Unknown code: hand back an empty bundle and let fallbackLng answer.
    if (!load) {
      callback(null, {});
      return;
    }
    load()
      .then((mod) => callback(null, mod.default))
      .catch((err) => callback(err as Error, false));
  },
};

// Resolves once the active language (and the fallback) are in the store.
// main.tsx waits for this before the first paint so nobody sees raw t() keys.
export const i18nReady = i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    // A navigator reporting sv-SE must resolve to sv.json, not miss the file.
    load: 'languageOnly',
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    // Language switches now involve a fetch. Without suspense the old strings
    // stay on screen until the new bundle lands, instead of a blank flash.
    react: { useSuspense: false },
  });

export default i18n;
