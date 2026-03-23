import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'VozFinance - Gestor de Despesas por Voz',
  description: 'Controle suas finanças falando. Adicione despesas por voz, visualize resumos semanais/mensais e exporte para Excel ou PDF.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable}`}>
      <body className="font-sans antialiased bg-stone-50 text-stone-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
