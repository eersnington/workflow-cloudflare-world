import type { RequestHandler } from 'express';
import { createWorkflowMiddleware } from './middleware.js';
import type { WorkflowOptions } from './types.js';
export { ExpressBuilder } from './builder.js';

/**
 * Main workflow middleware for Express
 *
 * Usage:
 * ```typescript
 * import workflow from 'workflow-express';
 * app.use(workflow());
 * ```
 */
export default function workflow(
  options: WorkflowOptions = {}
): RequestHandler {
  const middleware = createWorkflowMiddleware(options);
  return middleware;
}

// Re-export types for advanced usage
export type {
  WorkflowOptions,
  WorkflowRequest,
  WorkflowResponse,
} from './types.js';
