# Diagnóstico de Segurança — Safe Forms

> Mesmo modelo de segurança aplicado no site da Safe, adaptado para o
> formulário de diagnóstico. Objetivo central: **URL do webhook, tokens e
> credenciais nunca aparecem no lado do cliente** (nem no HTML, nem no bundle,
> nem na aba Network do navegador).

## Nível de risco
BAIXO — página estática de uma única rota com um endpoint de captura de lead.

## Superfícies de ataque
- Endpoint de captura de lead (`POST /api/lead-diagnostico`) — spam/bots.
- Repasse ao webhook externo (onde a persistência e a notificação acontecem).

## Como cada segredo fica escondido

| Segredo | Onde vive | Como fica escondido do cliente |
|--------|-----------|-------------------------------|
| URL do webhook | Secret do Worker (`N8N_WEBHOOK_URL_DIAGNOSTICO`) | O cliente só vê `/api/lead-diagnostico` no próprio domínio. O Worker repassa server-side. |
| `FORM_TOKEN` (anti-spam) | Secret do Worker | Injetado no header `x-form-token` pelo Worker, nunca vai no HTML/bundle. |
| Credenciais de banco/mensageria | Só do lado do webhook | O Worker nem as conhece — persistência e notificação acontecem além do webhook. |

## Camadas de proteção (mesma lógica do site)

1. **Worker como proxy** (`worker/index.ts`): o formulário faz `fetch('/api/lead-diagnostico')`
   no mesmo domínio; o Worker acrescenta o token e repassa ao webhook externo. A
   URL do webhook e o token deixam de aparecer no bundle e na aba Network.
2. **Checagem de origem**: só aceita requisições do próprio host ou de origens da
   allowlist (`ALLOWED_ORIGINS`). Corta abuso trivial e sites terceiros via browser.
3. **Limite de corpo** (8 KB): descarta payloads absurdos antes do repasse.
4. **Validação de JSON**: corpo malformado é rejeitado com 400.
5. **Resposta neutra**: o Worker devolve só `{ ok: true|false }` — nunca ecoa dados
   ou erros vindos do upstream.
6. **Barreira anti-spam no upstream**: a validação exige o `x-form-token` correto e
   descarta quem não tiver.
7. **CSP** (`public/_headers`): `connect-src 'self'` impede a página de mandar dados
   para qualquer host que não seja o próprio domínio; `object-src 'none'`,
   `frame-ancestors 'self'`, `base-uri 'self'`, `form-action 'self'` fecham as
   demais superfícies. `'unsafe-inline'` em script/style é necessário porque o
   formulário é um HTML único auto-contido (sem terceiros); a proteção real de
   exfiltração vem do `connect-src 'self'`.
8. **RLS no banco**: a tabela de leads tem Row Level Security ativo; o papel
   anônimo só pode `INSERT` (não `SELECT`/`UPDATE`/`DELETE`).
9. **Segredos fora do git**: `.gitignore` bloqueia `.env`, `.env.*`, `.dev.vars` —
   só o `.env.example` (vazio) é versionado.

## Checklist pré-deploy
- [ ] Nenhuma credencial escrita no HTML/worker (só nomes de secret)
- [ ] `.env` / `.dev.vars` não versionados
- [ ] Secrets configurados: `npx wrangler secret put N8N_WEBHOOK_URL_DIAGNOSTICO` e `FORM_TOKEN`
- [ ] `ALLOWED_ORIGINS` no Worker com o domínio de produção
- [ ] RLS ativo na tabela de leads (só INSERT para anônimo)
- [ ] CSP servida (checar header em produção)
