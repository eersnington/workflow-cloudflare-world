import workflowPlugin from '@workflow/fastify';
import { resolve } from 'node:path';

export default {
  root: resolve(__dirname, 'src/client'),
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  plugins: [workflowPlugin()],
};
