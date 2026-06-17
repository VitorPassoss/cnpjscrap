import { searchOficial, CasaDosDadosError, type SearchFilters } from '@/lib/casadosdados';
import { lookupManyBrasilApi } from '@/lib/cnpjFallback';
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

  // Fonte BrasilAPI: consulta grátis por lista de CNPJs (sem chave/saldo).
  if (filters.fonte === 'brasilapi') {
    const pedidos = filters.cnpj ?? [];
    if (!pedidos.length) {
      return Response.json({ error: 'Cole ao menos um CNPJ para a fonte BrasilAPI.' }, { status: 400 });
    }
    const excluir = new Set((filters.excluirCnpjs ?? []).map((c) => c.replace(/\D/g, '')));
    const alvo = pedidos.map((c) => c.replace(/\D/g, '')).filter((d) => d.length === 14 && !excluir.has(d));
    try {
      const leads = await lookupManyBrasilApi(alvo, req.signal);
      return Response.json({ total: leads.length, leads });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // Fonte padrão: Casa dos Dados (busca por filtros).
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
