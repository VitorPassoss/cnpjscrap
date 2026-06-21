/**
 * Detalhe GRÁTIS de 1 CNPJ via minhareceita.org (dados abertos da Receita
 * Federal — sem chave, sem saldo, NÃO é a BrasilAPI). Traz telefone/e-mail/
 * endereço e é mapeado pro mesmo formato Lead do Casa dos Dados.
 *
 * Usado tanto pra enriquecer a busca pública (fonte grátis) quanto como fallback
 * da "URL viva".
 *
 * https://minhareceita.org/{cnpj}
 */

import { formatCnpj, formatCep, type Lead } from './casadosdados';

const MINHARECEITA = 'https://minhareceita.org';
const SITE = 'https://casadosdados.com.br';

const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/** "1123851939" → "11 2385-1939" · "11999998888" → "11 99999-8888" */
function formatFone(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length < 10) return d;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const mid = rest.length >= 9 ? 5 : 4;
  return `${ddd} ${rest.slice(0, mid)}-${rest.slice(mid)}`;
}

const isCelular = (d: string) => {
  const local = d.slice(2);
  return local.length === 9 && local.startsWith('9');
};

/** Formato "Receita" (minhareceita / dados abertos). */
interface ReceitaJson {
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  porte?: string;
  natureza_juridica?: string;
  capital_social?: number | string;
  uf?: string;
  municipio?: string;
  bairro?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  email?: string | null;
}

export function mapReceita(cnpj: string, j: ReceitaJson): Lead {
  const fonesRaw = [j.ddd_telefone_1, j.ddd_telefone_2].map(onlyDigits).filter((d) => d.length >= 10);
  const telefones = fonesRaw.map(formatFone);
  const celularesRaw = fonesRaw.filter(isCelular);
  const celulares = celularesRaw.map(formatFone);
  const wpp = celularesRaw.length ? '55' + celularesRaw[0]! : '';

  const logradouro = String(j.logradouro ?? '').trim();
  const numero = String(j.numero ?? '').trim();
  const complemento = String(j.complemento ?? '').trim();
  const endereco = [logradouro, numero, complemento].filter(Boolean).join(' ').trim();
  const email = (j.email ?? '').trim();

  return {
    cnpj,
    cnpjFormatado: formatCnpj(cnpj),
    razaoSocial: j.razao_social ?? '',
    nomeFantasia: j.nome_fantasia ?? '',
    situacao: j.descricao_situacao_cadastral ?? '',
    dataSituacao: String(j.data_situacao_cadastral ?? '').slice(0, 10),
    dataAbertura: String(j.data_inicio_atividade ?? '').slice(0, 10),
    porte: j.porte ?? '',
    naturezaJuridica: j.natureza_juridica ?? '',
    capitalSocial: Number(j.capital_social ?? 0),
    uf: j.uf ?? '',
    municipio: j.municipio ?? '',
    bairro: j.bairro ?? '',
    cep: formatCep(String(j.cep ?? '')),
    logradouro,
    numero,
    complemento,
    endereco,
    whatsapp: wpp,
    whatsappLink: wpp ? `https://api.whatsapp.com/send?phone=${wpp}` : '',
    celulares,
    telefones,
    email,
    emails: email ? [email] : [],
    fonte: `${SITE}/solucao/cnpj/x-${cnpj}`,
  };
}

/** Consulta 1 CNPJ no minhareceita.org. Devolve Lead ou null. */
export async function lookupReceita(cnpj: string, signal?: AbortSignal): Promise<Lead | null> {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return null;
  try {
    const res = await fetch(`${MINHARECEITA}/${d}`, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j = (await res.json()) as ReceitaJson;
    return mapReceita(d, j);
  } catch {
    return null;
  }
}

/**
 * Consulta vários CNPJs com concorrência limitada (a API é grátis mas convém não
 * martelar). Deduplica a entrada e ignora os que falharem.
 */
export async function lookupManyReceita(cnpjs: string[], signal?: AbortSignal): Promise<Lead[]> {
  const unicos = [...new Set(cnpjs.map(onlyDigits).filter((d) => d.length === 14))];
  const leads: Lead[] = [];
  const CONC = 6;
  let i = 0;
  async function worker() {
    while (i < unicos.length) {
      const cnpj = unicos[i++]!;
      const lead = await lookupReceita(cnpj, signal);
      if (lead) leads.push(lead);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, unicos.length) }, worker));
  return leads;
}
