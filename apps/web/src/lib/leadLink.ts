/**
 * Link público por lead — 100% sem backend.
 *
 * O link carrega os próprios dados: { v: variáveis do lead, t: template HTML }
 * vão serializados em JSON → base64url → query param `d`. A página /lead
 * decodifica, troca os {{placeholders}} pelas variáveis e renderiza o HTML
 * (com Tailwind via CDN) dentro de um iframe isolado.
 */

import type { Lead } from './casadosdados';

export interface LeadLinkPayload {
  v: Record<string, string>; // variáveis do lead
  t: string; // template HTML
}

// ───────────────────────── variáveis disponíveis ─────────────────────────

/** Catálogo de placeholders mostrado no editor. */
export const LEAD_VARS: { key: string; label: string }[] = [
  { key: 'razaoSocial', label: 'Razão social' },
  { key: 'nomeFantasia', label: 'Nome fantasia' },
  { key: 'cnpjFormatado', label: 'CNPJ (formatado)' },
  { key: 'cnpj', label: 'CNPJ (só dígitos)' },
  { key: 'situacao', label: 'Situação cadastral' },
  { key: 'dataAbertura', label: 'Data de abertura' },
  { key: 'porte', label: 'Porte' },
  { key: 'naturezaJuridica', label: 'Natureza jurídica' },
  { key: 'capitalSocial', label: 'Capital social (R$)' },
  { key: 'local', label: 'Cidade/UF' },
  { key: 'cidade', label: 'Cidade (município)' },
  { key: 'estado', label: 'Estado (por extenso)' },
  { key: 'uf', label: 'UF (sigla)' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cep', label: 'CEP' },
  { key: 'logradouro', label: 'Logradouro (rua/av)' },
  { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'endereco', label: 'Endereço (linha)' },
  { key: 'enderecoCompleto', label: 'Endereço completo' },
  { key: 'whatsapp', label: 'WhatsApp (número)' },
  { key: 'whatsappLink', label: 'WhatsApp (link wa.me)' },
  { key: 'telefone', label: 'Telefone principal' },
  { key: 'telefones', label: 'Todos os telefones' },
  { key: 'celular', label: 'Celular principal' },
  { key: 'email', label: 'E-mail principal' },
  { key: 'emails', label: 'Todos os e-mails' },
  { key: 'fonte', label: 'Link da fonte (Casa dos Dados)' },
];

const brl = (n: number) =>
  n ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';

const ESTADOS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

/** Extrai do Lead o mapa plano de variáveis (tudo string) usado no template. */
export function leadVars(l: Lead): Record<string, string> {
  const enderecoCompleto = [
    l.endereco,
    l.bairro,
    l.municipio ? `${l.municipio}/${l.uf}` : l.uf,
    l.cep,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    cnpj: l.cnpj,
    cnpjFormatado: l.cnpjFormatado,
    razaoSocial: l.razaoSocial,
    nomeFantasia: l.nomeFantasia || l.razaoSocial,
    situacao: l.situacao,
    dataSituacao: l.dataSituacao,
    dataAbertura: l.dataAbertura,
    porte: l.porte,
    naturezaJuridica: l.naturezaJuridica,
    capitalSocial: brl(l.capitalSocial),
    uf: l.uf,
    estado: ESTADOS[l.uf?.toUpperCase()] ?? l.uf,
    municipio: l.municipio,
    cidade: l.municipio,
    bairro: l.bairro,
    cep: l.cep,
    logradouro: l.logradouro,
    numero: l.numero,
    complemento: l.complemento,
    endereco: l.endereco,
    enderecoCompleto,
    local: l.municipio ? `${l.municipio}/${l.uf}` : l.uf,
    whatsapp: l.whatsapp,
    whatsappLink: l.whatsappLink,
    telefone: l.telefones[0] ?? '',
    telefones: l.telefones.join(', '),
    celular: l.celulares[0] ?? '',
    celulares: l.celulares.join(', '),
    email: l.email,
    emails: l.emails.join(', '),
    fonte: l.fonte,
  };
}

/** Lead fictício para o preview do editor quando ainda não há busca. */
export const DEMO_VARS: Record<string, string> = {
  cnpj: '12345678000190',
  cnpjFormatado: '12.345.678/0001-90',
  razaoSocial: 'Padaria Pão Quente LTDA',
  nomeFantasia: 'Pão Quente',
  situacao: 'ATIVA',
  dataAbertura: '2015-03-21',
  porte: 'Microempresa',
  naturezaJuridica: 'Sociedade Empresária Limitada',
  capitalSocial: 'R$ 50.000,00',
  uf: 'SP',
  estado: 'São Paulo',
  municipio: 'São Paulo',
  cidade: 'São Paulo',
  bairro: 'Pinheiros',
  cep: '05422-030',
  logradouro: 'Rua das Flores',
  numero: '123',
  complemento: 'Sala 4',
  endereco: 'Rua das Flores 123 Sala 4',
  enderecoCompleto: 'Rua das Flores 123 Sala 4, Pinheiros, São Paulo/SP, 05422-030',
  local: 'São Paulo/SP',
  whatsapp: '5511999998888',
  whatsappLink: 'https://api.whatsapp.com/send?phone=5511999998888',
  telefone: '11 99999-8888',
  telefones: '11 99999-8888, 11 3333-2222',
  celular: '11 99999-8888',
  email: 'contato@paoquente.com.br',
  emails: 'contato@paoquente.com.br',
  fonte: 'https://casadosdados.com.br/solucao/cnpj/x-12345678000190',
};

// ───────────────────────── template → HTML ─────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Substitui {{variavel}} pelos valores (escapando o conteúdo). */
export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, k: string) =>
    k in vars ? escapeHtml(vars[k] ?? '') : '',
  );
}

