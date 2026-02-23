# Revisao Urgente - Live, Videochamada e Conteudo

## Resumo Geral

| Feature | Status | Funcional? |
|---------|--------|------------|
| **Live Streaming** | 100% implementado | SIM |
| **Conteudo/Packs** | 100% implementado | SIM |
| **Videochamada** | 100% implementado | SIM |

---

## 1. LIVE STREAMING

### O que funciona
- Exibicao de lives no perfil do creator (agendadas e ao vivo)
- Compra de ingresso via Stripe (checkout completo)
- Entrada na live via ZegoCloud local (LiveStreaming scenario, Audience role)
- Verificacao de ingresso para lives pagas (handleEnterLive verifica live_stream_tickets)
- Acesso livre para lives gratuitas
- Badge "AO VIVO" no perfil do creator
- Historico de ingressos na pagina de compras (clicavel - navega para /lives/:id)
- Webhook salva corretamente os ingressos no banco

### Bugs corrigidos
- [x] BUG-L1: LIVE_CANVAS_BASE hardcoded → LivePage reescrita com ZegoCloud local
- [x] BUG-L2: handleEnterLive nao verificava ingresso para live ativa paga → Agora verifica live_stream_tickets
- [x] BUG-L3: Itens de live na PurchasesPage nao clicaveis → Agora navegam para /lives/:id
- [x] BUG-L4: product_type "live" vs "live_ticket" na Edge Function → Adicionado case "live_ticket" + URL corrigida

---

## 2. CONTEUDO / PACKS

### O que funciona
- Exibicao de packs no perfil do creator (CardPack)
- Pagina de conteudo com grid de midia (ContentPage)
- Filtro por tipo: fotos, videos, audios
- Player de video com controles
- Player de audio com UI customizada
- Visualizador de imagens com lazy loading
- Overlay de conteudo bloqueado (cadeado + preco)
- Modal de compra com Stripe checkout integrado
- Compra pelo perfil do creator funciona (Stripe integrado)
- Compra pela ContentPage funciona (Stripe integrado)
- Webhook processa pack_purchases corretamente
- Historico de compras na PurchasesPage (clicavel - navega para /creator/:id/content)
- Textos internacionalizados via i18n (pt-BR, en, es)

### Bugs corrigidos
- [x] BUG-C1: handleBuy() na ContentPage quebrado → Corrigido para usar Stripe checkout
- [x] BUG-C2: CheckoutPage placeholder → Fluxos vao direto pro Stripe, stub mantido como dead route
- [x] BUG-C3: Textos hardcoded em portugues → Substituidos por chaves i18n (contentPage.*)

---

## 3. VIDEOCHAMADA (One-on-One Call)

### O que funciona
- Botao "Chamada de video" no perfil do creator (se faz_chamada_video = true)
- Modal com disclaimer
- NewCallPage completa: busca disponibilidade, filtra slots bloqueados por lives, seletor de duracao (30/60min), seletor de data, grid de horarios, checkout via Stripe
- Pagamento via Stripe (product_type: 'video-call', preco dinamico de profile_settings)
- CallRoomPage: verificacao de autorizacao, janela de tempo (5 min antes), ZegoCloud OneONoneCall
- Webhook cria registro em one_on_one_calls e marca slot como purchased
- Historico de chamadas na PurchasesPage (clicavel - navega para /calls/:id)
- Types OneOnOneCall alinhados com schema real do banco

### Bugs corrigidos
- [x] BUG-V1: NewCallPage era placeholder → Reescrita completa com agendamento + Stripe
- [x] BUG-V2: Nenhuma integracao de video → ZegoCloud integrado (CallRoomPage)
- [x] BUG-V3: Nenhum fluxo de pagamento → Stripe checkout integrado
- [x] BUG-V4: Types OneOnOneCall divergiam do banco → Alinhados (user_id, scheduled_start_time, etc.)
- [x] BUG-V5: creatorId nao era lido → useSearchParams implementado

---

## Outras Correcoes

- [x] Performance: code splitting com React.lazy, auth non-blocking, vendor chunks
- [x] Console.logs de debug removidos do CreatorProfilePage (subscribe flow)
- [x] Edge Function create-stripe-checkout: case "live_ticket" adicionado, URL fallback de live corrigida
- [x] ZegoCloud SDK instalado e configurado (src/lib/zegocloud.ts)
- [x] Vite config: vendor-zegocloud chunk separado (~5MB SDK)

---

## Melhorias futuras (nao urgente)

### Live
- [ ] Notificacao quando live comeca
- [ ] Chat ao vivo durante transmissao
- [ ] Contagem de espectadores
- [ ] Gravacao/replay de lives encerradas
- [ ] Status em tempo real (Supabase realtime)

### Conteudo
- [ ] Paginacao de itens de packs (se tiver muitos itens)
- [ ] Download de conteudo comprado
- [ ] Preview de conteudo bloqueado (blur parcial)

### Videochamada
- [ ] Notificacao quando chamada e agendada
- [ ] Status em tempo real da chamada
- [ ] Avaliacao pos-chamada
