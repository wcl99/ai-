import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { getLocalPreviewResponse } from './src/dev/localPreviewApi';

const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000';

function localPreviewApi(): Plugin {
  return {
    name: 'local-preview-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url) return next();
        const method = request.method ?? 'GET';
        const sendPreview = (body?: Record<string, unknown>) => {
          const preview = getLocalPreviewResponse(request.url!, method, body);
          if (!preview) return next();
          response.statusCode = preview.status;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(preview.body));
        };
        if (method === 'GET') return sendPreview();
        if (method !== 'POST' && method !== 'PATCH') return next();
        let rawBody = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => { rawBody += chunk; });
        request.on('end', () => {
          try {
            sendPreview(rawBody ? JSON.parse(rawBody) as Record<string, unknown> : undefined);
          } catch {
            next();
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [localPreviewApi(), react()],
  server: {
    port: devPort,
    strictPort: true,
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
