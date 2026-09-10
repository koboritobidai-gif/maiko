import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA — deploys to Vercel (maiko-self.vercel.app).
// All data is fetched client-side directly from the uysot CRM API,
// whose CORS policy whitelists this origin with credentials.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
