import type { RequestHandler } from 'express';
import { createWorkflowMiddleware } from './middleware.js';

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

export interface WorkflowOptions {
  /**
   * Directory containing workflow files
   * @default 'workflows'
   */
  workflowsDir?: string;
}

// Re-export builder for advanced usage
export { ExpressBuilder } from './builder.js';

// Re-export types for advanced usage
export type { WorkflowRequest, WorkflowResponse } from './types.js';
