export type LeadStatus = 'novo' | 'em_contato' | 'sem_resposta' | 'fechado' | 'descartado';

export type SearchFilters = {
  cnaes?: string[];
  ufs?: string[];
  municipios?: string[];
  portes?: string[];
  abertoHaMeses: number;
  comEmail?: boolean;
  comTelefone?: boolean;
};

export const MAX_ABERTO_HA_MESES = 6 as const;
export const LEAD_STATUSES: readonly LeadStatus[] = [
  'novo',
  'em_contato',
  'sem_resposta',
  'fechado',
  'descartado',
] as const;
