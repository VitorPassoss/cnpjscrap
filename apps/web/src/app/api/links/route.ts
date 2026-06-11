import { randomBytes } from 'crypto';
import { createLeadLink, createLeadLinksBatch, dbConfigured } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function genCode(len = 7): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i]! % ALPHABET.length];
  return s;
}

interface BatchItem {
  cnpj: string;
  vars: Record<string, unknown>;
}

export async function POST(req: Request) {
  if (!dbConfigured()) {
    return Response.json({ error: 'Banco não configurado — defina DATABASE_URL.' }, { status: 503 });
  }

  let body: { vars?: unknown; template?: unknown; templateId?: unknown; batch?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  // `templateId` (ti): referência viva — o /l/<code> resolve o HTML atual do
  // template no momento em que o lead abre, então editar o template no painel
  // atualiza todos os links dele. `template` (t) vai junto só como snapshot de
  // fallback (caso o template seja apagado da biblioteca).
  const template = typeof body.template === 'string' ? body.template : '';
  const templateId = typeof body.templateId === 'string' ? body.templateId : undefined;

  // ── Lote: { batch: [{ cnpj, vars }], template } → { links: { [cnpj]: code } } ──
  if (Array.isArray(body.batch)) {
    const items = body.batch.filter(
      (it): it is BatchItem =>
        !!it && typeof (it as BatchItem).cnpj === 'string' && typeof (it as BatchItem).vars === 'object',
    );
    const rows: { code: string; payload: unknown }[] = [];
    const links: Record<string, string> = {};
    const usados = new Set<string>();
    for (const it of items) {
      let code = genCode();
      while (usados.has(code)) code = genCode();
      usados.add(code);
      rows.push({ code, payload: { v: it.vars, t: template, ti: templateId } });
      links[it.cnpj] = code;
    }
    try {
      await createLeadLinksBatch(rows);
      return Response.json({ links });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── Individual: { vars, template } → { code } ──
  if (typeof body.vars !== 'object' || body.vars === null) {
    return Response.json({ error: 'Payload inválido.' }, { status: 400 });
  }
  const payload = { v: body.vars, t: template, ti: templateId };
  try {
    for (let i = 0; i < 5; i++) {
      const code = genCode();
      if (await createLeadLink(code, payload)) return Response.json({ code });
    }
    return Response.json({ error: 'Não foi possível gerar o código.' }, { status: 500 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
