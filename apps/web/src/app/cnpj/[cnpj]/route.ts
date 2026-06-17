import { resolveApiKey } from '@/lib/resolveKey';
import { lookupLead } from '@/lib/lookupLead';
import { leadVars } from '@/lib/leadLink';
import { activeTemplateHtml, notFoundResponse, renderLeadResponse } from '@/lib/liveLead';

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

  let template = '';
  try {
    template = await activeTemplateHtml();
  } catch {
    template = '';
  }
  if (!template) return notFoundResponse();

  return renderLeadResponse(template, leadVars(lead));
}
