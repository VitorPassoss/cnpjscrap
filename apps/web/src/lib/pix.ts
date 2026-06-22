/**
 * Proxy de cobrança Pix — padroniza gateways diferentes atrás de uma única
 * interface. O template (em qualquer host) chama POST /api/pix com um corpo
 * normalizado e recebe sempre o mesmo formato (copia-e-cola + QR base64),
 * independente do gateway. A credencial fica só no servidor (env), nunca no
 * navegador — resolve o CORS e o vazamento de chave de uma vez.
 *
 * A config (provider, token, productHash, upsellUrl) vem do painel (banco),
 * via createProvider(cfg). O token nunca trafega de volta pro navegador.
 * Para a Paradise, productHash vazio é resolvido automaticamente pela API.
 */

// ───────────────────────── formatos normalizados ─────────────────────────

export interface PixChargeInput {
  amount: number;
  description?: string;
  payerName?: string;
  payerEmail?: string;
  payerDoc?: string; // CPF/CNPJ só dígitos
  payerPhone?: string; // só dígitos
}

export interface PixCharge {
  txid: string;
  copiaECola: string; // payload EMV (Pix copia-e-cola)
  qrImageBase64?: string; // data:image/png;base64,... (quando o gateway já devolve)
  amount: number;
  status: string;
}

export interface PixStatus {
  status: string;
  paid: boolean;
  redirectUrl?: string; // só preenchido quando paid === true
}

export interface PixProvider {
  createCharge(input: PixChargeInput): Promise<PixCharge>;
  /** Consulta o status de uma cobrança (quando o gateway suporta). */
  checkStatus?(txid: string): Promise<PixStatus>;
}

/** Erro com status HTTP pra propagar direitinho pro cliente. */
export class PixError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PixError';
  }
}

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** Timeout (ms) das chamadas a gateways — evita request pendurada virar 502. */
const FETCH_TIMEOUT = 15_000;

/** fetch com timeout; converte "travou/sem resposta" em PixError legível. */
async function pixFetch(url: string, init: RequestInit, label: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  } catch (e) {
    const aborted = (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError';
    console.error(`[pix] ${label}: ${aborted ? 'timeout' : 'falha de rede'} → ${(e as Error)?.message}`);
    throw new PixError(
      aborted ? `${label}: gateway não respondeu a tempo.` : `${label}: falha de rede (${(e as Error).message}).`,
      504,
    );
  }
}

/**
 * Lê o corpo como JSON com tolerância. Gateways às vezes devolvem HTML/texto
 * (página de erro própria, 502/504 do balanceador deles, corpo vazio). Em vez de
 * estourar um "Unexpected token <" cru — que vira um 502 sem explicação — devolve
 * {} e LOGA o corpo real, deixando o chamador decidir pelo status HTTP.
 */
async function readJson(res: Response, label: string): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  if (!text) {
    if (!res.ok) console.error(`[pix] ${label}: corpo vazio (HTTP ${res.status})`);
    return {};
  }
  try {
    return asObj(JSON.parse(text));
  } catch {
    console.error(`[pix] ${label}: resposta não-JSON (HTTP ${res.status}): ${text.slice(0, 400)}`);
    return {};
  }
}

// ───────────────────────── Mercado Pago ─────────────────────────
// Cobrança Pix em uma chamada: POST /v1/payments (payment_method_id: 'pix').

function mercadoPago(token: string): PixProvider {
  return {
    async createCharge(input) {
      const res = await pixFetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          transaction_amount: input.amount,
          description: input.description || 'Pagamento',
          payment_method_id: 'pix',
          payer: {
            email: input.payerEmail || 'sem-email@cliente.com',
            ...(input.payerName ? { first_name: input.payerName } : {}),
            ...(input.payerDoc
              ? {
                  identification: {
                    type: input.payerDoc.length > 11 ? 'CNPJ' : 'CPF',
                    number: input.payerDoc,
                  },
                }
              : {}),
          },
        }),
      }, 'Mercado Pago');
      const data = await readJson(res, 'Mercado Pago');
      if (!res.ok) {
        throw new PixError(String(data.message || 'Falha no Mercado Pago'), res.status, data);
      }
      const tx = asObj(asObj(data.point_of_interaction).transaction_data);
      return {
        txid: String(data.id ?? ''),
        copiaECola: String(tx.qr_code ?? ''),
        qrImageBase64: tx.qr_code_base64
          ? `data:image/png;base64,${String(tx.qr_code_base64)}`
          : undefined,
        amount: Number(data.transaction_amount ?? input.amount),
        status: String(data.status ?? 'pending'),
      };
    },
  };
}

// ───────────────────────── Asaas ─────────────────────────
// 3 passos: cria cliente → cria cobrança PIX → busca o QR.

