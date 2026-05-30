import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // There are two package-lock.json files in this repo (one at the
  // monorepo root for shared dev tooling, one here for the web app).
  // Turbopack picks the higher one by default and warns about it on
  // every boot. Pin the root to this package's directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
