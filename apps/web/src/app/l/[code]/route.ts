import { dbConfigured, getLeadLink, getSettings } from '@/lib/db';
import { type LeadLinkPayload, leadVars, templateRedirectUrl } from '@/lib/leadLink';
import { lookupLead } from '@/lib/lookupLead';
import { resolveApiKey } from '@/lib/resolveKey';
import { activeTemplate, notFoundResponse, redirectResponse, renderLeadResponse } from '@/lib/liveLead';

interface ResolvedTpl {
  kind: 'html' | 'url';
  html: string;
  url: string;
  params: string[];
}

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

  // Template "vivo": se o link guarda o id (ti), busca o template atual da
  // biblioteca — assim editar o template no painel reflete em todos os links
  // dele na hora. Cai no snapshot do link se o template foi apagado, e por fim
  // no template ativo.
  let tpl: ResolvedTpl = {
    kind: payload.k === 'url' ? 'url' : 'html',
    html: typeof payload.t === 'string' ? payload.t : '',
    url: typeof payload.u === 'string' ? payload.u : '',
    params: Array.isArray(payload.p) ? payload.p : [],
  };
  if (payload.ti) {
    try {
      const s = await getSettings();
      const atual = s.templates?.find((t) => t.id === payload.ti);
      if (atual) {
        tpl = {
          kind: atual.kind === 'url' ? 'url' : 'html',
          html: atual.html ?? '',
          url: atual.url ?? '',
          params: Array.isArray(atual.params) ? atual.params : [],
        };
      } else if (!tpl.html && !tpl.url) {
        const ativo = s.templates?.find((t) => t.id === s.activeTemplateId);
        if (ativo) {
          tpl = {
            kind: ativo.kind === 'url' ? 'url' : 'html',
            html: ativo.html ?? '',
            url: ativo.url ?? '',
            params: Array.isArray(ativo.params) ? ativo.params : [],
          };
        }
      }
    } catch {
      // banco indisponível → mantém o snapshot do link
    }
  }

  const vars = payload.v as Record<string, string>;
  const redir = templateRedirectUrl(tpl, vars);
  if (redir) return redirectResponse(redir);

  if (!tpl.html) return liveFromCnpj(req, cnpjUrl);
  return renderLeadResponse(tpl.html, vars);
}

/** Monta a página consultando o CNPJ ao vivo + template ativo. */
async function liveFromCnpj(req: Request, cnpj: string): Promise<Response> {
  if (cnpj.length !== 14) return notFoundResponse();
  const key = await resolveApiKey(req);
  const lead = await lookupLead(key, cnpj, req.signal);
  if (!lead) return notFoundResponse();
  let tpl = null;
  try {
    tpl = await activeTemplate();
  } catch {
    tpl = null;
  }
  if (!tpl) return notFoundResponse();
  const vars = leadVars(lead);
  const redir = templateRedirectUrl(tpl, vars);
  if (redir) return redirectResponse(redir);
  if (!tpl.html) return notFoundResponse();
  return renderLeadResponse(tpl.html, vars);
}
