import { join, resolve } from 'node:path';
import viteReact from '@vitejs/plugin-react';
import workflowPlugin from '@workflow/fastify';
import viteFastify from '@fastify/vite/plugin';

export default {
  root: join(import.meta.dirname, 'src', 'client'),
  build: {
    emptyOutDir: true,
    outDir: join(import.meta.dirname, 'dist'),
  },
  plugins: [
    workflowPlugin(),
    viteReact(),
    viteFastify({ spa: true, useRelativePaths: false }),
  ],
};
