'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { decodeLeadLink, renderTemplate } from '@/lib/leadLink';

function LeadView() {
  const params = useSearchParams();
  const d = params.get('d');
  const [erro, setErro] = useState(false);

  // Fallback (URL longa, dados no link). Substitui o documento inteiro pelo
  // template — sem iframe, então a página rola natural e roda JS nativo.
  useEffect(() => {
    const payload = d ? decodeLeadLink(d) : null;
    if (!payload) {
      setErro(true);
      return;
    }
    const doc = renderTemplate(payload.t, payload.v);
    document.open();
    document.write(doc);
    document.close();
  }, [d]);

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
