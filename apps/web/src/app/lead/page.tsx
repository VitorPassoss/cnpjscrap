'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { decodeLeadLink, renderTemplate } from '@/lib/leadLink';

function LeadView() {
  const params = useSearchParams();
  const d = params.get('d');

  const doc = useMemo(() => {
    if (!d) return null;
    const payload = decodeLeadLink(d);
    if (!payload) return null;
    return renderTemplate(payload.t, payload.v);
  }, [d]);

  if (!doc) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-zinc-800">Link inválido ou expirado</p>
          <p className="mt-1 text-sm text-zinc-500">Os dados deste lead não puderam ser lidos da URL.</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title="lead"
      srcDoc={doc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      className="h-screen w-screen border-0"
    />
  );
}

export default function LeadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-100" />}>
      <LeadView />
    </Suspense>
  );
}
