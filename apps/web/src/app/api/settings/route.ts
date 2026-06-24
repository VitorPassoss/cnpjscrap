import { dbConfigured, EMPTY_PIX, getSettings, saveSettings, type PixSettings, type Settings, type TemplateItem } from '@/lib/db';

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
  const pix = s.pix ?? EMPTY_PIX;
  return {
    hasKey: !!s.apiKey,
    keyLast4: s.apiKey.slice(-4),
    template: s.template,
    disparoMsg: s.disparoMsg,
    templates,
    activeTemplateId,
    dbReady,
    // Config Pix sem expor o token — só se existe e os 4 últimos.
    pix: {
      provider: pix.provider,
      hasToken: !!pix.token,
      tokenLast4: pix.token.slice(-4),
      productHash: pix.productHash,
      upsellUrl: pix.upsellUrl,
    },
  };
}

export async function GET() {
  if (!dbConfigured()) {
    const envKey = process.env.CASADOSDADOS_API_KEY || '';
    return Response.json(
      publicShape(
        { apiKey: envKey, template: '', disparoMsg: '', templates: [], activeTemplateId: '', pix: EMPTY_PIX },
        false,
      ),
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
    pix?: unknown;
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
      .map((t) => {
        const item: TemplateItem = { id: t.id, name: t.name, html: t.html };
        if (t.kind === 'url') {
          item.kind = 'url';
          item.url = typeof t.url === 'string' ? t.url.trim() : '';
          item.params = Array.isArray(t.params)
            ? t.params.filter((p): p is string => typeof p === 'string' && !!p)
            : [];
        }
        return item;
      });
  }
  if (typeof body.activeTemplateId === 'string') patch.activeTemplateId = body.activeTemplateId;

  // Pix: faz merge com o que já está salvo. Token só é sobrescrito se vier
  // preenchido (assim salvar provider/upsell não apaga a chave existente).
  if (body.pix && typeof body.pix === 'object') {
    const p = body.pix as Record<string, unknown>;
    const cur = (await getSettings()).pix;
    const s = (v: unknown, fallback: string) => (typeof v === 'string' ? v.trim() : fallback);
    const next: PixSettings = {
      provider: s(p.provider, cur.provider),
      token: p.token && typeof p.token === 'string' && p.token.trim() ? p.token.trim() : cur.token,
      productHash: s(p.productHash, cur.productHash),
      upsellUrl: s(p.upsellUrl, cur.upsellUrl),
    };
    patch.pix = next;
  }

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
