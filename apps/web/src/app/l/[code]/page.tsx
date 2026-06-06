import { dbConfigured, getLeadLink } from '@/lib/db';
import { renderTemplate, type LeadLinkPayload } from '@/lib/leadLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LeadShortPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const payload = dbConfigured() ? await getLeadLink<LeadLinkPayload>(code) : null;

  if (!payload || typeof payload.t !== 'string' || typeof payload.v !== 'object') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-zinc-800">Link não encontrado</p>
          <p className="mt-1 text-sm text-zinc-500">Este link de lead não existe ou foi removido.</p>
        </div>
      </div>
    );
  }

  const doc = renderTemplate(payload.t, payload.v);

  return (
    <iframe
      title="lead"
      srcDoc={doc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      className="h-screen w-screen border-0"
    />
  );
}
