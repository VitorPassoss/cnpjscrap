import { getSaldo, CasaDosDadosError } from '@/lib/casadosdados';
import { resolveApiKey } from '@/lib/resolveKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const key = await resolveApiKey(req);
  if (!key) return Response.json({ error: 'Informe a chave da API.' }, { status: 400 });
  try {
    const saldo = await getSaldo(key, req.signal);
    return Response.json(saldo);
  } catch (e) {
    const status = e instanceof CasaDosDadosError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
