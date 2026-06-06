'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { leadsToCsv, type Lead, type Saldo, type SearchFilters, type Situacao } from '@/lib/casadosdados';
import {
  applyText,
  DEFAULT_DISPARO_MSG,
  DEFAULT_TEMPLATE,
  disparoCsv,
  leadLinkUrl,
  leadVars,
} from '@/lib/leadLink';
import TemplateEditor from './_components/TemplateEditor';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const PRESETS = [100, 500, 1000, 3000, 6000];

interface Filtros {
  termo: string;
  uf: string;
  municipios: string;
  bairros: string;
  ddd: string;
  cnae: string;
  naturezas: string;
  situacao: string;
  porte: string[];
  matriz: '' | 'matriz' | 'filial';
  capitalMin: string;
  capitalMax: string;
  mei: '' | 'so' | 'excluir';
  simples: '' | 'optante' | 'excluir';
  ultimosDias: string;
  aberturaInicio: string;
  aberturaFim: string;
  comTelefone: boolean;
  somenteCelular: boolean;
  comEmail: boolean;
  excluirEmailContab: boolean;
  excluirVisualizadas: boolean;
  limite: number;
}

const INICIAL: Filtros = {
  termo: '',
  uf: 'SP',
  municipios: '',
  bairros: '',
  ddd: '',
  cnae: '',
  naturezas: '',
  situacao: 'ATIVA',
  porte: [],
  matriz: '',
  capitalMin: '',
  capitalMax: '',
  mei: '',
  simples: '',
  ultimosDias: '',
  aberturaInicio: '',
  aberturaFim: '',
  comTelefone: true,
  somenteCelular: true,
  comEmail: true,
  excluirEmailContab: true,
  excluirVisualizadas: false,
  limite: 100,
};

