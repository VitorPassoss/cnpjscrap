'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildRedirectUrl, decodeLeadLink, renderTemplate } from '@/lib/leadLink';

function LeadView() {
  const params = useSearchParams();
  const d = params.get('d');
  const cnpj = params.get('cnpj')?.replace(/\D/g, '') ?? '';
  const [erro, setErro] = useState(false);

  // Fallback (URL longa, dados no link). Substitui o documento inteiro pelo
  // template — sem iframe, então a página rola natural e roda JS nativo.
  // Sem dados no link (sem `d`) mas com CNPJ na URL → "URL viva": manda pra
  // /cnpj/<cnpj>, que monta o template consultando o lead na hora.
  useEffect(() => {
    const payload = d ? decodeLeadLink(d) : null;
    // Template tipo URL → redireciona pra página externa com os dados na query.
    if (payload && payload.k === 'url' && typeof payload.u === 'string') {
      window.location.replace(buildRedirectUrl(payload.u, payload.v, payload.p));
      return;
    }
    if (!payload || typeof payload.t !== 'string') {
      if (cnpj.length === 14) {
        window.location.replace(`/cnpj/${cnpj}`);
        return;
      }
      setErro(true);
      return;
    }
    const doc = renderTemplate(payload.t, payload.v);
    document.open();
    document.write(doc);
    document.close();
  }, [d, cnpj]);

  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-zinc-800">Link inválido ou expirado</p>
          <p className="mt-1 text-sm text-zinc-500">Os dados deste lead não puderam ser lidos da URL.</p>
        </div>
      </div>
    );
  }

  return <div className="min-h-screen bg-zinc-100" />;
}

export default function LeadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-100" />}>
      <LeadView />
    </Suspense>
  );
}
