import { dbConfigured, getSettings, saveSettings, type Settings } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Nunca devolve a chave inteira pro navegador — só se existe e os 4 últimos. */
function publicShape(s: Settings, dbReady: boolean) {
  return {
    hasKey: !!s.apiKey,
    keyLast4: s.apiKey.slice(-4),
    template: s.template,
    dbReady,
  };
}

export async function GET() {
  if (!dbConfigured()) {
    const envKey = process.env.CASADOSDADOS_API_KEY || '';
    return Response.json(publicShape({ apiKey: envKey, template: '' }, false));
  }
  try {
    const s = await getSettings();
    return Response.json(publicShape(s, true));
  } catch (e) {
    return Response.json({ error: (e as Error).message, dbReady: true }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!dbConfigured()) {
    return Response.json({ error: 'Banco não configurado — defina DATABASE_URL.' }, { status: 503 });
  }
  let body: { apiKey?: unknown; template?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const patch: Partial<Settings> = {};
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) patch.apiKey = body.apiKey.trim();
  if (typeof body.template === 'string') patch.template = body.template;

  if (!Object.keys(patch).length) {
    return Response.json({ error: 'Nada para salvar.' }, { status: 400 });
  }

  try {
    const s = await saveSettings(patch);
    return Response.json(publicShape(s, true));
  } catch (e) {
    return Response.json({ error: (e as Error).message, dbReady: true }, { status: 500 });
  }
}
