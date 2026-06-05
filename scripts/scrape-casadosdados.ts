/**
 * Scraper do Casa dos Dados — extrai CNPJs ATIVOS com WhatsApp (celular)
 * usando SOMENTE a API pública gratuita (sem chave paga).
 *
 * Como funciona:
 *  1. Busca (POST /v5/public/cnpj/pesquisa) — filtros ATIVA + UF + CNAE +
 *     com_telefone + somente_celular. A API gratuita devolve no máximo 20
 *     CNPJs por consulta (cap rígido), então fatiamos o universo por MUNICÍPIO
 *     (lista oficial do IBGE) pra acumular volume.
 *  2. Detalhe (GET https://casadosdados.com.br/solucao/cnpj/x-<cnpj>, SSR) —
 *     a lista não traz telefone; pegamos WhatsApp/telefones/email no HTML da
 *     página de detalhe.
 *  3. Saída CSV pt-BR (UTF-8 BOM, separador ';') — abre certo no Excel BR.
 *
 * Uso:
 *   pnpm scrape --uf SP --limit 200
 *   pnpm scrape --uf SP --cnae 5611201,4712100 --limit 500 --format both
 *   pnpm scrape --municipios "SAO PAULO,CAMPINAS" --limit 100 --so-wpp
 *
 * Flags:
 *   --uf <UF>            UF alvo (default SP)
 *   --cnae <lista>       códigos CNAE separados por vírgula (ex: 5611201)
 *   --municipios <lista> sobrescreve a lista do IBGE (nomes separados por vírgula)
 *   --situacao <S>       ATIVA | BAIXADA | INAPTA | SUSPENSA | NULA (default ATIVA)
 *   --limit <n>          quantos leads coletar (default 200)
 *   --so-wpp             descarta leads sem WhatsApp (default: mantém, WhatsApp primeiro)
 *   --format <f>         csv | json | both (default csv)
 *   --out <arquivo>      caminho de saída (default ./out/leads-<uf>-<ts>.csv)
 *   --concurrency <n>    requisições de detalhe simultâneas (default 5)
 *   --delay <ms>         atraso entre requisições de detalhe (default 400)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const API = 'https://api.casadosdados.com.br';
const SITE = 'https://casadosdados.com.br';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/html',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Origin: SITE,
  Referer: `${SITE}/`,
};

// ───────────────────────── tipos ─────────────────────────

type Situacao = 'ATIVA' | 'BAIXADA' | 'INAPTA' | 'SUSPENSA' | 'NULA';

interface SearchItem {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: { situacao_atual: string; motivo: string; data: string };
}
interface SearchResponse {
  total: number;
  cnpjs: SearchItem[];
}

interface Lead {
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  dataSituacao: string;
  uf: string;
  municipio: string;
  whatsapp: string; // primeiro celular, formato 55DDDNUMERO
  whatsappLink: string;
  celulares: string[];
  telefones: string[];
  email: string;
  fonte: string;
}

interface Options {
  uf: string;
  cnaes: string[];
  municipios: string[] | null;
  situacao: Situacao;
  limit: number;
  soWpp: boolean;
  format: 'csv' | 'json' | 'both';
  out: string | null;
  concurrency: number;
  delay: number;
}

// ───────────────────────── utils ─────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normaliza nome de município pro formato do Casa dos Dados: MAIÚSCULAS, sem acento. */
function normalizeMunicipio(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function formatCnpj(cnpj: string): string {
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

/** fetch com retry/backoff; respeita 429/403 (Cloudflare). */
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status === 503) {
        await sleep(1500 * (i + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(800 * (i + 1));
    }
  }
  if (lastErr) throw lastErr;
  return fetch(url, init);
}

// ──────────────────────── API calls ────────────────────────

function searchBody(opts: Options, municipio: string | null) {
  return JSON.stringify({
    cnpj: [],
    cnpj_raiz: [],
    situacao_cadastral: [opts.situacao],
    codigo_atividade_principal: opts.cnaes,
    codigo_natureza_juridica: [],
    incluir_atividade_secundaria: false,
    uf: opts.uf ? [opts.uf] : [],
    municipio: municipio ? [municipio] : [],
    bairro: [],
    cep: [],
    ddd: [],
    data_abertura: {},
    capital_social: { minimo: 0, maximo: 0 },
    mei: { optante: false, excluir_optante: false },
    simples: { optante: false, excluir_optante: false },
    mais_filtros: {
      somente_matriz: false,
      somente_filial: false,
      com_email: false,
      com_telefone: true, // só CNPJs com telefone
      somente_fixo: false,
      somente_celular: true, // só celular (= candidato a WhatsApp)
    },
    limite: 20,
  });
}

/** Uma fatia de busca: até 20 CNPJs de um município. */
async function searchSlice(opts: Options, municipio: string | null): Promise<SearchItem[]> {
  const res = await fetchRetry(`${API}/v5/public/cnpj/pesquisa`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: searchBody(opts, municipio),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as SearchResponse;
  return data.cnpjs ?? [];
}

/** Lista de municípios da UF via IBGE (oficial, sem Cloudflare). */
async function municipiosIBGE(uf: string): Promise<string[]> {
  const res = await fetchRetry(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
    { headers: { 'User-Agent': UA } },
  );
  const data = (await res.json()) as Array<{ nome: string }>;
  return data.map((m) => normalizeMunicipio(m.nome));
}

/** Metrópoles de SP primeiro — maior densidade de empresas, menos requisições pra bater a meta. */
const SP_PRIORITARIOS = [
  'SAO PAULO',
  'GUARULHOS',
  'CAMPINAS',
  'SAO BERNARDO DO CAMPO',
  'SANTO ANDRE',
  'OSASCO',
  'SAO JOSE DOS CAMPOS',
  'RIBEIRAO PRETO',
  'SOROCABA',
  'SANTOS',
  'MAUA',
  'SAO JOSE DO RIO PRETO',
  'MOGI DAS CRUZES',
  'DIADEMA',
  'JUNDIAI',
  'PIRACICABA',
  'CARAPICUIBA',
  'BAURU',
  'ITAQUAQUECETUBA',
  'FRANCA',
];

function ordenarMunicipios(uf: string, lista: string[]): string[] {
  if (uf !== 'SP') return lista;
  const set = new Set(lista);
  const head = SP_PRIORITARIOS.filter((m) => set.has(m));
  const headSet = new Set(head);
  return [...head, ...lista.filter((m) => !headSet.has(m))];
}

/** Página de detalhe (SSR) → telefones/WhatsApp/email. Sem slug: x-<cnpj> resolve. */
async function fetchDetalhe(cnpj: string): Promise<{
  celulares: string[];
  telefones: string[];
  email: string;
  whatsapps: string[];
}> {
  const url = `${SITE}/solucao/cnpj/x-${cnpj}`;
  const res = await fetchRetry(url, { headers: HEADERS });
  if (!res.ok) return { celulares: [], telefones: [], email: '', whatsapps: [] };
  const html = await res.text();

  const whatsapps = [...new Set([...html.matchAll(/api\.whatsapp\.com\/send\?phone=(\d+)/g)].map((m) => m[1]!))];
  const telefones = [...new Set([...html.matchAll(/href="tel:([0-9 +-]+)"/g)].map((m) => m[1]!.trim()))];
  const emailMatch = html.match(/mailto:([^"?]+)/);
  const email = emailMatch ? emailMatch[1]!.trim() : '';

  // celular = telefone cujo número (após DDD) começa com 9 e tem 9 dígitos
  const celulares = telefones.filter((t) => {
    const dig = t.replace(/\D/g, '');
    const local = dig.length > 2 ? dig.slice(2) : dig;
    return local.length === 9 && local.startsWith('9');
  });

  return { celulares, telefones, email, whatsapps };
}

// ──────────────────────── pipeline ────────────────────────

async function coletarCnpjs(opts: Options): Promise<{ item: SearchItem; municipio: string }[]> {
  const municipios = opts.municipios ?? ordenarMunicipios(opts.uf, await municipiosIBGE(opts.uf));
  const alvo = Math.ceil(opts.limit * 1.15); // buffer pra detalhes que falham/sem wpp
  const vistos = new Set<string>();
  const out: { item: SearchItem; municipio: string }[] = [];

  for (const municipio of municipios) {
    if (out.length >= alvo) break;
    const items = await searchSlice(opts, municipio);
    for (const item of items) {
      if (vistos.has(item.cnpj)) continue;
      vistos.add(item.cnpj);
      out.push({ item, municipio });
    }
    process.stdout.write(
      `\r  buscando… ${out.length}/${alvo} CNPJs (município: ${municipio})            `,
    );
    await sleep(150);
  }
  process.stdout.write('\n');
  return out;
}

/** Pool de concorrência simples. */
async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

async function enriquecer(
  brutos: { item: SearchItem; municipio: string }[],
  opts: Options,
): Promise<Lead[]> {
  let done = 0;
  const leads = await pool(brutos, opts.concurrency, async ({ item, municipio }) => {
    const det = await fetchDetalhe(item.cnpj);
    if (opts.delay) await sleep(opts.delay);
    done++;
    process.stdout.write(`\r  detalhando… ${done}/${brutos.length} CNPJs            `);

    const wppDigits = det.whatsapps[0] ?? (det.celulares[0] ? '55' + det.celulares[0].replace(/\D/g, '') : '');
    const lead: Lead = {
      cnpj: item.cnpj,
      cnpjFormatado: formatCnpj(item.cnpj),
      razaoSocial: item.razao_social ?? '',
      nomeFantasia: item.nome_fantasia ?? '',
      situacao: item.situacao_cadastral?.situacao_atual ?? '',
      dataSituacao: (item.situacao_cadastral?.data ?? '').slice(0, 10),
      uf: opts.uf,
      municipio,
      whatsapp: wppDigits,
      whatsappLink: wppDigits ? `https://api.whatsapp.com/send?phone=${wppDigits}` : '',
      celulares: det.celulares,
      telefones: det.telefones,
      email: det.email,
      fonte: `${SITE}/solucao/cnpj/x-${item.cnpj}`,
    };
    return lead;
  });
  process.stdout.write('\n');

  // WhatsApp primeiro; opcionalmente descarta sem WhatsApp
  let finais = leads;
  if (opts.soWpp) finais = finais.filter((l) => l.whatsapp);
  finais.sort((a, b) => (b.whatsapp ? 1 : 0) - (a.whatsapp ? 1 : 0));
  return finais.slice(0, opts.limit);
}

// ──────────────────────── saída ────────────────────────

const COLS: { key: keyof Lead; label: string }[] = [
  { key: 'cnpjFormatado', label: 'cnpj' },
  { key: 'razaoSocial', label: 'razao_social' },
  { key: 'nomeFantasia', label: 'nome_fantasia' },
  { key: 'situacao', label: 'situacao' },
  { key: 'dataSituacao', label: 'data_situacao' },
  { key: 'uf', label: 'uf' },
  { key: 'municipio', label: 'municipio' },
  { key: 'whatsapp', label: 'whatsapp' },
  { key: 'whatsappLink', label: 'whatsapp_link' },
  { key: 'telefones', label: 'telefones' },
  { key: 'email', label: 'email' },
  { key: 'fonte', label: 'fonte' },
];

function toCsv(leads: Lead[]): string {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const head = COLS.map((c) => esc(c.label)).join(';');
  const rows = leads.map((l) =>
    COLS.map((c) => {
      const v = l[c.key];
      return esc(Array.isArray(v) ? v.join(' | ') : (v ?? ''));
    }).join(';'),
  );
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'; // BOM + CRLF p/ Excel BR
}

// ──────────────────────── CLI ────────────────────────

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);
  const list = (v?: string) =>
    v
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const uf = (get('--uf') ?? 'SP').toUpperCase();
  const fmt = (get('--format') ?? 'csv') as Options['format'];
  return {
    uf,
    cnaes: list(get('--cnae')),
    municipios: get('--municipios') ? list(get('--municipios')).map(normalizeMunicipio) : null,
    situacao: (get('--situacao')?.toUpperCase() as Situacao) ?? 'ATIVA',
    limit: Number(get('--limit') ?? 200),
    soWpp: has('--so-wpp'),
    format: ['csv', 'json', 'both'].includes(fmt) ? fmt : 'csv',
    out: get('--out') ?? null,
    concurrency: Number(get('--concurrency') ?? 5),
    delay: Number(get('--delay') ?? 400),
  };
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log('Casa dos Dados — scraper de CNPJ ativo com WhatsApp');
  console.log(
    `  UF=${opts.uf} situacao=${opts.situacao} cnae=[${opts.cnaes.join(',') || '—'}] limite=${opts.limit} so-wpp=${opts.soWpp}\n`,
  );

  const brutos = await coletarCnpjs(opts);
  if (brutos.length === 0) {
    console.error('Nenhum CNPJ encontrado para os filtros. Afrouxe os filtros e tente de novo.');
    process.exit(1);
  }
  const leads = await enriquecer(brutos, opts);

  const comWpp = leads.filter((l) => l.whatsapp).length;
  console.log(`\n✓ ${leads.length} leads (${comWpp} com WhatsApp, ${leads.length - comWpp} só fixo/email)`);

  const base = opts.out?.replace(/\.(csv|json)$/i, '') ?? `out/leads-${opts.uf}-${timestamp()}`;
  const writes: string[] = [];
  if (opts.format === 'csv' || opts.format === 'both') {
    const path = resolve(`${base}.csv`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, toCsv(leads), 'utf8');
    writes.push(path);
  }
  if (opts.format === 'json' || opts.format === 'both') {
    const path = resolve(`${base}.json`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(leads, null, 2), 'utf8');
    writes.push(path);
  }
  console.log('Arquivos:\n' + writes.map((w) => '  ' + w).join('\n'));
}

main().catch((err) => {
  console.error('\nErro:', err);
  process.exit(1);
});
