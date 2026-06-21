/**
 * Consulta de 1 CNPJ pra "URL viva": tenta o Casa dos Dados primeiro (mais
 * completo — telefone/WhatsApp/e-mail) e, se falhar (sem saldo, sem chave, erro
 * ou não encontrado), cai pra fonte pública grátis (minhareceita.org). Devolve o
 * Lead ou null se nenhuma fonte achar.
 */

import { lookupOficial, type Lead } from './casadosdados';
import { lookupReceita } from './receita';

export async function lookupLead(
  apiKey: string,
  cnpj: string,
  signal?: AbortSignal,
): Promise<Lead | null> {
  if (apiKey) {
    try {
      const lead = await lookupOficial(apiKey, cnpj, signal);
      if (lead) return lead;
    } catch {
      // sem saldo / erro na API → tenta a fonte pública grátis abaixo
    }
  }
  return lookupReceita(cnpj, signal);
}
