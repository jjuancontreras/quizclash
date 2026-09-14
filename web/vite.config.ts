import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // The shared types live one directory up, outside this project's own
    // root. Vite refuses to serve files outside its detected root by
    // default; this is what lets `../src/shared/*` resolve in dev.
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
