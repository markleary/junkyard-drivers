import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 2500, rollupOptions: { output: { manualChunks: { physics: ['@dimforge/rapier3d-compat'], three: ['three'] } } } },
});
