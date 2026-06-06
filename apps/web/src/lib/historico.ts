'use client';

/**
 * Histórico de buscas + memória de CNPJs já trazidos — tudo em localStorage,
 * sem backend. Serve pra (1) reabrir os filtros de uma busca anterior e
 * (2) marcar/ocultar leads que já apareceram antes, evitando disparar 2x pro
 * mesmo CNPJ.
 */

const VISTOS_KEY = 'cnpjscrap.vistos';
const HIST_KEY = 'cnpjscrap.historico';
const MAX_VISTOS = 20000; // teto pra não estourar o localStorage
const MAX_HIST = 12;

export interface BuscaHist {
  id: string;
  ts: number;
  resumo: string;
  filtros: unknown; // o objeto Filtros, pra reabrir a busca
  total: number | null;
  retornados: number;
  novos: number; // quantos não estavam em buscas anteriores
}

function ler<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function gravar(key: string, val: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // localStorage cheio/indisponível — ignora
  }
}

// ───────────────────────── CNPJs já vistos ─────────────────────────

export function carregarVistos(): Set<string> {
  return new Set(ler<string[]>(VISTOS_KEY, []));
}

export function addVistos(cnpjs: string[]): void {
  const set = carregarVistos();
  for (const c of cnpjs) if (c) set.add(c);
  let arr = [...set];
  if (arr.length > MAX_VISTOS) arr = arr.slice(arr.length - MAX_VISTOS);
  gravar(VISTOS_KEY, arr);
}

export function limparVistos(): void {
  gravar(VISTOS_KEY, []);
}

// ───────────────────────── histórico de buscas ─────────────────────────

export function carregarHistorico(): BuscaHist[] {
  return ler<BuscaHist[]>(HIST_KEY, []);
}

export function registrarBusca(e: Omit<BuscaHist, 'id' | 'ts'>): BuscaHist[] {
  const entrada: BuscaHist = {
    ...e,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
  };
  const arr = [entrada, ...carregarHistorico()].slice(0, MAX_HIST);
  gravar(HIST_KEY, arr);
  return arr;
}

export function limparHistorico(): void {
  gravar(HIST_KEY, []);
}
