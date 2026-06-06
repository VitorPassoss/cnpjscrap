import { randomBytes } from 'crypto';
import { createLeadLink, dbConfigured } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function genCode(len = 7): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i]! % ALPHABET.length];
  return s;
}

export async function POST(req: Request) {
  if (!dbConfigured()) {
    return Response.json({ error: 'Banco não configurado — defina DATABASE_URL.' }, { status: 503 });
  }

  let body: { vars?: unknown; template?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  if (typeof body.vars !== 'object' || body.vars === null || typeof body.template !== 'string') {
    return Response.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  const payload = { v: body.vars, t: body.template };

  try {
    // tenta alguns códigos até achar um livre (colisão é raríssima)
    for (let i = 0; i < 5; i++) {
      const code = genCode();
      if (await createLeadLink(code, payload)) {
        return Response.json({ code });
      }
    }
    return Response.json({ error: 'Não foi possível gerar o código.' }, { status: 500 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
