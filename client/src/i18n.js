// Sets up translations. Every piece of UI text is looked up by a key, e.g. t('nav.myClaims'),
// in the JSON file for the current language.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['en'];
const STORAGE_KEY = 'ks_lang';

function savedLanguage() {
  try {
    const lang = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: savedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes values
});

// Remember the choice and set <html lang> for screen readers and correct fonts
i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
