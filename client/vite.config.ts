import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': path.resolve(here, '../shared/src') } },
  server: {
    port: 5173,
    host: true,
    fs: { allow: [path.resolve(here, '..')] },
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: { outDir: path.resolve(here, 'dist'), emptyOutDir: true },
});
