import { NextResponse, type NextRequest } from 'next/server';

/**
 * Senha mestra do painel.
 * Protege a raiz `/` e as APIs do painel. Os links públicos (/l/<code>, /lead)
 * e o /login ficam abertos. Se PANEL_PASSWORD não estiver definida, não bloqueia.
 */

export const COOKIE = 'panel_auth';

export function middleware(req: NextRequest) {
  const senha = process.env.PANEL_PASSWORD;
  if (!senha) return NextResponse.next(); // sem senha configurada → tudo aberto

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie === senha) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

// Protege tudo, exceto os links públicos, o login e os assets estáticos.
export const config = {
  matcher: ['/((?!l/|lead|login|api/login|_next/|favicon).*)'],
};
