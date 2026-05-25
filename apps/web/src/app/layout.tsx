import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'cnpjscrap',
  description: 'Prospecção B2B de CNPJs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
