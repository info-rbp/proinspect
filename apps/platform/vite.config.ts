import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tailwindcss(), reactRouter()],
});
