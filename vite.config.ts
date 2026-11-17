import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';
import {bundledPackagesPlugin, resetBundledPackagesManifest} from './scripts/bundled-packages-plugin.mjs';

const appVersion = (JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {version: string}).version;

export default defineConfig(({command}) => {
  if (command === 'build') resetBundledPackagesManifest();   // stop 21 (B): the manifest of the packages really bundled into dist is made by this build
  return {
    define: {__APP_VERSION__: JSON.stringify(appVersion)},
    plugins: [react(), tailwindcss(), bundledPackagesPlugin()],
    worker: {plugins: () => [bundledPackagesPlugin()]},
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

