import { resolve } from 'node:path';
import viteFastify from '@fastify/vite/plugin';
import workflowPlugin from '@workflow/fastify';

export default {
  root: resolve(import.meta.dirname, 'src', 'client'),
  plugins: [
    viteFastify({ useRelativePaths: true, spa: true, api: true }),
    workflowPlugin(),
  ],
  build: {
    emptyOutDir: true,
    // Forces Vite to use a top-level dist folder,
    // outside the project root defined above
    outDir: resolve(import.meta.dirname, 'dist'),
  },
};
