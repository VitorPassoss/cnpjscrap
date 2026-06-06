/**
 * Cliente da API OFICIAL do Casa dos Dados (autenticada por api-key).
 * Host: https://api.casadosdados.com.br  •  Auth: header `api-key`.
 *
 * Endpoints usados:
 *  - GET  /v5/saldo                                   → saldo da conta
 *  - POST /v5/cnpj/pesquisa?tipo_resultado=completo   → busca avançada (até 1000/página)
 *
 * "completo" devolve todos os campos disponíveis (endereço, telefones, email…).
 * O mapeamento de telefone/email é defensivo: varre formatos comuns.
 */

const API = 'https://api.casadosdados.com.br';
const SITE = 'https://casadosdados.com.br';

export type Situacao = 'ATIVA' | 'BAIXADA' | 'INAPTA' | 'SUSPENSA' | 'NULA';

export interface Saldo {
  saldo_total: number;
  saldos: Record<string, { valor: number; criado_em: string; expira_em: string }>;
}

export interface SearchFilters {
  // texto livre (razão social / nome fantasia / sócio)
  termo?: string;
  termoTipo?: 'exata' | 'radical';
  buscaRazao?: boolean;
  buscaFantasia?: boolean;
  buscaSocio?: boolean;
  // localização
  uf?: string[];
  municipios?: string[];
  bairros?: string[];
  ddd?: string[];
  // atividade
  cnaes?: string[];
  naturezas?: string[];
  // empresa
  situacao?: Situacao[];
  porte?: string[]; // '01' Micro | '03' Pequeno | '05' Demais
  somenteMatriz?: boolean;
  somenteFilial?: boolean;
  capitalMin?: number;
  capitalMax?: number;
  meiOptante?: boolean;
  excluirMei?: boolean;
  simplesOptante?: boolean;
  excluirSimples?: boolean;
  // abertura
  ultimosDias?: number;
  aberturaInicio?: string; // yyyy-mm-dd
  aberturaFim?: string;
  // contato / qualidade
  comTelefone?: boolean;
  somenteCelular?: boolean;
  somenteFixo?: boolean;
  comEmail?: boolean;
  excluirEmailContab?: boolean;
  excluirVisualizadas?: boolean;
  // paginação
  limite?: number; // 1..1000
  pagina?: number;
}

export interface Lead {
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  dataSituacao: string;
  dataAbertura: string;
  porte: string;
  naturezaJuridica: string;
  capitalSocial: number;
  uf: string;
  municipio: string;
  bairro: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  endereco: string;
  whatsapp: string;
  whatsappLink: string;
  celulares: string[];
  telefones: string[];
  email: string;
  emails: string[];
  fonte: string;
}

const onlyDigits = (s: string) => String(s ?? '').replace(/\D/g, '');

