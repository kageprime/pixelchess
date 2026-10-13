import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

const rootDir = import.meta.dirname;

function copyStandaloneGamesPlugin() {
  return {
    name: 'copy-standalone-games',
    closeBundle() {
      const dirsToCopy = ['chess', 'pool', 'scrabble', 'connect4', 'ayo', 'ludo', 'shared'];
      const filesToCopy = [
        'manifest.webmanifest',
        'sw.js',
        'icon-192.png',
        'icon-512.png',
        'landscape.png',
        'pool-360x640.png',
        'scrabble-1280x800.png'
      ];
      const dist = resolve(rootDir, 'dist');
      if (!fs.existsSync(dist)) return;

      for (const d of dirsToCopy) {
        const src = resolve(rootDir, d);
        const dest = resolve(dist, d);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }
      for (const f of filesToCopy) {
        const src = resolve(rootDir, f);
        const dest = resolve(dist, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [copyStandaloneGamesPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        store: resolve(rootDir, 'store.html'),
        trophies: resolve(rootDir, 'trophies.html')
      }
    }
  },
  server: {
    port: 5173,
    open: false
  }
});
