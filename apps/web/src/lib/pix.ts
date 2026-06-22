/**
 * Proxy de cobrança Pix — padroniza gateways diferentes atrás de uma única
 * interface. O template (em qualquer host) chama POST /api/pix com um corpo
 * normalizado e recebe sempre o mesmo formato (copia-e-cola + QR base64),
 * independente do gateway. A credencial fica só no servidor (env), nunca no
 * navegador — resolve o CORS e o vazamento de chave de uma vez.
 *
 * Configuração (env):
 *   PIX_PROVIDER = mercadopago | asaas | paradise
 *   PIX_TOKEN    = access token / api key do gateway
 *   PIX_ASAAS_BASE (opcional) = https://sandbox.asaas.com/api/v3 p/ testes
 *   PARADISE_PRODUCT_HASH = hash do produto (obrigatório p/ paradise)
 *   PARADISE_UPSELL_URL (opcional) = destino devolvido SÓ após pagar
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

// ───────────────────────── Mercado Pago ─────────────────────────
// Cobrança Pix em uma chamada: POST /v1/payments (payment_method_id: 'pix').

function mercadoPago(token: string): PixProvider {
  return {
    async createCharge(input) {
      const res = await fetch('https://api.mercadopago.com/v1/payments', {
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
      });
      const data = asObj(await res.json());
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
      const cRes = await fetch(`${base}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: input.payerName || 'Cliente',
          ...(input.payerDoc ? { cpfCnpj: input.payerDoc } : {}),
          ...(input.payerEmail ? { email: input.payerEmail } : {}),
        }),
      });
      const customer = asObj(await cRes.json());
      if (!cRes.ok) throw new PixError(firstError(customer, 'Falha ao criar cliente Asaas'), cRes.status, customer);

      const pRes = await fetch(`${base}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customer: customer.id,
          billingType: 'PIX',
          value: input.amount,
          dueDate,
          description: input.description || 'Pagamento',
        }),
      });
      const pay = asObj(await pRes.json());
      if (!pRes.ok) throw new PixError(firstError(pay, 'Falha na cobrança Asaas'), pRes.status, pay);

      const qRes = await fetch(`${base}/payments/${pay.id}/pixQrCode`, { headers });
      const qr = asObj(await qRes.json());
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

/** Lê o primeiro valor não-vazio dentre vários caminhos (suporta "a.b.c"). */
function firstStr(obj: Record<string, unknown>, paths: string[]): string {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const part of path.split('.')) {
      cur = asObj(cur)[part];
      if (cur == null) break;
    }
    if (cur != null && cur !== '') return String(cur);
  }
  return '';
}

function paradise(token: string, productHash: string): PixProvider {
  const base = 'https://multi.paradisepags.com/api/v1';
  return {
    async createCharge(input) {
      if (!productHash) throw new PixError('PARADISE_PRODUCT_HASH não configurado.', 500);

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

      const res = await fetch(`${base}/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': token },
        body: JSON.stringify({
          amount: Math.round(input.amount * 100), // Paradise usa centavos
          productHash,
          customer: {
            name: input.payerName,
            email: input.payerEmail,
            document: input.payerDoc,
            phone: input.payerPhone,
          },
        }),
      });
      const data = asObj(await res.json());
      if (!res.ok) {
        throw new PixError(String(data.message || data.error || 'Falha na Paradise'), res.status, data);
      }

      // Os nomes exatos dos campos variam conforme a conta/versão da Paradise;
      // por isso tentamos os mais comuns. Ajuste a lista se o seu retorno diferir.
      const copiaECola = firstStr(data, [
        'qr_code', 'qrcode', 'pix_qr_code', 'pixCode', 'copy_paste', 'copyPaste', 'emv',
        'pix.qrcode', 'pix.copy_paste', 'transaction.qr_code', 'data.qr_code',
      ]);
      const qrImg = firstStr(data, [
        'qr_code_base64', 'qrcode_base64', 'qrCodeImage', 'pix.qrcode_base64', 'data.qr_code_base64',
      ]);
      const txid = firstStr(data, [
        'hash', 'external_id', 'externalId', 'id', 'transaction.id', 'transaction.hash', 'data.hash',
      ]);

      if (!copiaECola) {
        throw new PixError('Paradise não retornou o código Pix (ajuste os campos em firstStr).', 502, data);
      }
      return {
        txid,
        copiaECola,
        qrImageBase64: qrImg
          ? qrImg.startsWith('data:')
            ? qrImg
            : `data:image/png;base64,${qrImg}`
          : undefined,
        amount: input.amount,
        status: firstStr(data, ['status', 'transaction.status']) || 'pending',
      };
    },

    async checkStatus(txid) {
      const res = await fetch(`${base}/check_status.php?hash=${encodeURIComponent(txid)}`, {
        headers: { 'X-API-Key': token },
      });
      const data = asObj(await res.json());
      if (!res.ok) {
        throw new PixError(String(data.message || data.error || 'Falha ao consultar status'), res.status, data);
      }
      const raw = String(data.status ?? '').toLowerCase();
      const paid = raw === 'paid' || raw === 'approved' || data.paid === true;
      return {
        status: paid ? 'paid' : raw || 'pending',
        paid,
        // URL de destino fica no servidor e só sai depois de pago.
        redirectUrl: paid ? process.env.PARADISE_UPSELL_URL || undefined : undefined,
      };
    },
  };
}

// ───────────────────────── seleção via env ─────────────────────────

/** Monta o provider conforme PIX_PROVIDER/PIX_TOKEN. Lança PixError se faltar config. */
export function resolveProvider(): PixProvider {
  const name = (process.env.PIX_PROVIDER || '').toLowerCase().trim();
  const token = process.env.PIX_TOKEN || '';
  if (!name) throw new PixError('PIX_PROVIDER não configurado (mercadopago | asaas).', 500);
  if (!token) throw new PixError('PIX_TOKEN não configurado.', 500);

  switch (name) {
    case 'mercadopago':
    case 'mp':
      return mercadoPago(token);
    case 'asaas':
      return asaas(token, process.env.PIX_ASAAS_BASE || undefined);
    case 'paradise':
    case 'paradisepags':
      return paradise(token, process.env.PARADISE_PRODUCT_HASH || '');
    default:
      throw new PixError(`PIX_PROVIDER inválido: "${name}". Use mercadopago, asaas ou paradise.`, 500);
  }
}
