import { dbConfigured, getLeadLink, getSettings } from '@/lib/db';
import { type LeadLinkPayload, leadVars } from '@/lib/leadLink';
import { lookupLead } from '@/lib/lookupLead';
import { resolveApiKey } from '@/lib/resolveKey';
import { activeTemplateHtml, notFoundResponse, renderLeadResponse } from '@/lib/liveLead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Página pública do lead servida como HTML real (sem iframe/sandbox), então o
 * template roda JS nativo: fetch/chamadas de API, modais, eventos etc. Os dados
 * do lead ficam em window.LEAD (ver renderTemplate).
 *
 * "URL viva": se o link não existir mais (ou o banco estiver fora) mas a URL
 * trouxer ?cnpj=, a página é montada na hora consultando o CNPJ — então o link
 * nunca quebra enquanto houver o CNPJ na URL.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const cnpjUrl = new URL(req.url).searchParams.get('cnpj')?.replace(/\D/g, '') ?? '';
  const payload = dbConfigured() ? await getLeadLink<LeadLinkPayload>(code) : null;

  // Link não encontrado → tenta montar ao vivo pelo CNPJ da URL (fallback).
  if (!payload || typeof payload.v !== 'object') {
    return liveFromCnpj(req, cnpjUrl);
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

  if (!template) return liveFromCnpj(req, cnpjUrl);

  return renderLeadResponse(template, payload.v as Record<string, string>);
}

/** Monta a página consultando o CNPJ ao vivo + template ativo. */
async function liveFromCnpj(req: Request, cnpj: string): Promise<Response> {
  if (cnpj.length !== 14) return notFoundResponse();
  const key = await resolveApiKey(req);
  const lead = await lookupLead(key, cnpj, req.signal);
  if (!lead) return notFoundResponse();
  let template = '';
  try {
    template = await activeTemplateHtml();
  } catch {
    template = '';
  }
  if (!template) return notFoundResponse();
  return renderLeadResponse(template, leadVars(lead));
}
