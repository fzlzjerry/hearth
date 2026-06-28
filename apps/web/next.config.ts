import type { NextConfig } from 'next'
import { join } from 'node:path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo: trace from the repo root so file tracing + lockfile detection are correct.
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  // The terminal stream never goes through Next — only UI + auth proxy live here.
}

export default nextConfig
