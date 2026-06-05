import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      'bs-calendar': path.resolve(__dirname, '../../packages/bs-calendar/src/index.ts'),
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'bs-calendar': path.resolve(__dirname, '../../packages/bs-calendar/src/index.ts'),
    };
    return config;
  },
};

export default nextConfig;
