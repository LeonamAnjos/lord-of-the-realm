// Renders public/icon.svg into the PNG icons the installable app needs. Run: npx tsx scripts/make-icons.ts
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url));
const out = (name: string, size: number) => sharp(svg, { density: 384 }).resize(size, size).png().toFile(new URL(`../public/${name}`, import.meta.url).pathname);
await Promise.all([
  out('pwa-192x192.png', 192),
  out('pwa-512x512.png', 512),
  out('maskable-512x512.png', 512), // the artwork sits inside the central safe zone, so one image serves both
  out('apple-touch-icon.png', 180),
]);
console.log('icons written');
