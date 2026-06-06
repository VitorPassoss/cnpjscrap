'use client';

import { useState } from 'react';

export default function Login() {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const entrar = async () => {
    if (!senha) return;
    setCarregando(true);
    setErro('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Senha incorreta.');
      window.location.href = '/';
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">CD</span>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-zinc-900">CNPJ Scraper</h1>
            <p className="text-xs leading-tight text-zinc-500">Acesso restrito ao painel</p>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-zinc-700">Senha mestra</label>
        <input
          type="password"
          autoFocus
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entrar()}
          placeholder="••••••••"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />

        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}

        <button
          onClick={entrar}
          disabled={!senha || carregando}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
