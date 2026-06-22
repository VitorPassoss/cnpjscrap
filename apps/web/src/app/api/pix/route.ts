import { createProvider, PixError, type PixChargeInput, type PixProvider } from '@/lib/pix';
import { dbConfigured, getSettings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Promise com teto de tempo — evita uma leitura de banco pendurada virar 502. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

interface CfgShape {
  provider: string;
  token: string;
  productHash: string;
  upsellUrl: string;
  asaasBase?: string;
}

// Cache curto da config (o polling chama isto a cada poucos segundos; sem cache
// cada chamada bate no banco e pode pendurar/atrasar a resposta).
let cfgCache: { cfg: CfgShape; at: number } | null = null;
const CFG_TTL = 30_000;

async function loadConfig(): Promise<CfgShape> {
  if (cfgCache && Date.now() - cfgCache.at < CFG_TTL) return cfgCache.cfg;

  let cfg: CfgShape = { provider: '', token: '', productHash: '', upsellUrl: '' };
  if (dbConfigured()) {
    try {
      const { pix } = await withTimeout(getSettings(), 5000);
      if (pix.provider && pix.token) {
        cfg = { provider: pix.provider, token: pix.token, productHash: pix.productHash, upsellUrl: pix.upsellUrl };
      }
    } catch {
      // banco lento/indisponível → cai no env abaixo
    }
  }
  if (!cfg.provider || !cfg.token) {
    cfg = {
      provider: process.env.PIX_PROVIDER || '',
      token: process.env.PIX_TOKEN || '',
      productHash: process.env.PARADISE_PRODUCT_HASH || '',
      upsellUrl: process.env.PARADISE_UPSELL_URL || '',
    };
  }
  cfg.asaasBase = process.env.PIX_ASAAS_BASE;
  if (cfg.provider && cfg.token) cfgCache = { cfg, at: Date.now() }; // só cacheia config válida
  return cfg;
}

/** Monta o provider a partir da config (painel → env), com cache. */
async function buildProvider(): Promise<PixProvider> {
  return createProvider(await loadConfig());
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', // cacheia o preflight 24h (menos OPTIONS no polling)
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
  try {
    const cfg = await loadConfig();
    return json(
      { ok: true, route: 'alive', provider: cfg.provider || '(nenhum)', configured: !!(cfg.provider && cfg.token) },
      200,
      origin,
    );
  } catch (e) {
    return json({ ok: false, error: `Falha ao ler config: ${(e as Error).message}` }, 200, origin);
  }
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
