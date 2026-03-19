import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  // These native modules must run in Node.js runtime, not Edge
  serverExternalPackages: ['better-sqlite3', '@lancedb/lancedb', 'apache-arrow'],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
