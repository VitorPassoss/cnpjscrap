'use client';

import { useState } from 'react';

export default function Login() {
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const entrar = async () => {
    if (!pin) return;
    setCarregando(true);
    setErro('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'PIN incorreto.');
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

        <label className="mb-1 block text-sm font-medium text-zinc-700">PIN de acesso</label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && entrar()}
          placeholder="••••"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />

        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}

        <button
          onClick={entrar}
          disabled={!pin || carregando}
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
