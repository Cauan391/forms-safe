/**
 * Worker do formulário de Diagnóstico — serve o HTML estático (public/) e faz
 * proxy do lead para o webhook externo em POST /api/lead-diagnostico.
 *
 * O endereço do webhook e o token anti-spam NÃO aparecem no HTML nem na aba
 * Network do navegador — o cliente só vê /api/lead-diagnostico no próprio
 * domínio. Ambos vivem como secrets do Worker (nunca chegam ao cliente),
 * configurados no deploy:
 *
 *   npx wrangler secret put N8N_WEBHOOK_URL_DIAGNOSTICO
 *   npx wrangler secret put FORM_TOKEN
 *
 * Toda a persistência e a mensageria ficam do outro lado do webhook; este
 * Worker só conhece a URL do webhook e o token — nenhuma credencial passa aqui.
 */

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  N8N_WEBHOOK_URL_DIAGNOSTICO?: string;
  FORM_TOKEN?: string;
}

// Origens autorizadas a enviar o formulário (o próprio domínio do forms).
// Ajuste quando o domínio final estiver definido.
const ALLOWED_ORIGINS = new Set([
  'https://forms.safegroupia.com',
  'https://safe-forms.cauansb2488.workers.dev',
]);

const MAX_BODY_BYTES = 8 * 1024; // um lead legítimo tem ~400 bytes

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/lead-diagnostico') {
      if (request.method !== 'POST') {
        return json(405, { ok: false, erro: 'method not allowed' });
      }
      if (!env.N8N_WEBHOOK_URL_DIAGNOSTICO) {
        return json(500, { ok: false, erro: 'endpoint não configurado' });
      }

      // Só aceita envios vindos do próprio site (não bloqueia curl com Origin
      // forjado — para isso existe o rate limit no WAF — mas corta abuso trivial
      // e qualquer site terceiro tentando usar o endpoint via browser).
      const origin = request.headers.get('Origin') ?? '';
      const sameHost = origin === `${url.protocol}//${url.host}`;
      if (!sameHost && !ALLOWED_ORIGINS.has(origin)) {
        return json(403, { ok: false, erro: 'origem não autorizada' });
      }

      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return json(413, { ok: false, erro: 'payload muito grande' });
      }
      try {
        JSON.parse(raw);
      } catch {
        return json(400, { ok: false, erro: 'json inválido' });
      }

      const upstream = await fetch(env.N8N_WEBHOOK_URL_DIAGNOSTICO, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.FORM_TOKEN ? { 'x-form-token': env.FORM_TOKEN } : {}),
          // contexto útil pro upstream (colunas ip/user_agent)
          'x-lead-ip': request.headers.get('CF-Connecting-IP') ?? '',
          'x-lead-user-agent': request.headers.get('User-Agent') ?? '',
        },
        body: raw,
      });

      // Repassa só o status + um corpo neutro (nunca ecoa dados do upstream).
      return json(upstream.ok ? 200 : 502, { ok: upstream.ok });
    }

    return env.ASSETS.fetch(request);
  },
};
