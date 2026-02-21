# Plano de Acao - Stripe Payment Flows (njob)

**Data da auditoria:** 2026-02-20
**Aplicacoes auditadas:** njob_client_web, njob_creator_web

---

## Resumo Executivo

Dos 10 fluxos de pagamento auditados, apenas 2 funcionam corretamente (compra de pack e ingresso de live via CreatorProfilePage). Os fluxos de assinatura estao completamente quebrados, video call nao foi implementado no frontend, e ha um bug destrutivo que afeta a agenda de todos os creators. Foram encontrados 7 bugs e 8 gaps funcionais.

---

## BUGS CRITICOS (Prioridade Imediata)

### BUG-003: Update sem filtro destroi agenda de TODOS os creators
- **Arquivo:** `njob_client_web/supabase/functions/handle-purchases-webhook/index.ts` (linhas 225-229)
- **Problema:** `.update({ purchased: true })` sem `.eq("id", slotId)` marca TODOS os slots de TODOS os creators como comprados
- **Impacto:** DESTRUTIVO - afeta todos os creators do sistema
- **Fix:** Adicionar `.eq("id", metadata.availability_slot_id)` ao update
- **Estimativa:** 5 minutos

### BUG-002: Mismatch de campo impede redirect de assinatura
- **Arquivo Edge Fn:** `create-checkout-subscription-stripe/index.ts` retorna `{ checkout_url: ... }`
- **Arquivo Client:** `src/pages/subscription/SubscriptionPage.tsx` (linha 229) verifica `data?.url`
- **Arquivo Creator:** `lib/api/subscription.ts` (linha 22) retorna `data?.url`
- **Problema:** Frontend busca `url`, backend retorna `checkout_url` — redirect nunca ocorre
- **Impacto:** ALTO - assinaturas nao funcionam
- **Fix:** Mudar frontend para usar `data?.checkout_url` em ambos os projetos
- **Estimativa:** 15 minutos

### BUG-001: URLs hardcoded na Edge Function de subscription
- **Arquivo:** `create-checkout-subscription-stripe/index.ts` (linhas 41-45)
- **Problema:** `finalSuccessUrl` e `finalCancelUrl` hardcoded para `njob-client-web.vercel.app/home`
- **Impacto:** MEDIO - usuarios sempre redirecionados para /home em producao
- **Fix:** Usar as URLs dinamicas recebidas no body da request
- **Estimativa:** 10 minutos

### BUG-005: AddCardPage viola PCI DSS
- **Arquivo:** `src/pages/payments/AddCardPage.tsx`
- **Problema:** Coleta numero de cartao e CVV em campos HTML sem Stripe.js Elements
- **Impacto:** CRITICO para compliance - violacao PCI DSS
- **Fix:** Reimplementar com Stripe.js Elements ou remover a funcionalidade
- **Estimativa:** 2-4 horas (reimplementar) ou 15 minutos (remover)

### BUG-004: ContentPage usa rota stub para compras
- **Arquivo:** `src/pages/creator/ContentPage.tsx` (linhas 458-468)
- **Problema:** `handleBuy()` navega para `/payments/checkout` que e uma pagina stub
- **Fix:** Usar o mesmo padrao de `CreatorProfilePage` chamando `create-stripe-checkout`
- **Estimativa:** 1-2 horas

---

## FUNCIONALIDADES FALTANTES (Prioridade Alta)

### BUG-006: Webhook de assinaturas nao implementado
- **Arquivo:** `handle-purchases-webhook/index.ts`
- **Problema:** So trata `checkout.session.completed` com `mode === "payment"`. Eventos de subscription nao sao processados.
- **Eventos necessarios:**
  - `customer.subscription.created` — registrar assinatura no banco
  - `customer.subscription.updated` — atualizar status/periodo
  - `customer.subscription.deleted` — marcar como cancelada
  - `invoice.paid` — processar renovacoes
  - `invoice.payment_failed` — notificar falha
- **Estimativa:** 4-6 horas

