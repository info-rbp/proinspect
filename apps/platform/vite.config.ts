import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [
    ...(process.env.PROINSPECT_RUNTIME === 'node-proof' ? [] : [cloudflare({ viteEnvironment: { name: 'ssr' } })]),
    tailwindcss(), reactRouter(),
  ],
  ...(process.env.PROINSPECT_RUNTIME === 'node-proof' ? {
    resolve: { alias: { 'cloudflare:workers': new URL('./node/unsupported-workers.ts', import.meta.url).pathname } },
  } : {}),
});
