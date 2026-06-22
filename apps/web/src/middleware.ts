import { NextResponse, type NextRequest } from 'next/server';

/**
 * PIN de acesso ao painel.
 * Protege a raiz `/` e as APIs do painel. Os links públicos (/l/<code>, /lead,
 * /cnpj/<cnpj>) e o /login ficam abertos. Configure `PANEL_PIN` (ou, por
 * compatibilidade, `PANEL_PASSWORD`). Se nenhum estiver definido, não bloqueia.
 */

export const COOKIE = 'panel_auth';

export function middleware(req: NextRequest) {
  const pin = process.env.PANEL_PIN || process.env.PANEL_PASSWORD;
  if (!pin) return NextResponse.next(); // sem PIN configurado → tudo aberto

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie === pin) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

// Protege APENAS a página raiz `/`. Tudo o mais (login, APIs, links públicos,
// assets) fica aberto.
export const config = {
  matcher: ['/'],
};
