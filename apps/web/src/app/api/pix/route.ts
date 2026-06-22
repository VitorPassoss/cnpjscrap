import { createProvider, PixError, type PixChargeInput, type PixProvider } from '@/lib/pix';
import { dbConfigured, getSettings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Monta o provider a partir da config salva no painel (banco). Cai pro env
 * (PIX_PROVIDER/PIX_TOKEN/…) como fallback de dev quando não há nada no banco.
 */
async function buildProvider(): Promise<PixProvider> {
  if (dbConfigured()) {
    try {
      const { pix } = await getSettings();
      if (pix.provider && pix.token) {
        return createProvider({
          provider: pix.provider,
          token: pix.token,
          productHash: pix.productHash,
          upsellUrl: pix.upsellUrl,
          asaasBase: process.env.PIX_ASAAS_BASE,
        });
      }
    } catch {
      // banco indisponível → tenta env abaixo
    }
  }
  return createProvider({
    provider: process.env.PIX_PROVIDER || '',
    token: process.env.PIX_TOKEN || '',
    productHash: process.env.PARADISE_PRODUCT_HASH || '',
    upsellUrl: process.env.PARADISE_UPSELL_URL || '',
    asaasBase: process.env.PIX_ASAAS_BASE,
  });
}

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

/** Diagnóstico: abra /api/pix no navegador pra ver se a rota está no ar e configurada. */
export async function GET(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  let provider = '';
  let configured = false;
  let source = 'nenhuma';
  try {
    if (dbConfigured()) {
      const { pix } = await getSettings();
      if (pix.provider) {
        provider = pix.provider;
        configured = !!pix.token;
        source = 'painel';
      }
    }
    if (!provider && process.env.PIX_PROVIDER) {
      provider = process.env.PIX_PROVIDER;
      configured = !!process.env.PIX_TOKEN;
      source = 'env';
    }
  } catch (e) {
    return json({ ok: false, error: `Falha ao ler config: ${(e as Error).message}` }, 200, origin);
  }
  return json({ ok: true, route: 'alive', provider, configured, source }, 200, origin);
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
      const provider = await buildProvider();
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

    const provider = await buildProvider();
    const charge = await provider.createCharge(input);
    return json(charge, 200, origin);
  } catch (e) {
    if (e instanceof PixError) {
      return json({ error: e.message, details: e.details }, e.status, origin);
    }
    return json({ error: (e as Error).message || 'Falha ao gerar cobrança.' }, 502, origin);
  }
}