### GAP-001: NewCallPage e stub (Video Call)
- **Arquivo:** `src/pages/creator/NewCallPage.tsx`
- **Problema:** Pagina renderiza texto estatico. A Edge Function `create-stripe-checkout` ja tem logica completa para `product_type: 'video-call'` mas nunca e chamada.
- **Necessario:**
  - UI de selecao de slot de disponibilidade
  - Chamada ao `create-stripe-checkout` com `product_type: 'video-call'`
  - Pagina de sucesso apos pagamento
- **Estimativa:** 4-6 horas

### GAP-004: Nenhum stripe_customer_id salvo
- **Problema:** Sem `stripe_customer_id` na tabela `profiles`, um novo Stripe Customer e criado a cada checkout.
- **Fix:**
  1. Adicionar coluna `stripe_customer_id` em `profiles`
  2. Nas Edge Functions, buscar customer existente ou criar novo e salvar
  3. Reusar customer em checkouts futuros
- **Estimativa:** 2-3 horas

### GAP-005: Nenhuma Customer Portal
- **Problema:** Usuarios nao tem como cancelar/gerenciar assinaturas
- **Fix:** Criar endpoint que gera Stripe Customer Portal session + botao na UI
- **Estimativa:** 2-3 horas

---

## MELHORIAS (Prioridade Media)

### GAP-002: Sem verificacao de ticket em /lives/:id
- **Problema:** Qualquer usuario pode acessar uma live paga sem ter comprado ticket
- **Fix:** Verificar `live_stream_tickets` antes de permitir acesso
- **Estimativa:** 1-2 horas

### GAP-003: Sem feedback pos-assinatura
- **Problema:** Ao retornar do Stripe, nenhuma mensagem de sucesso e exibida
- **Fix:** Verificar `?session_id=` na URL e exibir toast
- **Estimativa:** 30 minutos

### GAP-006: Edge Functions de Stripe Connect fora do repo
- **Funcoes ausentes:** `create-stripe-connected-account`, `creator-payout-update-link`
- **Fix:** Localizar e adicionar ao repositorio para versionamento
- **Estimativa:** 1 hora

### GAP-007: Versao do Stripe SDK desatualizada
- **Problema:** Usando API version `2022-11-15` (4 anos atras)
- **Fix:** Atualizar para `2024-12-18.acacia` e testar
- **Estimativa:** 1-2 horas

### BUG-007: Unique constraint em creator_subscriptions.creator_id
- **Problema:** Um creator so pode ter 1 registro. Renovacoes/mudancas de plano podem falhar.
- **Fix:** Avaliar se a logica deve ser upsert ou permitir multiplos registros
- **Estimativa:** 1 hora

---

## TABELAS DO BANCO - CAMPOS FALTANTES

| Tabela | Campo Faltante | Tipo Sugerido | Motivo |
|---|---|---|---|
| `profiles` | `stripe_customer_id` | `text unique` | Reusar Customer em checkouts |
| `saved_cards` | `stripe_payment_method_id` | `text unique` | Permitir cobrancas reais |

---

## ORDEM DE EXECUCAO RECOMENDADA

### Sprint 1 - Fixes criticos (CONCLUIDO 2026-02-20)
1. [x] BUG-003: Adicionar `.eq("id", slotId)` no webhook
2. [x] BUG-002: Corrigir field name mismatch (`url` -> `checkout_url`) — client + creator
3. [x] BUG-001: Remover URLs hardcoded e console.logs de debug na Edge Function
4. [x] BUG-005: Substituir AddCardPage por placeholder seguro (sem coleta de dados de cartao)

### Sprint 2 - Assinaturas funcionais (CONCLUIDO 2026-02-20)
5. [x] Adicionar `stripe_customer_id` em `profiles` — checkout agora busca/cria Stripe Customer e salva
6. [x] Implementar webhook de assinaturas (created/updated/deleted/invoice.paid/invoice.payment_failed)
7. [x] Adicionar feedback pos-assinatura na UI (toast success/error + query invalidation)
8. [x] Implementar Customer Portal para cancelamento (nova Edge Function + botao "Gerenciar assinatura")

