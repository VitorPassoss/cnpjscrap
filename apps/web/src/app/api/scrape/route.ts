import {
  searchOficial,
  collectPublicCnpjs,
  MAX_GRATIS,
  CasaDosDadosError,
  type Lead,
  type SearchFilters,
} from '@/lib/casadosdados';
import { lookupManyReceita } from '@/lib/receita';
import { resolveApiKey } from '@/lib/resolveKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let filters: SearchFilters;
  try {
    filters = (await req.json()) as SearchFilters;
  } catch {
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  // ── Fonte GRÁTIS: busca pública (mesmos filtros, sem saldo) + enriquecimento ──
  if (filters.fonte === 'gratis') {
    try {
      const target = Math.max(1, Math.min(filters.limite ?? 100, MAX_GRATIS));
      // 1) lista de CNPJs do filtro, furando o teto de 20 por partição de data
      const cnpjs = await collectPublicCnpjs(filters, target, req.signal);
      // 2) enriquece cada um (telefone/e-mail/endereço) na fonte grátis
      let leads = await lookupManyReceita(cnpjs, req.signal);

      // pós-filtros de contato (só aperta se REALMENTE houver algum — senão zera)
      const querTel = filters.comTelefone || filters.somenteCelular;
      if (querTel && leads.some((l) => l.telefones.length)) {
        leads = leads.filter((l) => l.telefones.length > 0);
      }
      if (filters.somenteCelular && leads.some((l) => l.whatsapp)) {
        leads = leads.filter((l) => l.whatsapp);
      }
      if (filters.comEmail && leads.some((l) => l.email)) {
        leads = leads.filter((l) => l.email);
      }

      // prioridade: WhatsApp > telefone qualquer > resto
      const score = (l: Lead) => (l.whatsapp ? 2 : 0) + (l.telefones.length ? 1 : 0);
      leads.sort((a, b) => score(b) - score(a));

      return Response.json({ total: leads.length, leads });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── Fonte padrão: Casa dos Dados (API paga, busca por filtros) ──
  const key = await resolveApiKey(req);
  if (!key) return Response.json({ error: 'Informe a chave da API.' }, { status: 400 });

  try {
    const result = await searchOficial(key, filters, req.signal);
    return Response.json(result);
  } catch (e) {
    const status = e instanceof CasaDosDadosError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
