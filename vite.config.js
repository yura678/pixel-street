import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:mobile` runs with --mode mobile → HTTPS so WebGPU (secure context)
// works on a phone opened via the LAN IP.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'mobile' ? [basicSsl()] : [],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: { rolldownOptions: { transform: { target: 'es2022' } } },
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
}));
