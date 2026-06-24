import { resolveApiKey } from '@/lib/resolveKey';
import { lookupLead } from '@/lib/lookupLead';
import { leadVars, templateRedirectUrl } from '@/lib/leadLink';
import { activeTemplate, notFoundResponse, redirectResponse, renderLeadResponse } from '@/lib/liveLead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "URL viva": basta um CNPJ na URL (/cnpj/<cnpj>) e a página é montada na hora —
 * consulta o lead (Casa dos Dados → BrasilAPI grátis) e aplica o template ativo.
 * Não depende de link pré-gerado.
 */
export async function GET(req: Request, ctx: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = await ctx.params;
  const digits = String(cnpj ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return notFoundResponse();

  const key = await resolveApiKey(req);
  const lead = await lookupLead(key, digits, req.signal);
  if (!lead) return notFoundResponse();

  let tpl = null;
  try {
    tpl = await activeTemplate();
  } catch {
    tpl = null;
  }
  if (!tpl) return notFoundResponse();

  const vars = leadVars(lead);
  // Template tipo 'url' → redireciona o lead pra página externa com os dados na query.
  const redir = templateRedirectUrl(tpl, vars);
  if (redir) return redirectResponse(redir);

  if (!tpl.html) return notFoundResponse();
  return renderLeadResponse(tpl.html, vars);
}
