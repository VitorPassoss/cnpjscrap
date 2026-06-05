import { getSaldo, CasaDosDadosError } from '@/lib/casadosdados';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolveKey(req: Request): string {
  return req.headers.get('x-api-key') || process.env.CASADOSDADOS_API_KEY || '';
}

export async function GET(req: Request) {
  const key = resolveKey(req);
  if (!key) return Response.json({ error: 'Informe a chave da API.' }, { status: 400 });
  try {
    const saldo = await getSaldo(key, req.signal);
    return Response.json(saldo);
  } catch (e) {
    const status = e instanceof CasaDosDadosError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
