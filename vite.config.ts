/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Three ways to build:
//   npm run build         the installable, offline web app for GitHub Pages (base path = the repo name)
//   npm run build:single  one self-contained index.html for previewing anywhere (no service worker)
//   npm run dev           the dev server
// GitHub Pages serves the site from /<repo-name>/. Set BASE_PATH if the repo is renamed (the deploy workflow does it for you).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: single ? './' : process.env.BASE_PATH ?? '/lord-of-the-realm/',
    plugins: [
      preact(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'Fief & Crown',
              short_name: 'Fief & Crown',
              description: 'A medieval strategy game. Take all twelve counties from three rival lords.',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#0f1311',
              theme_color: '#0f1311',
              categories: ['games'],
              icons: [
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], cleanupOutdatedCaches: true },
          }),
    ],
    // the single file has no service worker, so it gets a do-nothing stand-in for the registration module and carries no public/ files
    publicDir: single ? false : 'public',
    resolve: single ? { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/pwa-register-stub.ts', import.meta.url)) } } : {},
    build: single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {},
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
