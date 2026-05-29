/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // Proxy server-side: el browser llama a /api/* y /socket.io/* en el mismo origen
  // (ya sea localhost:3011 o el túnel ngrok del admin). Next.js los reenvía internamente
  // a la app de backend dentro de Docker — nunca se expone localhost al cliente externo.
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://app:3010';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${backendUrl}/socket.io/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