**IMPORTANTE: Executar migration SQL no Supabase Dashboard (ver abaixo)**

### Sprint 3 - Fluxos restantes (3-4 dias)
9. [ ] Corrigir ContentPage para usar Stripe real
10. [ ] Implementar NewCallPage (video call + selecao de slot)
11. [ ] Adicionar verificacao de ticket em /lives/:id

### Sprint 4 - Compliance e cleanup (2-3 dias)
12. [ ] Reimplementar AddCardPage com Stripe.js Elements
13. [ ] Trazer Edge Functions faltantes para o repo
14. [ ] Atualizar versao do Stripe SDK
15. [ ] Resolver constraint unique de creator_subscriptions

---

## MAPA DE ARQUIVOS RELEVANTES

### Client Web (njob_client_web)
```
src/pages/subscription/SubscriptionPage.tsx    <- BUG-002
src/pages/creator/CreatorProfilePage.tsx       <- Fluxo principal (funciona)
src/pages/creator/ContentPage.tsx              <- BUG-004
src/pages/creator/NewCallPage.tsx              <- GAP-001
src/pages/payments/AddCardPage.tsx             <- BUG-005
src/pages/payments/CheckoutPage.tsx            <- Stub
supabase/functions/create-checkout-subscription-stripe/  <- BUG-001, BUG-002
supabase/functions/create-stripe-checkout/     <- OK
supabase/functions/handle-purchases-webhook/   <- BUG-003, BUG-006
```

### Creator Web (njob_creator_web)
```
lib/api/subscription.ts                        <- BUG-002
app/(onboarding)/stripe-setup/page.tsx         <- OK
app/(onboarding)/subscription/page.tsx         <- BUG-002
app/(app)/subscription-plans/page.tsx          <- OK
app/(app)/payments/page.tsx                    <- OK
lib/supabase/creator.ts                        <- Stripe Connect
```

---

## MIGRATION SQL (Executar no Supabase Dashboard)

Execute este SQL no Supabase SQL Editor para adicionar a coluna `stripe_customer_id` na tabela `profiles`:

```sql
-- Sprint 2: Adicionar stripe_customer_id para reusar Stripe Customer em checkouts
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

-- Indice para buscar perfil pelo stripe_customer_id (usado no webhook)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
ON profiles (stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;
```

### Configuracao necessaria no Stripe Dashboard

1. **Webhook endpoint**: Adicionar os seguintes eventos ao endpoint que aponta para `handle-purchases-webhook`:
   - `checkout.session.completed` (ja existia)
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

2. **Customer Portal**: Configurar o Customer Portal em Stripe Dashboard > Settings > Billing > Customer Portal:
   - Habilitar cancelamento de assinatura
   - Habilitar troca de plano (se aplicavel)
   - Configurar URL de retorno padrao

3. **Deploy das Edge Functions**:
   - `create-checkout-subscription-stripe` (atualizada)
   - `handle-purchases-webhook` (atualizada com handlers de subscription)
   - `create-customer-portal-session` (NOVA)

---

## ARQUIVOS MODIFICADOS NO SPRINT 2

### Client Web (njob_client_web)
```
supabase/functions/create-checkout-subscription-stripe/index.ts  <- Stripe Customer reuso
supabase/functions/handle-purchases-webhook/index.ts             <- Webhook de assinaturas
supabase/functions/create-customer-portal-session/index.ts       <- NOVO: Customer Portal
src/pages/subscription/SubscriptionPage.tsx                      <- Toast + Customer Portal
```

### Creator Web (njob_creator_web)
```
lib/api/subscription.ts                        <- success/cancel URLs + Customer Portal API
app/(app)/subscription-plans/page.tsx          <- Toast + Customer Portal + assinatura ativa
app/(onboarding)/subscription/page.tsx         <- success/cancel URLs
```
