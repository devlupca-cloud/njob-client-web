/**
 * URL base do app. Usada como redirect após pagamentos Stripe, etc.
 * Usa lazy getter para evitar ReferenceError em ambientes sem window.
 */
export const getAppUrl = () =>
  typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_APP_URL || '')
