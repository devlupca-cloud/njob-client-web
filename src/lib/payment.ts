/**
 * Pix está implementado de ponta a ponta (checkout na plataforma + transfer,
 * webhook handle-stripe-webhook), mas a capability `pix_payments` ainda NÃO está
 * ativa na conta da plataforma no Stripe — então tentar pagar com Pix retorna
 * "pix is invalid". Enquanto isso, mantemos o seletor de Pix OCULTO no front e
 * a compra vai direto para cartão/boleto.
 *
 * Quando o Stripe ativar o Pix na conta da plataforma, basta voltar para `true`.
 */
export const PIX_ENABLED: boolean = false
