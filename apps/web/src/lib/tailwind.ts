/**
 * Compila o CSS do Tailwind a partir do HTML do template, no servidor.
 *
 * Substitui o Tailwind Play CDN (que compila no navegador, em runtime, e deixa
 * a página lenta). Aqui geramos só as classes usadas pelo template, uma vez por
 * template (cache por hash), e injetamos como <style> inline — a página pública
 * chega com o CSS pronto, sem JS de runtime.
 */

import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const BASE = '@tailwind base;@tailwind components;@tailwind utilities;';

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const cache = new Map<string, string>();

/** CSS (com cache) das classes presentes no HTML do template. */
export async function compileCss(templateHtml: string): Promise<string> {
  const key = hash(templateHtml);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const result = await postcss([
    tailwindcss({
      content: [{ raw: templateHtml, extension: 'html' }],
      theme: { extend: {} },
      corePlugins: { preflight: true },
    }),
    autoprefixer(),
  ]).process(BASE, { from: undefined });

  const css = result.css;
  cache.set(key, css);
  return css;
}
