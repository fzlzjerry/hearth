import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // node-pty / ssh2 are native or CJS — keep them external (don't bundle).
  external: ['node-pty'],
  banner: { js: '#!/usr/bin/env node' },
})