const lista = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function baixarArquivo(conteudo: string, nome: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Painel() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [keyLast4, setKeyLast4] = useState('');
  const [editandoKey, setEditandoKey] = useState(true);
  const [salvandoKey, setSalvandoKey] = useState(false);
  const [dbReady, setDbReady] = useState(true);

  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [saldoLoading, setSaldoLoading] = useState(false);

  const [f, setF] = useState<Filtros>(INICIAL);
  const [avancado, setAvancado] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [tplStatus, setTplStatus] = useState<'' | 'salvando' | 'salvo' | 'erro'>('');
  const [copiado, setCopiado] = useState('');
  const [gerando, setGerando] = useState('');

  const [links, setLinks] = useState<Record<string, string>>({}); // cnpj → url curta gerada
  const [disparoMsg, setDisparoMsg] = useState(DEFAULT_DISPARO_MSG);
  const [gerandoTodos, setGerandoTodos] = useState(false);

  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setF((p) => ({ ...p, [k]: v }));

  const carregarSaldo = useCallback(async () => {
    setSaldoLoading(true);
    try {
      const res = await fetch('/api/saldo');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao consultar saldo');
      setSaldo(data);
    } catch (e) {
      setSaldo(null);
      setErro((e as Error).message);
    } finally {
      setSaldoLoading(false);
    }
  }, []);

  // Carrega configuração (chave + template) do banco ao abrir.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (!res.ok) return;
        setHasKey(!!data.hasKey);
        setKeyLast4(data.keyLast4 || '');
        setDbReady(data.dbReady !== false);
        if (typeof data.template === 'string' && data.template) setTemplate(data.template);
        if (typeof data.disparoMsg === 'string' && data.disparoMsg) setDisparoMsg(data.disparoMsg);
        if (data.hasKey) {
          setEditandoKey(false);
          carregarSaldo();
        }
      } catch {
        // offline / sem servidor — segue com defaults
      }
    })();
  }, [carregarSaldo]);

  // Salva o template no banco com debounce (700ms) e mostra o status.
  const tplTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvarTemplate = useCallback((t: string) => {
    setTemplate(t);
    setTplStatus('salvando');
    if (tplTimer.current) clearTimeout(tplTimer.current);
    tplTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template: t }),
        });
        if (!res.ok) throw new Error();
        setTplStatus('salvo');
      } catch {
        setTplStatus('erro');
      }
    }, 700);
  }, []);

  // Salva a mensagem de disparo no banco (debounce 700ms).
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvarDisparoMsg = useCallback((m: string) => {
    setDisparoMsg(m);
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disparoMsg: m }),
      }).catch(() => {});
    }, 700);
  }, []);

  // Gera o link curto (/l/<code>) via banco; usa cache e cai no link longo se falhar.
  const gerarLinkCurto = useCallback(
    async (l: Lead): Promise<string> => {
      const cached = links[l.cnpj];
      if (cached) return cached;
      try {
        const res = await fetch('/api/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vars: leadVars(l), template }),
        });
        const data = await res.json();
        if (res.ok && data.code) {
          const url = `${window.location.origin}/l/${data.code}`;
          setLinks((m) => ({ ...m, [l.cnpj]: url }));
          return url;
        }
      } catch {
        // sem banco → link longo autossuficiente
      }
      return leadLinkUrl(window.location.origin, leadVars(l), template);
    },
    [template, links],
  );

  // Gera (em lote) o link curto de TODOS os leads e devolve o mapa cnpj → url.
  const gerarLinksLote = useCallback(async (): Promise<Record<string, string>> => {
    const origin = window.location.origin;
    let codes: Record<string, string> = {};
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: leads.map((l) => ({ cnpj: l.cnpj, vars: leadVars(l) })), template }),
      });
      const data = await res.json();
      if (res.ok && data.links) codes = data.links;
    } catch {
      // sem banco → links longos abaixo
    }
    const novos: Record<string, string> = {};
    for (const l of leads) {
      const code = codes[l.cnpj];
      novos[l.cnpj] = code ? `${origin}/l/${code}` : leadLinkUrl(origin, leadVars(l), template);
    }
    setLinks((m) => ({ ...m, ...novos }));
    return novos;
  }, [leads, template]);

  // Gera os links e baixa o CSV de disparo (contato + link + mensagem montada).
  const gerarDisparo = useCallback(async () => {
    if (!leads.length) return;
    setGerandoTodos(true);
    setErro('');
    try {
      const urls = await gerarLinksLote();
      const items = leads.map((l) => {
        const link = urls[l.cnpj] ?? '';
        return { lead: l, link, mensagem: applyText(disparoMsg, { ...leadVars(l), link }) };
      });
      baixarArquivo(disparoCsv(items), `disparo-${f.uf || 'BR'}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerandoTodos(false);
    }
  }, [leads, disparoMsg, f.uf, gerarLinksLote]);

  const copiarLink = useCallback(
    async (l: Lead) => {
      setGerando(l.cnpj);
      const url = await gerarLinkCurto(l);
      setGerando((g) => (g === l.cnpj ? '' : g));
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt('Copie o link do lead:', url);
      }
      setCopiado(l.cnpj);
      setTimeout(() => setCopiado((c) => (c === l.cnpj ? '' : c)), 1500);
    },
    [gerarLinkCurto],
  );

  const abrirLink = useCallback(
    (l: Lead) => {
      const w = window.open('about:blank', '_blank'); // abre já pra não cair em bloqueio de popup
      setGerando(l.cnpj);
      gerarLinkCurto(l).then((url) => {
        setGerando((g) => (g === l.cnpj ? '' : g));
        if (w) w.location.href = url;
        else window.open(url, '_blank', 'noopener');
      });
    },
    [gerarLinkCurto],
  );

  const salvarKey = async () => {
    const k = apiKeyInput.trim();
    if (!k) return;
    setSalvandoKey(true);
    setErro('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: k }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar a chave');
      setHasKey(!!data.hasKey);
      setKeyLast4(data.keyLast4 || '');
      setApiKeyInput('');
      setEditandoKey(false);
      carregarSaldo();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvandoKey(false);
    }
  };

  const buscar = async () => {
    setLoading(true);
    setErro('');
    setLeads([]);
    setTotal(null);
    setLinks({});
    try {
      const body: SearchFilters = {
        termo: f.termo || undefined,
        uf: f.uf ? [f.uf] : [],
        municipios: lista(f.municipios),
        bairros: lista(f.bairros),
        ddd: lista(f.ddd),
        cnaes: lista(f.cnae).map((c) => c.replace(/\D/g, '')).filter(Boolean),
        naturezas: lista(f.naturezas),
        situacao: f.situacao ? [f.situacao as Situacao] : ['ATIVA'],
        porte: f.porte,
        somenteMatriz: f.matriz === 'matriz',
        somenteFilial: f.matriz === 'filial',
        capitalMin: f.capitalMin ? Number(f.capitalMin) : undefined,
        capitalMax: f.capitalMax ? Number(f.capitalMax) : undefined,
        meiOptante: f.mei === 'so',
        excluirMei: f.mei === 'excluir',
        simplesOptante: f.simples === 'optante',
        excluirSimples: f.simples === 'excluir',
        ultimosDias: f.ultimosDias ? Number(f.ultimosDias) : undefined,
        aberturaInicio: f.aberturaInicio || undefined,
        aberturaFim: f.aberturaFim || undefined,
        comTelefone: f.comTelefone || f.somenteCelular,
        somenteCelular: f.somenteCelular,
        comEmail: f.comEmail,
        excluirEmailContab: f.excluirEmailContab,
        excluirVisualizadas: f.excluirVisualizadas,
        limite: f.limite,
        pagina: 1,
      };
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na busca');
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
      carregarSaldo();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const baixarCsv = async () => {
    setGerandoTodos(true);
    try {
      const urls = await gerarLinksLote(); // CSV já sai com a coluna pagina_link
      baixarArquivo(leadsToCsv(leads, urls), `leads-${f.uf || 'BR'}-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setGerandoTodos(false);
    }
  };

  const saldoTotal = saldo?.saldo_total ?? 0;
  const semSaldo = hasKey && saldo !== null && saldoTotal <= 0;
  const podeBuscar = hasKey && !loading && !semSaldo;
  const comWpp = useMemo(() => leads.filter((l) => l.whatsapp).length, [leads]);
  const comEmail = useMemo(() => leads.filter((l) => l.email).length, [leads]);

  const togglePorte = (code: string) =>
    set('porte', f.porte.includes(code) ? f.porte.filter((c) => c !== code) : [...f.porte, code]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">CD</span>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-zinc-900">CNPJ Scraper</h1>
              <p className="text-xs leading-tight text-zinc-500">Casa dos Dados · leads com telefone e e-mail</p>
            </div>
          </div>
          <SaldoBadge saldo={saldo} loading={saldoLoading} visivel={hasKey} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-6 py-6">
        {/* Chave */}
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          {editandoKey ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Chave da API (Casa dos Dados)</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="cole sua api-key aqui"
                  onKeyDown={(e) => e.key === 'Enter' && salvarKey()}
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
                <button onClick={salvarKey} disabled={!apiKeyInput.trim() || salvandoKey}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
                  {salvandoKey ? 'Salvando…' : 'Salvar e validar'}
                </button>
                {hasKey && (
                  <button onClick={() => { setEditandoKey(false); setApiKeyInput(''); }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
                    cancelar
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                {dbReady
                  ? 'Fica salva no banco (servidor) — não trafega de volta pro navegador.'
                  : 'Banco não configurado: defina DATABASE_URL pra salvar a chave de forma persistente.'}
                {' '}Pegue em{' '}
                <a className="text-emerald-700 underline" href="https://portal.casadosdados.com.br/plataforma/api/chave" target="_blank" rel="noreferrer">portal.casadosdados.com.br</a>.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-zinc-700">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Chave salva no banco <span className="font-mono text-zinc-400">••••{keyLast4}</span>
              </div>
              <button onClick={() => setEditandoKey(true)} className="text-sm text-zinc-500 underline hover:text-zinc-700">trocar</button>
            </div>
          )}
        </section>

        {/* Filtros */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Filtros</h2>

          {/* texto + localização + atividade */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Campo label="Buscar texto (razão / fantasia)" span2>
              <input value={f.termo} onChange={(e) => set('termo', e.target.value)} placeholder="ex: restaurante, clínica…" className={inp} />
            </Campo>
            <Campo label="UF">
              <select value={f.uf} onChange={(e) => set('uf', e.target.value)} className={inp}>
                <option value="">Brasil (todas)</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Campo>
            <Campo label="Situação">
              <select value={f.situacao} onChange={(e) => set('situacao', e.target.value)} className={inp}>
                {['ATIVA','BAIXADA','INAPTA','SUSPENSA','NULA'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Campo>
            <Campo label="Município(s)">
              <input value={f.municipios} onChange={(e) => set('municipios', e.target.value)} placeholder="ex: SAO PAULO, CAMPINAS" className={inp} />
            </Campo>
            <Campo label="CNAE(s)">
              <input value={f.cnae} onChange={(e) => set('cnae', e.target.value)} placeholder="ex: 5611201, 4712100" className={inp} />
            </Campo>
            <Campo label="DDD(s)">
              <input value={f.ddd} onChange={(e) => set('ddd', e.target.value)} placeholder="ex: 11, 19" className={inp} />
            </Campo>
            <Campo label="Abertas nos últimos (dias)">
              <input type="number" min={0} value={f.ultimosDias} onChange={(e) => set('ultimosDias', e.target.value)} placeholder="todas" className={inp} />
            </Campo>
          </div>

          {/* contato / qualidade */}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-zinc-50 p-3">
            <Toggle checked={f.somenteCelular} onChange={(v) => set('somenteCelular', v)} label="Só com WhatsApp (celular)" />
            <Toggle checked={f.comTelefone} onChange={(v) => set('comTelefone', v)} label="Com telefone" />
            <Toggle checked={f.comEmail} onChange={(v) => set('comEmail', v)} label="Com e-mail" />
            <Toggle checked={f.excluirEmailContab} onChange={(v) => set('excluirEmailContab', v)} label="Excluir e-mail de contabilidade" />
            <Toggle checked={f.excluirVisualizadas} onChange={(v) => set('excluirVisualizadas', v)} label="Excluir já vistos" />
          </div>

          {/* avançado */}
          <button onClick={() => setAvancado((v) => !v)} className="mt-4 text-xs font-medium text-emerald-700 hover:underline">
            {avancado ? '− ocultar filtros avançados' : '+ mais filtros avançados'}
          </button>
          {avancado && (
            <div className="mt-3 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-3 lg:grid-cols-4">
              <Campo label="Bairro(s)">
                <input value={f.bairros} onChange={(e) => set('bairros', e.target.value)} placeholder="ex: CENTRO" className={inp} />
              </Campo>
              <Campo label="Natureza jurídica (códigos)">
                <input value={f.naturezas} onChange={(e) => set('naturezas', e.target.value)} placeholder="ex: 2062" className={inp} />
              </Campo>
              <Campo label="Matriz / Filial">
                <select value={f.matriz} onChange={(e) => set('matriz', e.target.value as Filtros['matriz'])} className={inp}>
                  <option value="">Indiferente</option>
                  <option value="matriz">Só matriz</option>
                  <option value="filial">Só filial</option>
                </select>
              </Campo>
              <Campo label="MEI">
                <select value={f.mei} onChange={(e) => set('mei', e.target.value as Filtros['mei'])} className={inp}>
                  <option value="">Indiferente</option>
                  <option value="so">Só MEI</option>
                  <option value="excluir">Excluir MEI</option>
                </select>
              </Campo>
              <Campo label="Simples Nacional">
                <select value={f.simples} onChange={(e) => set('simples', e.target.value as Filtros['simples'])} className={inp}>
                  <option value="">Indiferente</option>
                  <option value="optante">Optante</option>
                  <option value="excluir">Excluir optante</option>
                </select>
              </Campo>
              <Campo label="Capital social mín. (R$)">
                <input type="number" min={0} value={f.capitalMin} onChange={(e) => set('capitalMin', e.target.value)} placeholder="0" className={inp} />
              </Campo>
              <Campo label="Capital social máx. (R$)">
                <input type="number" min={0} value={f.capitalMax} onChange={(e) => set('capitalMax', e.target.value)} placeholder="sem limite" className={inp} />
              </Campo>
              <Campo label="Aberta de / até">
                <div className="flex gap-1">
                  <input type="date" value={f.aberturaInicio} onChange={(e) => set('aberturaInicio', e.target.value)} className={inp} />
                  <input type="date" value={f.aberturaFim} onChange={(e) => set('aberturaFim', e.target.value)} className={inp} />
                </div>
              </Campo>
              <Campo label="Porte" span2>
                <div className="flex flex-wrap gap-3 pt-1">
                  {([['01','Micro'],['03','Pequeno'],['05','Demais']] as const).map(([code, lbl]) => (
                    <Toggle key={code} checked={f.porte.includes(code)} onChange={() => togglePorte(code)} label={lbl} />
                  ))}
                </div>
              </Campo>
            </div>
          )}

          {/* quantidade */}
          <div className="mt-5 border-t border-zinc-100 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-zinc-600">Quantidade:</span>
              {PRESETS.map((p) => (
                <button key={p} onClick={() => set('limite', p)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition ${f.limite === p ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
                  {p}
                </button>
              ))}
              <input type="number" min={1} max={6000} value={f.limite}
                onChange={(e) => set('limite', Math.max(1, Math.min(Number(e.target.value) || 1, 6000)))}
                className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-emerald-500" />
              <span className="text-xs text-zinc-400">máx. 6000 por busca · acima de 1000 pagina e consome mais saldo</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={buscar} disabled={!podeBuscar}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
              {loading ? 'Buscando…' : `Buscar ${f.limite} leads`}
            </button>
            {!hasKey && <span className="text-sm text-amber-600">Informe a chave da API primeiro.</span>}
            {semSaldo && <span className="text-sm text-red-600">Saldo zerado — recarregue no portal.</span>}
          </div>
        </section>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

        <TemplateEditor
          template={template}
          onChange={salvarTemplate}
          onReset={() => salvarTemplate(DEFAULT_TEMPLATE)}
          sampleVars={leads[0] ? leadVars(leads[0]) : null}
          status={tplStatus}
          dbReady={dbReady}
        />

        {leads.length > 0 && (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-zinc-900">Disparo em massa</h2>
                <p className="text-xs text-zinc-500">
                  Gera o link curto de cada lead e baixa um CSV (telefone, WhatsApp, link e a mensagem já montada) pronto pra importar na sua ferramenta de disparo.
                </p>
              </div>
              <button
                onClick={gerarDisparo}
                disabled={gerandoTodos || !leads.length}
                className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {gerandoTodos ? 'Gerando…' : `Gerar links + CSV de disparo (${leads.length})`}
              </button>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">Mensagem do disparo</span>
                <span className="font-mono text-[11px] text-zinc-400">use {'{{link}}'} e variáveis do lead</span>
              </div>
              <textarea
                value={disparoMsg}
                onChange={(e) => salvarDisparoMsg(e.target.value)}
                rows={3}
                className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              {Object.keys(links).length > 0 && (
                <p className="mt-1 text-xs text-emerald-700">{Object.keys(links).length} link(s) curto(s) já gerados.</p>
              )}
            </div>
          </section>
        )}

        {(leads.length > 0 || total !== null) && (
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                <span className="font-semibold text-zinc-900">{leads.length}</span> leads
                {total !== null && <span className="text-zinc-400">· {total.toLocaleString('pt-BR')} no filtro</span>}
                <Badge>{comWpp} c/ WhatsApp</Badge>
                <Badge>{comEmail} c/ e-mail</Badge>
              </div>
              <button onClick={baixarCsv} disabled={!leads.length || gerandoTodos}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">
                {gerandoTodos ? 'Gerando…' : 'Baixar CSV (com link)'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-400">
                    <th className="px-5 py-2 font-medium">Empresa</th>
                    <th className="px-3 py-2 font-medium">CNPJ</th>
                    <th className="px-3 py-2 font-medium">Local</th>
                    <th className="px-3 py-2 font-medium">Telefone</th>
                    <th className="px-3 py-2 font-medium">WhatsApp</th>
                    <th className="px-3 py-2 font-medium">E-mail</th>
                    <th className="px-3 py-2 font-medium">Página</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.cnpj} className="border-b border-zinc-50 align-top hover:bg-zinc-50/60">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-zinc-900">{l.razaoSocial || l.nomeFantasia || '—'}</div>
                        <div className="text-xs text-zinc-500">
                          {[l.nomeFantasia && l.nomeFantasia !== l.razaoSocial ? l.nomeFantasia : '', l.porte, l.dataAbertura && `aberta ${l.dataAbertura}`].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-600">{l.cnpjFormatado}</td>
                      <td className="px-3 py-2.5 text-zinc-600">{l.municipio ? `${l.municipio}/${l.uf}` : l.uf || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700">
                        {l.telefones.length ? (
                          <span>{l.telefones[0]}{l.telefones.length > 1 && <span className="text-zinc-400"> +{l.telefones.length - 1}</span>}</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {l.whatsapp ? (
                          <a href={l.whatsappLink} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                            ● abrir
                          </a>
                        ) : <span className="text-xs text-zinc-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-700">
                        {l.email ? (
                          <span>{l.email}{l.emails.length > 1 && <span className="text-zinc-400"> +{l.emails.length - 1}</span>}</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => copiarLink(l)} disabled={gerando === l.cnpj}
                            className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50">
                            {gerando === l.cnpj ? 'gerando…' : copiado === l.cnpj ? 'copiado!' : 'copiar link'}
                          </button>
                          <button onClick={() => abrirLink(l)} disabled={gerando === l.cnpj} title="abrir página"
                            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-50">
                            abrir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading && <div className="px-5 py-4 text-sm text-zinc-500">Carregando…</div>}
            {!loading && leads.length === 0 && total === 0 && (
              <div className="px-5 py-8 text-center text-sm text-zinc-500">Nenhum lead pra esses filtros. Afrouxe os filtros e tente de novo.</div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

const inp = 'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{children}</span>;
}

function SaldoBadge({ saldo, loading, visivel }: { saldo: Saldo | null; loading: boolean; visivel: boolean }) {
  if (!visivel) return null;
  const total = saldo?.saldo_total ?? 0;
  const cor = total > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700';
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${cor}`}>
      <span className="text-xs opacity-70">saldo</span>
      <span className="font-semibold">{loading ? '…' : total.toLocaleString('pt-BR')}</span>
    </div>
  );
}

function Campo({ label, span2, children }: { label: string; span2?: boolean; children: ReactNode }) {
  return (
    <label className={`block ${span2 ? 'col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-zinc-700">
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-zinc-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-4' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}
