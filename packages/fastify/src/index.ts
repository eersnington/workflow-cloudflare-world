/**
 * @workflow/fastify - Fastify plugin for Vercel Workflow DevKit
 *
 * A production-ready Fastify integration that follows Nitro's build-system-first approach
 * with native Fastify patterns, HMR support, and comprehensive error handling.
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import workflow from '@workflow/fastify';
 *
 * const fastify = Fastify();
 *
 * // Register workflow plugin
 * await fastify.register(workflow, {
 *   dirs: ['workflows'],
 *   logging: { enabled: true, level: 'info' }
 * });
 *
 * // Start server
 * await fastify.listen({ port: 3000 });
 * ```
 *
 * @example
 * ```typescript
 * // Using workflow decorators
 * fastify.get('/start-workflow', async (request, reply) => {
 *   const workflow = await fastify.workflow.getWorkflow('myWorkflow');
 *   const run = await fastify.workflow.execute('myWorkflow', [request.body.data]);
 *   return { runId: run.runId };
 * });
 * ```
 */

import workflowFastifyPlugin, { enableHMR } from './plugin.js';

// Re-export main plugin as default
export default workflowFastifyPlugin;

// Re-export types for advanced usage
export type {
  WorkflowFastifyOptions,
  WorkflowRequest,
  WorkflowReply,
  WorkflowHandler,
  WebhookHandlers,
  WorkflowError,
  WorkflowContext,
  WorkflowFastifyPlugin,
} from './types.js';

// Re-export builder for custom build scenarios
export { FastifyBuilder } from './builder.js';

// Re-export workflow utilities
export {
  getWorkflow,
  listWorkflows,
  getWorkflowMetadata,
  clearWorkflowCache,
  getCacheStats,
  WorkflowNotFoundError,
  WorkflowBundleNotFoundError,
  WorkflowBundleLoadError,
  WorkflowLoadError,
  WorkflowInvalidError,
  isWorkflowError,
} from './workflows.js';

// Re-export constants for configuration
export {
  WORKFLOW_ROUTES,
  DEFAULT_WORKFLOW_DIRS,
  HANDLER_FILENAMES,
  DEFAULT_OUTPUT_DIR,
  FASTIFY_PLUGIN_NAME,
  FASTIFY_PLUGIN_VERSION,
} from './constants.js';

// Re-export HMR utilities
export { enableHMR };

// Export plugin as named export for those who prefer it
export const workflow = workflowFastifyPlugin;
