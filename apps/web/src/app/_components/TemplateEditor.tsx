'use client';

import { useMemo, useState } from 'react';
import { DEMO_VARS, LEAD_VARS, renderTemplate } from '@/lib/leadLink';

interface Props {
  template: string;
  onChange: (t: string) => void;
  onReset: () => void;
  /** Variáveis de um lead real pra prévia; cai no demo se não houver. */
  sampleVars?: Record<string, string> | null;
  status?: '' | 'salvando' | 'salvo' | 'erro';
  dbReady?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  salvando: 'salvando…',
  salvo: 'salvo no banco ✓',
  erro: 'falha ao salvar',
};

export default function TemplateEditor({ template, onChange, onReset, sampleVars, status, dbReady = true }: Props) {
  const [aberto, setAberto] = useState(false);
  const vars = sampleVars ?? DEMO_VARS;
  const doc = useMemo(() => renderTemplate(template, vars), [template, vars]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Modelo da página pública</h2>
          <p className="text-xs text-zinc-500">
            HTML + Tailwind com {'{{'}variáveis{'}}'} — vira o link de cada lead
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-xs ${status === 'erro' ? 'text-red-600' : 'text-zinc-400'}`}>
              {STATUS_LABEL[status]}
            </span>
          )}
          <span className="text-xs font-medium text-emerald-700">{aberto ? 'ocultar' : 'editar'}</span>
        </div>
      </button>

      {aberto && !dbReady && (
        <p className="border-t border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-700">
          Banco não configurado (DATABASE_URL) — as alterações do template não estão sendo salvas.
        </p>
      )}
      {aberto && (
        <div className="grid gap-4 border-t border-zinc-100 p-5 lg:grid-cols-2">
          {/* editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-600">Template (HTML + Tailwind)</span>
              <button onClick={onReset} className="text-xs text-zinc-500 underline hover:text-zinc-700">
                restaurar padrão
              </button>
            </div>
            <textarea
              value={template}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
              className="h-80 w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-600">
                Variáveis disponíveis <span className="text-zinc-400">(clique pra inserir)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LEAD_VARS.map((v) => (
                  <button
                    key={v.key}
                    title={v.label}
                    onClick={() => onChange(template + `{{${v.key}}}`)}
                    className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700 hover:bg-emerald-100 hover:text-emerald-800"
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* preview */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-zinc-600">
              Prévia {sampleVars ? '(primeiro lead da busca)' : '(dados de exemplo)'}
            </span>
            <iframe
              title="preview"
              srcDoc={doc}
              sandbox="allow-scripts allow-popups"
              className="h-80 w-full rounded-lg border border-zinc-200 bg-white"
            />
          </div>
        </div>
      )}
    </section>
  );
}
