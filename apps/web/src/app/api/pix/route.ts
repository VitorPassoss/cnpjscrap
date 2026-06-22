import { PixError, resolveProvider, type PixChargeInput } from '@/lib/pix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy de cobrança Pix. O template (em qualquer host) faz:
 *   POST /api/pix  { amount, description?, payerName?, payerEmail?, payerDoc?, payerPhone? }
 *     → { txid, copiaECola, qrImageBase64, amount, status }
 *   POST /api/pix  { action: 'status', txid }
 *     → { status, paid, redirectUrl? }   (redirectUrl só quando paid)
 *
 * CORS liberado (configurável via PIX_ALLOWED_ORIGINS="https://a.com,https://b.com").
 * A credencial do gateway fica só no servidor — nunca vai pro navegador.
 */

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = (process.env.PIX_ALLOWED_ORIGINS || '*').trim();
  let allowOrigin = '*';
  if (allow !== '*') {
    const list = allow.split(',').map((s) => s.trim()).filter(Boolean);
    allowOrigin = origin && list.includes(origin) ? origin : list[0] || '*';
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(obj: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export function OPTIONS(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corpo inválido (esperado JSON).' }, 400, origin);
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

  try {
    // Ação de consulta de status (polling pós-pagamento).
    if (str(body.action) === 'status') {
      const txid = str(body.txid);
      if (!txid) return json({ error: 'txid obrigatório para status.' }, 400, origin);
      const provider = resolveProvider();
      if (!provider.checkStatus) {
        return json({ error: 'Este gateway não suporta consulta de status.' }, 400, origin);
      }
      return json(await provider.checkStatus(txid), 200, origin);
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: 'amount inválido — informe um valor maior que zero.' }, 400, origin);
    }
    const input: PixChargeInput = {
      amount: Math.round(amount * 100) / 100,
      description: str(body.description),
      payerName: str(body.payerName),
      payerEmail: str(body.payerEmail),
      payerDoc: str(body.payerDoc)?.replace(/\D/g, ''),
      payerPhone: str(body.payerPhone)?.replace(/\D/g, ''),
    };

    const charge = await resolveProvider().createCharge(input);
    return json(charge, 200, origin);
  } catch (e) {
    if (e instanceof PixError) {
      return json({ error: e.message, details: e.details }, e.status, origin);
    }
    return json({ error: (e as Error).message || 'Falha ao gerar cobrança.' }, 502, origin);
  }
}
