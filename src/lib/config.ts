/**
 * URL base do app. Usada como redirect após pagamentos Stripe, etc.
 * Configurar via VITE_APP_URL no .env (ex: http://localhost:5173 ou https://app.njob.com.br)
 */
export const APP_URL = import.meta.env.VITE_APP_URL as string || window.location.origin
