import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';

const appVersion = (JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {version: string}).version;

export default defineConfig(() => {
  return {
    define: {__APP_VERSION__: JSON.stringify(appVersion)},
    plugins: [react(), tailwindcss()],
    build: {target: 'es2022'},
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

