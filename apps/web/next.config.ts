import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// This app is self-contained (own package-lock.json, no cross-package imports),
// so pin Turbopack's root here. Otherwise Next.js detects multiple lockfiles
// (root + apps/web) and warns about an ambiguous workspace root.
const nextConfig: NextConfig = {
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
