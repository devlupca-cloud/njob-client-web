import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from '@/locales/pt-BR.json'
import en from '@/locales/en.json'
import es from '@/locales/es.json'

const STORAGE_KEY = 'njob-language'

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
    es: { translation: es },
  },
  lng: localStorage.getItem(STORAGE_KEY) ?? 'pt-BR',
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
})

// Keep localStorage in sync when language changes
i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng)
})

export default i18n
