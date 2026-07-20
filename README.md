# Safe Forms — Formulário de Diagnóstico

Formulário de captura de leads multi-etapa da Safe Group (nome, Instagram, e-mail,
WhatsApp, cargo, nº de funcionários, pergunta de prioridade), com troca de idioma
(pt-BR / pt-PT / es / en) e tela final de confirmação.

HTML estático de arquivo único servido por um **Cloudflare Worker** que faz proxy
do envio para um webhook externo — mantendo a URL do webhook, o token e as
credenciais de backend fora do lado do cliente. Ver [SECURITY.md](./SECURITY.md).

## Estrutura

```
public/
  index.html         # o formulário (HTML/CSS/JS auto-contido)
  tornado-logo.png   # marca no header mobile + favicon
  _headers           # CSP e cache (Cloudflare)
worker/
  index.ts           # proxy POST /api/lead-diagnostico → webhook externo (token como secret)
wrangler.jsonc
.env.example
```

## Fluxo do lead

```
formulário → POST /api/lead-diagnostico (mesmo domínio)
          → Worker adiciona x-form-token e repassa ao webhook externo
          → o webhook valida, persiste o lead e dispara a notificação interna
```

O botão "falar com um estrategista agora" da tela final abre o WhatsApp da Safe
(`wa.me/5527999584889`) com mensagem pré-preenchida (adaptada por idioma).

## Rodar localmente

```bash
npm install
# crie um .dev.vars com N8N_WEBHOOK_URL_DIAGNOSTICO e FORM_TOKEN (ver .env.example)
npm run dev
```

## Deploy

```bash
npx wrangler secret put N8N_WEBHOOK_URL_DIAGNOSTICO
npx wrangler secret put FORM_TOKEN
npm run deploy
```
