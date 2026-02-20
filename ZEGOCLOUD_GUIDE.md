# Guia de Configuração ZEGOCLOUD

Este projeto utiliza o **ZEGOCLOUD UIKit** para funcionalidades de transmissão ao vivo (Live Streaming) e chamadas de vídeo (Video Call). Abaixo estão as instruções de como configurar as credenciais e utilizar os parâmetros de URL.

## 1. Onde colocar as credenciais

As credenciais do ZEGOCLOUD estão centralizadas no arquivo de biblioteca da aplicação.

**Caminho do arquivo:** `src/lib/zegocloud.ts`

### Estrutura Atual
Atualmente, as credenciais estão hardcoded para fins de teste:

```typescript
// src/lib/zegocloud.ts

const appID = 255132937;
const serverSecret = '78d1f2a749ec06876c14bec49405e187';
```

### Recomendação de Segurança (Produção)
Para um ambiente de produção, é altamente recomendável mover estas credenciais para um arquivo `.env`:

1. Crie um arquivo `.env` na raiz do projeto:
```env
VITE_ZEGO_APP_ID=255132937
VITE_ZEGO_SERVER_SECRET=78d1f2a749ec06876c14bec49405e187
```

2. Altere o arquivo `src/lib/zegocloud.ts` para ler do ambiente:
```typescript
const appID = Number(import.meta.env.VITE_ZEGO_APP_ID);
const serverSecret = import.meta.env.VITE_ZEGO_SERVER_SECRET;
```

---

## 2. Parâmetros de URL

O projeto está configurado para permitir a entrada automática em salas via parâmetros na URL. Isso é útil para integrar com outros sistemas ou compartilhar links diretos.

### Transmissão ao Vivo (Live Streaming)
**Rota:** `/live`

| Parâmetro | Tipo | Descrição | Exemplo |
| :--- | :--- | :--- | :--- |
| `room` | string | ID único da sala | `?room=test123` |
| `mode` | string | `host` (transmite) ou `viewer` (assiste) | `&mode=viewer` |
| `userName` | string | Nome do usuário que aparecerá no chat | `&userName=Joao` |
| `userID` | string | ID único do usuário (evita conflitos) | `&userID=user_882` |

**Exemplo de URL completa:**
`http://localhost:5173/live?room=minha-sala&mode=host&userName=Admin&userID=999`

### Chamadas de Vídeo (Video Call)
**Rota:** `/video-call`

| Parâmetro | Tipo | Descrição | Exemplo |
| :--- | :--- | :--- | :--- |
| `room` | string | ID único da sala | `?room=call_01` |
| `userName` | string | Nome do usuário na chamada | `&userName=Maria` |
| `userID` | string | ID único do usuário | `&userID=user_555` |

**Exemplo de URL completa:**
`http://localhost:5173/video-call?room=reuniao-equipe&userName=Dev&userID=101`

---

## 3. Explicação Técnica do Fluxo

1. **Captura de Parâmetros:** Os componentes `LiveStream.tsx` e `VideoCall.tsx` usam o hook `useSearchParams` para ler os dados da URL.
2. **Entrada Automática:** Se os parâmetros `room`, `userName` e `userID` estiverem presentes, o sistema ignora o diálogo de configuração inicial e conecta diretamente.
3. **Geração de Token:** O sistema utiliza `ZegoUIKitPrebuilt.generateKitTokenForTest` dentro de `src/lib/zegocloud.ts`. 
   - *Nota:* Para produção real, o token deve ser gerado no seu backend para maior segurança.
4. **Cenários:**
   - **LiveStreaming:** Usa o cenário `ZegoUIKitPrebuilt.LiveStreaming` com papéis de `Host` ou `Audience`.
   - **VideoCall:** Usa o cenário `ZegoUIKitPrebuilt.GroupCall`.

---

## 4. Como Testar Localmente

1. Abra o terminal e rode `npm run dev`.
2. Acesse `http://localhost:5173/live?room=teste&mode=host&userName=HostTest&userID=1`.
3. Em outra aba (ou janela anônima), acesse `http://localhost:5173/live?room=teste&mode=viewer&userName=ViewerTest&userID=2`.
4. Você verá a transmissão ao vivo funcionando entre as duas abas.
