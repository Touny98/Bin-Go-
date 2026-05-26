import './globals.css';
import { Providers } from './providers';
import { Inter } from 'next/font/google';
import { AdminNav } from '@/components/AdminNav';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'BinGo! Admin Console',
  description: 'Operational control tower for BinGo! WhatsApp Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        <Providers>
          <AdminNav />
          <div className="pl-0 md:pl-56 min-h-screen">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
