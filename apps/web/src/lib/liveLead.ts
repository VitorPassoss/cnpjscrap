/**
 * Helpers de render da página pública do lead (HTML real, sem iframe — o
 * template roda JS nativo e os dados ficam em window.LEAD). Compartilhado entre
 * o link curto /l/<code> e a "URL viva" /cnpj/<cnpj>.
 */

import { getSettings } from './db';
import { applyTemplate, renderTemplate } from './leadLink';
import { compileCss } from './tailwind';

export const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

const NOT_FOUND = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><script src="https://cdn.tailwindcss.com"></script></head><body class="min-h-screen flex items-center justify-center bg-zinc-100 p-6 text-center"><div><p class="text-lg font-semibold text-zinc-800">Lead não encontrado</p><p class="mt-1 text-sm text-zinc-500">Não foi possível montar a página deste CNPJ.</p></div></body></html>`;

export function notFoundResponse(): Response {
  return new Response(NOT_FOUND, { status: 404, headers: HTML_HEADERS });
}

/** Redireciona (302) o lead pra URL de destino do template tipo 'url'. */
export function redirectResponse(url: string): Response {
  return new Response(null, { status: 302, headers: { location: url } });
}

export interface ActiveTemplate {
  kind: 'html' | 'url';
  html: string;
  url: string;
  params: string[];
}

/** Template ativo da biblioteca como objeto (cai no primeiro se não houver ativo). */
export async function activeTemplate(): Promise<ActiveTemplate | null> {
  const s = await getSettings();
  const t = s.templates?.find((x) => x.id === s.activeTemplateId) ?? s.templates?.[0];
  if (!t) return null;
  return {
    kind: t.kind === 'url' ? 'url' : 'html',
    html: t.html ?? '',
    url: t.url ?? '',
    params: Array.isArray(t.params) ? t.params : [],
  };
}

/** Aplica as variáveis, compila o CSS (cacheado) e devolve a página HTML pronta. */
export async function renderLeadResponse(
  template: string,
  vars: Record<string, string>,
): Promise<Response> {
  let css: string | undefined;
  try {
    css = await compileCss(applyTemplate(template, vars));
  } catch {
    css = undefined; // falhou → renderTemplate cai no Tailwind CDN
  }
  return new Response(renderTemplate(template, vars, css), { status: 200, headers: HTML_HEADERS });
}
