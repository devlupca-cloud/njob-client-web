/**
 * URL base do app. Usada como redirect após pagamentos Stripe, etc.
 * Sempre usa window.location.origin para garantir redirecionamento correto em qualquer domínio.
 */
export const APP_URL = window.location.origin