function asaas(token: string, base = 'https://api.asaas.com/v3'): PixProvider {
  const headers = { access_token: token, 'Content-Type': 'application/json' };
  const dueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); // amanhã (YYYY-MM-DD)
  const firstError = (d: Record<string, unknown>, fallback: string) =>
    String((asObj((d.errors as unknown[])?.[0]).description as string) || fallback);

  return {
    async createCharge(input) {
      const cRes = await pixFetch(`${base}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: input.payerName || 'Cliente',
          ...(input.payerDoc ? { cpfCnpj: input.payerDoc } : {}),
          ...(input.payerEmail ? { email: input.payerEmail } : {}),
        }),
      }, 'Asaas (cliente)');
      const customer = await readJson(cRes, 'Asaas (cliente)');
      if (!cRes.ok) throw new PixError(firstError(customer, 'Falha ao criar cliente Asaas'), cRes.status, customer);

      const pRes = await pixFetch(`${base}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer: customer.id,
          billingType: 'PIX',
          value: input.amount,
          dueDate,
          description: input.description || 'Pagamento',
        }),
      }, 'Asaas (cobrança)');
      const pay = await readJson(pRes, 'Asaas (cobrança)');
      if (!pRes.ok) throw new PixError(firstError(pay, 'Falha na cobrança Asaas'), pRes.status, pay);

      const qRes = await pixFetch(`${base}/payments/${pay.id}/pixQrCode`, { headers }, 'Asaas (QR)');
      const qr = await readJson(qRes, 'Asaas (QR)');
      if (!qRes.ok) throw new PixError(firstError(qr, 'Falha ao gerar QR Asaas'), qRes.status, qr);

      return {
        txid: String(pay.id ?? ''),
        copiaECola: String(qr.payload ?? ''),
        qrImageBase64: qr.encodedImage ? `data:image/png;base64,${String(qr.encodedImage)}` : undefined,
        amount: Number(pay.value ?? input.amount),
        status: String(pay.status ?? 'PENDING'),
      };
    },
  };
}

// ───────────────────────── Paradise Pag ─────────────────────────
// create: POST /api/v1/transaction  (amount em CENTAVOS, productHash, customer)
// status: GET  /api/v1/check_status.php?hash=<external_id>
// Exige TODOS os dados reais do comprador — nada é gerado/fabricado aqui.

function paradise(token: string, productHash: string, upsellUrl?: string): PixProvider {
  const base = 'https://multi.paradisepags.com/api/v1';
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': token };
  return {
    async createCharge(input) {
      // Dados reais do pagador são obrigatórios — sem CPF/e-mail fabricado.
      const need: [keyof PixChargeInput, string][] = [
        ['payerName', 'nome'],
        ['payerEmail', 'e-mail'],
        ['payerDoc', 'CPF/CNPJ'],
        ['payerPhone', 'telefone'],
      ];
      const missing = need.filter(([k]) => !input[k]).map(([, label]) => label);
      if (missing.length) {
        throw new PixError(`Dados do pagador obrigatórios: ${missing.join(', ')}.`, 400);
      }

      const res = await pixFetch(`${base}/transaction.php`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: Math.round(input.amount * 100), // Paradise usa centavos
          description: input.description || 'Pagamento',
          reference: crypto.randomUUID(), // identificador único obrigatório
          // Sem productHash → source 'api_externa' dispensa o cadastro do produto.
          ...(productHash ? { productHash } : { source: 'api_externa' }),
          customer: {
            name: input.payerName,
            email: input.payerEmail,
            document: input.payerDoc,
            phone: input.payerPhone,
          },
        }),
      }, 'Paradise (transação)');
      const data = await readJson(res, 'Paradise (transação)');
      if (!res.ok || data.status === 'error') {
        const msg = String(data.message || data.error || 'Falha na Paradise');
        console.error(`[pix] Paradise (transação) recusou (HTTP ${res.status}): ${msg}`);
        // res.ok com status:"error" no corpo → 502 (gateway recusou), nunca 200.
        throw new PixError(msg, res.ok ? 502 : res.status, data);
      }

      const copiaECola = String(data.qr_code ?? '');
      if (!copiaECola) {
        throw new PixError('Paradise não retornou o código Pix.', 502, data);
      }
      const qrImg = String(data.qr_code_base64 ?? '');
      return {
        // transaction_id (ID interno) é o usado na consulta de status.
        txid: String(data.transaction_id ?? data.id ?? ''),
        copiaECola,
        qrImageBase64: qrImg ? (qrImg.startsWith('data:') ? qrImg : `data:image/png;base64,${qrImg}`) : undefined,
        amount: Number(data.amount ?? Math.round(input.amount * 100)) / 100,
        status: 'pending',
      };
    },

    async checkStatus(txid) {
      const res = await pixFetch(
        `${base}/query.php?action=get_transaction&id=${encodeURIComponent(txid)}`,
        { headers: { 'X-API-Key': token } },
        'Paradise (status)',
      );
      const data = await readJson(res, 'Paradise (status)');
      if (!res.ok) {
        throw new PixError(String(data.message || data.error || 'Falha ao consultar status'), res.status, data);
      }
      const raw = String(data.status ?? '').toLowerCase();
      const paid = raw === 'approved';
      return {
        status: raw || 'pending',
        paid,
        // URL de destino fica no servidor e só sai depois de pago.
        redirectUrl: paid ? upsellUrl || undefined : undefined,
      };
    },
  };
}

// ───────────────────────── seleção via config (painel) ─────────────────────────

export interface PixProviderConfig {
  provider: string; // mercadopago | asaas | paradise
  token: string;
  productHash?: string; // paradise; vazio = automático
  upsellUrl?: string; // paradise; destino pós-pagamento
  asaasBase?: string; // opcional (sandbox)
}

/** Monta o provider a partir da config salva no painel. Lança PixError se faltar config. */
export function createProvider(cfg: PixProviderConfig): PixProvider {
  const name = (cfg.provider || '').toLowerCase().trim();
  const token = cfg.token || '';
  if (!name) throw new PixError('Gateway Pix não configurado no painel.', 500);
  if (!token) throw new PixError('Token do gateway não configurado no painel.', 500);

  switch (name) {
    case 'mercadopago':
    case 'mp':
      return mercadoPago(token);
    case 'asaas':
      return asaas(token, cfg.asaasBase);
    case 'paradise':
    case 'paradisepags':
      return paradise(token, cfg.productHash || '', cfg.upsellUrl);
    default:
      throw new PixError(`Gateway inválido: "${name}". Use mercadopago, asaas ou paradise.`, 500);
  }
}
