'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_TEMPLATE, DEMO_VARS, LEAD_VARS, renderTemplate, type Template } from '@/lib/leadLink';

interface Props {
  templates: Template[];
  activeId: string;
  /** Recebe a lista atualizada e o id do template ativo. */
  onChange: (templates: Template[], activeId: string) => void;
  /** Variáveis de um lead real pra prévia; cai no demo se não houver. */
  sampleVars?: Record<string, string> | null;
  status?: '' | 'salvando' | 'salvo' | 'erro';
  dbReady?: boolean;
  max?: number;
}

const STATUS_LABEL: Record<string, string> = {
  salvando: 'salvando…',
  salvo: 'salvo no banco ✓',
  erro: 'falha ao salvar',
};

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}`;

export default function TemplateEditor({
  templates,
  activeId,
  onChange,
  sampleVars,
  status,
  dbReady = true,
  max = 3,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [editId, setEditId] = useState(activeId);

  const editando =
    templates.find((t) => t.id === editId) ?? templates.find((t) => t.id === activeId) ?? templates[0];

  const vars = sampleVars ?? DEMO_VARS;
  const doc = useMemo(
    () => (editando ? renderTemplate(editando.html, vars) : ''),
    [editando, vars],
  );

  if (!editando) return null;

  const ativo = templates.find((t) => t.id === activeId);

  const patchEditando = (patch: Partial<Template>) =>
    onChange(
      templates.map((t) => (t.id === editando.id ? { ...t, ...patch } : t)),
      activeId,
    );

  const tornarAtivo = () => onChange(templates, editando.id);

  const novoTemplate = () => {
    if (templates.length >= max) return;
    const novo: Template = { id: uid(), name: `Template ${templates.length + 1}`, html: DEFAULT_TEMPLATE };
    onChange([...templates, novo], activeId);
    setEditId(novo.id);
  };

  const excluir = () => {
    if (templates.length <= 1) return;
    const rest = templates.filter((t) => t.id !== editando.id);
    const proxAtivo = activeId === editando.id ? rest[0]!.id : activeId;
    onChange(rest, proxAtivo);
    setEditId(rest[0]!.id);
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Modelos da página pública</h2>
          <p className="text-xs text-zinc-500">
            Até {max} templates nomeados — o marcado como{' '}
            <span className="font-medium text-emerald-700">ativo</span> é o usado pra gerar os links.{' '}
            {ativo && <span className="text-zinc-400">Ativo: {ativo.name}</span>}
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
          Banco não configurado (DATABASE_URL) — as alterações dos templates não estão sendo salvas.
        </p>
      )}

      {aberto && (
        <div className="border-t border-zinc-100 p-5">
          {/* abas: lista de templates */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {templates.map((t) => {
              const isEdit = t.id === editando.id;
              const isAtivo = t.id === activeId;
              return (
                <button
                  key={t.id}
                  onClick={() => setEditId(t.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
                    isEdit
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {isAtivo && <span title="ativo" className="text-emerald-600">★</span>}
                  <span className="font-medium">{t.name || 'sem nome'}</span>
                </button>
              );
            })}
            {templates.length < max && (
              <button
                onClick={novoTemplate}
                className="rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-emerald-300 hover:text-emerald-700"
              >
                + novo template
              </button>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* editor */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={editando.name}
                  onChange={(e) => patchEditando({ name: e.target.value })}
                  placeholder="nome do template"
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
                {activeId === editando.id ? (
                  <span className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white">★ ativo</span>
                ) : (
                  <button
                    onClick={tornarAtivo}
                    className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    tornar ativo
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">Template (HTML + Tailwind)</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => patchEditando({ html: DEFAULT_TEMPLATE })}
                    className="text-xs text-zinc-500 underline hover:text-zinc-700"
                  >
                    restaurar padrão
                  </button>
                  {templates.length > 1 && (
                    <button onClick={excluir} className="text-xs text-red-500 underline hover:text-red-700">
                      excluir
                    </button>
                  )}
                </div>
              </div>

              <textarea
                value={editando.html}
                onChange={(e) => patchEditando({ html: e.target.value })}
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
                      onClick={() => patchEditando({ html: editando.html + `{{${v.key}}}` })}
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
                sandbox="allow-scripts allow-modals allow-popups allow-forms"
                className="h-80 w-full rounded-lg border border-zinc-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
