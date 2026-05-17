import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { AuthProvider } from '@/store/auth';
import { SocketProvider } from '@/services/socket';

export default function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  // Initialize authentication on client load
  useEffect(() => {
    // This could read a refresh token from httpOnly cookie and request a new access token
    // For now we just mock a logged‑in admin for development.
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <Component {...pageProps} />
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
