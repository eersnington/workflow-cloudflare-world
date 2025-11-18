import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

export interface WorkflowFastifyOptions {
  /**
   * Directory containing workflow files
   * Default: ['.well-known/workflow/v1']
   */
  dirs?: string[];

  /**
   * Output directory for generated handlers
   * Default: '.well-known/workflow/v1'
   */
  outputDir?: string;

  /**
   * Route prefix for workflow endpoints
   * Default: '/.well-known/workflow/v1'
   */
  prefix?: string;

  /**
   * Whether to register custom error handler
   * Default: true
   */
  errorHandler?: boolean;

  /**
   * Logging configuration
   */
  logging?: {
    /**
     * Enable workflow logging
     * Default: true
     */
    enabled: boolean;

    /**
     * Log level for workflow operations
     * Default: 'info'
     */
    level: 'debug' | 'info' | 'warn' | 'error';

    /**
     * Include workflow execution details in logs
     * Default: false
     */
    includeExecutionDetails?: boolean;
  };

  /**
   * Performance options
   */
  caching?: {
    /**
     * Cache workflow handlers in memory
     * Default: true
     */
    enabled: boolean;

    /**
     * Maximum number of cached handlers
     * Default: 100
     */
    maxHandlers?: number;
  };

  /**
   * Enable Fastify schema validation for workflow endpoints
   * Default: true
   */
  validation?: boolean;

  /**
   * Enable Hot Module Replacement during development
   * Default: false (enabled automatically in dev mode)
   */
  hmr?: boolean;

  /**
   * Optional path where the workflow manifest should be written.
   * This allows downstream tooling to reference workflow metadata.
   */
  workflowManifestPath?: string;
}

export interface WorkflowRequest extends FastifyRequest {
  /**
   * Workflow-specific request metadata
   */
  workflowContext?: {
    handlerType: 'flow' | 'step' | 'webhook';
    workflowId?: string;
    runId?: string;
  };
}

export interface WorkflowReply extends FastifyReply {
  /**
   * Workflow-specific response methods
   */
  workflowSuccess?(data: any): void;
  workflowError?(error: Error, statusCode?: number): void;
}

export interface WorkflowHandler {
  (request: Request): Promise<Response>;
}

export interface WebhookHandlers {
  [method: string]: WorkflowHandler;
}

export interface WorkflowError extends Error {
  code: string;
  workflowId?: string;
  runId?: string;
  statusCode?: number;
}

export interface WorkflowContext {
  fastify: any;
  options: WorkflowFastifyOptions;
  handlers: Map<string, any>;
}

// No custom decorator interface needed
// Use standard workflow API with start() function and getWorkflow() utility

// Fastify plugin type
export type WorkflowFastifyPlugin = FastifyPluginAsync<WorkflowFastifyOptions>;
