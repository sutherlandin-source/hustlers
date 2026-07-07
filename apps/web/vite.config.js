import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@hustlers/ui': resolve(__dirname, '../../packages/ui/src'),
      '@hustlers/shared': resolve(__dirname, '../../packages/shared/src'),
      '@hustlers/types': resolve(__dirname, '../../packages/types/src')
    }
  },

  server: {
    port: 5173,
    strictPort: true,
    host: true, 
    allowedHosts: [
      "germproof-comprised-amino.ngrok-free.dev"
    ]
  }
});