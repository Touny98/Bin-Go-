// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Enable API routes for health checks and auth
  async redirects() {
    return [
      {
        source: '/',
        destination: '/operations',
        permanent: true,
      },
    ];
  },
};
module.exports = nextConfig;
