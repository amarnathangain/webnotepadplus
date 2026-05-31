import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, host: true },
  base: '/', // GitHub Pages serves from /webnotepadplus/ automatically
  build: { target: 'esnext', outDir: 'dist' },
});