export function formatCnpj(cnpj: string): string {
  const d = onlyDigits(cnpj).padStart(14, '0');
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function formatCep(cep: string): string {
  const d = onlyDigits(cep);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : d;
}

export class CasaDosDadosError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(apiKey: string) {
  return { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };
}

async function handle(res: Response): Promise<unknown> {
  if (res.status === 401) throw new CasaDosDadosError(401, 'Chave de API inválida ou ausente.');
  if (res.status === 403) throw new CasaDosDadosError(403, 'Sem saldo para a operação.');
  if (!res.ok) throw new CasaDosDadosError(res.status, `Erro ${res.status} na API do Casa dos Dados.`);
  return res.json();
}

/** GET /v5/saldo */
export async function getSaldo(apiKey: string, signal?: AbortSignal): Promise<Saldo> {
  const res = await fetch(`${API}/v5/saldo`, { headers: authHeaders(apiKey), signal });
  const data = (await handle(res)) as Saldo;
  return { saldo_total: data.saldo_total ?? 0, saldos: data.saldos ?? {} };
}

function buildBody(f: SearchFilters) {
  const body: Record<string, unknown> = {
    situacao_cadastral: f.situacao?.length ? f.situacao : ['ATIVA'],
    uf: (f.uf ?? []).map((u) => u.toUpperCase()),
    municipio: f.municipios ?? [],
    bairro: f.bairros ?? [],
    ddd: f.ddd ?? [],
    codigo_atividade_principal: f.cnaes ?? [],
    codigo_natureza_juridica: f.naturezas ?? [],
    mais_filtros: {
      somente_matriz: f.somenteMatriz ?? false,
      somente_filial: f.somenteFilial ?? false,
      com_telefone: f.comTelefone ?? false,
      somente_celular: f.somenteCelular ?? false,
      somente_fixo: f.somenteFixo ?? false,
      com_email: f.comEmail ?? false,
      excluir_email_contab: f.excluirEmailContab ?? false,
      excluir_empresas_visualizadas: f.excluirVisualizadas ?? false,
    },
    limite: Math.max(1, Math.min(f.limite ?? 50, 1000)),
    pagina: Math.max(1, f.pagina ?? 1),
  };

  if (f.termo?.trim()) {
    body.busca_textual = [
      {
        texto: [f.termo.trim()],
        tipo_busca: f.termoTipo ?? 'radical',
        razao_social: f.buscaRazao ?? true,
        nome_fantasia: f.buscaFantasia ?? true,
        nome_socio: f.buscaSocio ?? false,
      },
    ];
  }

  if (f.porte?.length) body.porte_empresa = { codigos: f.porte };

  if (f.capitalMin || f.capitalMax) {
    body.capital_social = { minimo: f.capitalMin ?? 0, maximo: f.capitalMax ?? 0 };
  }

  const dataAbertura: Record<string, unknown> = {};
  if (f.ultimosDias && f.ultimosDias > 0) dataAbertura.ultimos_dias = f.ultimosDias;
  if (f.aberturaInicio) dataAbertura.inicio = f.aberturaInicio;
  if (f.aberturaFim) dataAbertura.fim = f.aberturaFim;
  if (Object.keys(dataAbertura).length) body.data_abertura = dataAbertura;

  if (f.meiOptante || f.excluirMei) {
    body.mei = { optante: f.meiOptante ?? false, excluir_optante: f.excluirMei ?? false };
  }
  if (f.simplesOptante || f.excluirSimples) {
    body.simples = { optante: f.simplesOptante ?? false, excluir_optante: f.excluirSimples ?? false };
  }

  return body;
}

// ─────────── extração defensiva de telefone/email do "completo" ───────────

type FoneObj = { ddd?: string; numero?: string; tipo?: string; completo?: string };

function coletarTelefones(raw: Record<string, unknown>): FoneObj[] {
  const cand =
    (raw.telefones as unknown) ??
    (raw.telefone as unknown) ??
    (raw.contatos as unknown) ??
    ((raw.contato as Record<string, unknown> | undefined)?.telefones as unknown) ??
    [];
  if (!Array.isArray(cand)) return [];
  return cand
    .map((t): FoneObj => {
      if (typeof t === 'string') return { completo: t };
      const o = t as Record<string, unknown>;
      return {
        ddd: o.ddd ? String(o.ddd) : undefined,
        numero: o.numero ? String(o.numero) : undefined,
        tipo: o.tipo ? String(o.tipo).toLowerCase() : undefined,
        completo: o.completo ? String(o.completo) : undefined,
      };
    })
    .filter((t) => t.completo || t.numero);
}

function coletarEmails(raw: Record<string, unknown>): string[] {
  const cand =
    (raw.emails as unknown) ??
    (raw.email as unknown) ??
    ((raw.contato as Record<string, unknown> | undefined)?.emails as unknown) ??
    [];
  const arr = Array.isArray(cand) ? cand : cand ? [cand] : [];
  return arr
    .map((e) => (typeof e === 'string' ? e : ((e as Record<string, unknown>)?.email as string) ?? ((e as Record<string, unknown>)?.endereco as string) ?? ''))
    .filter(Boolean)
    .map(String);
}

function foneStr(t: FoneObj): string {
  if (t.completo) return t.completo;
  return [t.ddd, t.numero].filter(Boolean).join(' ');
}

function isCelular(t: FoneObj): boolean {
  if (t.tipo) return t.tipo.includes('cel');
  const local = onlyDigits(t.numero ?? t.completo ?? '').slice(-9);
  return local.length === 9 && local.startsWith('9');
}

function whatsappDigits(t: FoneObj): string {
  const ddd = t.ddd ? onlyDigits(t.ddd) : onlyDigits(t.completo ?? '').slice(0, 2);
  const num = t.numero ? onlyDigits(t.numero) : onlyDigits(t.completo ?? '').slice(2);
  const full = onlyDigits(ddd + num);
  return full ? '55' + full : '';
}

function mapLead(raw: Record<string, unknown>): Lead {
  const cnpj = onlyDigits((raw.cnpj as string) ?? '');
  const sit = raw.situacao_cadastral as Record<string, unknown> | undefined;
  const end = raw.endereco as Record<string, unknown> | undefined;
  const porte = raw.porte_empresa as Record<string, unknown> | undefined;

  const fones = coletarTelefones(raw);
  const cels = fones.filter(isCelular);
  const emails = coletarEmails(raw);
  const wpp = cels.length ? whatsappDigits(cels[0]!) : '';

  const logradouro = [end?.tipo_logradouro, end?.logradouro].filter(Boolean).join(' ').trim();
  const numero = String(end?.numero ?? '').trim();
  const complemento = String(end?.complemento ?? '').trim();
  const enderecoLinha = [logradouro, numero, complemento].filter(Boolean).join(' ').trim();

  return {
    cnpj,
    cnpjFormatado: formatCnpj(cnpj),
    razaoSocial: (raw.razao_social as string) ?? '',
    nomeFantasia: (raw.nome_fantasia as string) ?? '',
    situacao: (sit?.situacao_cadastral as string) ?? (sit?.situacao_atual as string) ?? '',
    dataSituacao: String(sit?.data ?? '').slice(0, 10),
    dataAbertura: String(raw.data_abertura ?? '').slice(0, 10),
    porte: (porte?.descricao as string) ?? '',
    naturezaJuridica: (raw.descricao_natureza_juridica as string) ?? '',
    capitalSocial: Number(raw.capital_social ?? 0),
    uf: (end?.uf as string) ?? '',
    municipio: (end?.municipio as string) ?? '',
    bairro: (end?.bairro as string) ?? '',
    cep: formatCep(String(end?.cep ?? '')),
    logradouro,
    numero,
    complemento,
    endereco: enderecoLinha,
    whatsapp: wpp,
    whatsappLink: wpp ? `https://api.whatsapp.com/send?phone=${wpp}` : '',
    celulares: cels.map(foneStr),
    telefones: fones.map(foneStr),
    email: emails[0] ?? '',
    emails,
    fonte: `${SITE}/solucao/cnpj/x-${cnpj}`,
  };
}

/** POST /v5/cnpj/pesquisa?tipo_resultado=completo */
export async function searchOficial(
  apiKey: string,
  filters: SearchFilters,
  signal?: AbortSignal,
): Promise<{ total: number; leads: Lead[] }> {
  const res = await fetch(`${API}/v5/cnpj/pesquisa?tipo_resultado=completo`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(buildBody(filters)),
    signal,
  });
  const data = (await handle(res)) as { total: number; cnpjs: Record<string, unknown>[] };
  const leads = (data.cnpjs ?? []).map(mapLead);
  return { total: data.total ?? leads.length, leads };
}

