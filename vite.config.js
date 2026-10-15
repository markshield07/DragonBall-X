import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev` serves plain HTTP on localhost (WebXR is allowed on localhost).
// `npm run dev:https` adds a self-signed certificate and listens on your LAN,
// which is what Meta Quest Browser needs to open the game from your PC.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  server: {
    host: mode === 'https' ? '0.0.0.0' : 'localhost',
    port: 5173,
  },
  preview: {
    host: mode === 'https' ? '0.0.0.0' : 'localhost',
    port: 4173,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
}));
