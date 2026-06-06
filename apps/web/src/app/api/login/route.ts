export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE = 'panel_auth';

export async function POST(req: Request) {
  const esperada = process.env.PANEL_PASSWORD;
  if (!esperada) return Response.json({ ok: true }); // sem senha configurada

  let senha = '';
  try {
    senha = (((await req.json()) as { senha?: unknown }).senha as string) || '';
  } catch {
    return Response.json({ ok: false, error: 'Corpo inválido.' }, { status: 400 });
  }

  if (senha !== esperada) {
    return Response.json({ ok: false, error: 'Senha incorreta.' }, { status: 401 });
  }

  const cookie = [
    `${COOKIE}=${encodeURIComponent(esperada)}`,
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