// ───────────────────── saída CSV (pt-BR / Excel) ─────────────────────

export const CSV_COLS: { key: keyof Lead; label: string }[] = [
  { key: 'cnpjFormatado', label: 'cnpj' },
  { key: 'razaoSocial', label: 'razao_social' },
  { key: 'nomeFantasia', label: 'nome_fantasia' },
  { key: 'situacao', label: 'situacao' },
  { key: 'dataAbertura', label: 'data_abertura' },
  { key: 'porte', label: 'porte' },
  { key: 'uf', label: 'uf' },
  { key: 'municipio', label: 'municipio' },
  { key: 'bairro', label: 'bairro' },
  { key: 'whatsapp', label: 'whatsapp' },
  { key: 'whatsappLink', label: 'whatsapp_link' },
  { key: 'telefones', label: 'telefones' },
  { key: 'email', label: 'email' },
  { key: 'fonte', label: 'fonte' },
];

export function leadsToCsv(leads: Lead[], links?: Record<string, string>): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const comLink = !!links;
  const headCols = comLink ? [...CSV_COLS.map((c) => c.label), 'pagina_link'] : CSV_COLS.map((c) => c.label);
  const head = headCols.map(esc).join(';');
  const rows = leads.map((l) => {
    const cols = CSV_COLS.map((c) => {
      const v = l[c.key];
      return esc(Array.isArray(v) ? v.join(' | ') : v);
    });
    if (comLink) cols.push(esc(links[l.cnpj] ?? ''));
    return cols.join(';');
  });
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n';
}
