import { debugRawFirst, CasaDosDadosError, type SearchFilters } from '@/lib/casadosdados';
import { resolveApiKey } from '@/lib/resolveKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DEBUG temporário: GET /api/raw?uf=SP → JSON cru do 1º CNPJ (pra ver os campos de telefone).
export async function GET(req: Request) {
  const key = await resolveApiKey(req);
  if (!key) return Response.json({ error: 'Sem chave da API.' }, { status: 400 });

  const uf = new URL(req.url).searchParams.get('uf') || 'SP';
  const filters: SearchFilters = {
    uf: [uf],
    situacao: ['ATIVA'],
    comTelefone: true,
    somenteCelular: true,
  };

  try {
    const raw = await debugRawFirst(key, filters, req.signal);
    return Response.json({ raw });
  } catch (e) {
    const status = e instanceof CasaDosDadosError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
