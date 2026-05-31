import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, host: true },
  base: '/webnoteplus/', // GitHub repo name
  build: { target: 'esnext', outDir: 'dist' },
});
