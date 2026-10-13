import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5200 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
