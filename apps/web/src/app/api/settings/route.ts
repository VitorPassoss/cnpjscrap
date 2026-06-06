import { dbConfigured, getSettings, saveSettings, type Settings, type TemplateItem } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Nunca devolve a chave inteira pro navegador — só se existe e os 4 últimos. */
function publicShape(s: Settings, dbReady: boolean) {
  // Migra a config antiga (1 template) pra biblioteca, se ainda não houver nenhum.
  let templates = s.templates ?? [];
  if (!templates.length && s.template) {
    templates = [{ id: 'padrao', name: 'Padrão', html: s.template }];
  }
  let activeTemplateId = s.activeTemplateId ?? '';
  if (!activeTemplateId && templates[0]) activeTemplateId = templates[0].id;
  return {
    hasKey: !!s.apiKey,
    keyLast4: s.apiKey.slice(-4),
    template: s.template,
    disparoMsg: s.disparoMsg,
    templates,
    activeTemplateId,
    dbReady,
  };
}

export async function GET() {
  if (!dbConfigured()) {
    const envKey = process.env.CASADOSDADOS_API_KEY || '';
    return Response.json(
      publicShape({ apiKey: envKey, template: '', disparoMsg: '', templates: [], activeTemplateId: '' }, false),
    );
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
  let body: {
    apiKey?: unknown;
    template?: unknown;
    disparoMsg?: unknown;
    templates?: unknown;
    activeTemplateId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const patch: Partial<Settings> = {};
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) patch.apiKey = body.apiKey.trim();
  if (typeof body.template === 'string') patch.template = body.template;
  if (typeof body.disparoMsg === 'string') patch.disparoMsg = body.disparoMsg;
  if (Array.isArray(body.templates)) {
    patch.templates = (body.templates as unknown[])
      .filter(
        (t): t is TemplateItem =>
          !!t &&
          typeof (t as TemplateItem).id === 'string' &&
          typeof (t as TemplateItem).name === 'string' &&
          typeof (t as TemplateItem).html === 'string',
      )
      .slice(0, 3) // até 3 templates na biblioteca
      .map((t) => ({ id: t.id, name: t.name, html: t.html }));
  }
  if (typeof body.activeTemplateId === 'string') patch.activeTemplateId = body.activeTemplateId;

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
