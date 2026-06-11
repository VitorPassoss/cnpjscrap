import { dbConfigured, getLeadLink, getSettings } from '@/lib/db';
import { applyTemplate, renderTemplate, type LeadLinkPayload } from '@/lib/leadLink';
import { compileCss } from '@/lib/tailwind';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

const NOT_FOUND = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body class="min-h-screen flex items-center justify-center bg-zinc-100 p-6 text-center"><div><p class="text-lg font-semibold text-zinc-800">Link não encontrado</p><p class="mt-1 text-sm text-zinc-500">Este link de lead não existe ou foi removido.</p></div></body></html>`;

/**
 * Página pública do lead servida como HTML real (sem iframe/sandbox), então o
 * template roda JS nativo: fetch/chamadas de API, modais, eventos etc. Os dados
 * do lead ficam em window.LEAD (ver renderTemplate).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const payload = dbConfigured() ? await getLeadLink<LeadLinkPayload>(code) : null;

  if (!payload || typeof payload.v !== 'object') {
    return new Response(NOT_FOUND, { status: 404, headers: HTML_HEADERS });
  }

  // Template "vivo": se o link guarda o id (ti), busca o HTML atual da biblioteca
  // — assim editar o template no painel reflete em todos os links dele na hora.
  // Cai no snapshot `t` se o template foi apagado, e por fim no template ativo.
  let template = typeof payload.t === 'string' ? payload.t : '';
  if (payload.ti) {
    try {
      const s = await getSettings();
      const atual = s.templates?.find((t) => t.id === payload.ti)?.html;
      if (atual) template = atual;
      else if (!template) template = s.templates?.find((t) => t.id === s.activeTemplateId)?.html ?? '';
    } catch {
      // banco indisponível → mantém o snapshot `t`
    }
  }

  if (!template) {
    return new Response(NOT_FOUND, { status: 404, headers: HTML_HEADERS });
  }

  // CSS pré-compilado das classes do template (cacheado) → página rápida, sem CDN.
  let css: string | undefined;
  try {
    css = await compileCss(applyTemplate(template, payload.v));
  } catch {
    css = undefined; // se falhar, renderTemplate cai no Tailwind CDN
  }

  return new Response(renderTemplate(template, payload.v, css), { status: 200, headers: HTML_HEADERS });
}