/** Embrulha o HTML do usuário num documento completo com Tailwind via CDN. */
export function buildDoc(bodyHtml: string): string {
  return (
    '<!doctype html><html lang="pt-BR"><head>' +
    '<meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    '<script src="https://cdn.tailwindcss.com"></script>' +
    `</head><body>${bodyHtml}</body></html>`
  );
}

/** Atalho: aplica as variáveis e devolve o documento pronto pro iframe srcDoc. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return buildDoc(applyTemplate(template, vars));
}

// ───────────────────────── encode / decode da URL ─────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeLeadLink(vars: Record<string, string>, template: string): string {
  const json = JSON.stringify({ v: vars, t: template } satisfies LeadLinkPayload);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeLeadLink(d: string): LeadLinkPayload | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(d));
    const obj = JSON.parse(json) as LeadLinkPayload;
    if (!obj || typeof obj.t !== 'string' || typeof obj.v !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

/** Monta a URL pública completa para um lead. */
export function leadLinkUrl(origin: string, vars: Record<string, string>, template: string): string {
  return `${origin}/lead?d=${encodeLeadLink(vars, template)}`;
}

// ───────────────────────── template padrão ─────────────────────────

export const DEFAULT_TEMPLATE = `<div class="min-h-screen bg-zinc-100 flex items-center justify-center p-6">
  <div class="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
    <div class="bg-emerald-600 px-6 py-5 text-white">
      <p class="text-xs uppercase tracking-wide text-emerald-100">{{situacao}} · {{porte}}</p>
      <h1 class="mt-1 text-xl font-bold leading-tight">{{nomeFantasia}}</h1>
      <p class="text-sm text-emerald-100">{{razaoSocial}}</p>
    </div>
    <div class="px-6 py-5 space-y-3 text-sm text-zinc-700">
      <div class="flex justify-between gap-4"><span class="text-zinc-400">CNPJ</span><span class="font-mono">{{cnpjFormatado}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Cidade/Estado</span><span class="text-right">{{cidade}} — {{estado}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Endereço</span><span class="text-right">{{enderecoCompleto}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Aberta em</span><span>{{dataAbertura}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">Capital</span><span>{{capitalSocial}}</span></div>
      <div class="flex justify-between gap-4"><span class="text-zinc-400">E-mail</span><span>{{email}}</span></div>
    </div>
    <div class="px-6 pb-6">
      <a href="{{whatsappLink}}" target="_blank"
         class="block rounded-xl bg-emerald-600 py-3 text-center font-semibold text-white hover:bg-emerald-700">
        Chamar no WhatsApp · {{whatsapp}}
      </a>
    </div>
  </div>
</div>`;
