import viteFastify from '@fastify/vite/plugin';
import workflowPlugin from '@workflow/fastify';

export default {
  plugins: [
    viteFastify({ useRelativePaths: true, api: true }),
    workflowPlugin(),
  ],
};
