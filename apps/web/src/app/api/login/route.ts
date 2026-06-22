export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE = 'panel_auth';

export async function POST(req: Request) {
  const esperado = process.env.PANEL_PIN || process.env.PANEL_PASSWORD;
  if (!esperado) return Response.json({ ok: true }); // sem PIN configurado

  let pin = '';
  try {
    const body = (await req.json()) as { pin?: unknown; senha?: unknown };
    pin = String(body.pin ?? body.senha ?? '');
  } catch {
    return Response.json({ ok: false, error: 'Corpo inválido.' }, { status: 400 });
  }

  if (pin !== esperado) {
    return Response.json({ ok: false, error: 'PIN incorreto.' }, { status: 401 });
  }

  const cookie = [
    `${COOKIE}=${encodeURIComponent(esperado)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000', // 30 dias
    'Secure',
  ].join('; ');

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': cookie },
  });
}
