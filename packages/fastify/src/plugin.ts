import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WorkflowFastifyOptions } from './types.js';
import {
  WORKFLOW_ROUTES,
  FASTIFY_PLUGIN_NAME,
  FASTIFY_PLUGIN_VERSION,
} from './constants.js';
import {
  handleFlowRequest,
  handleStepRequest,
  handleWebhookRequest,
  clearHandlerCache,
} from './handlers.js';
import { DEFAULT_OUTPUT_DIR } from './constants.js';

/**
 * Core Fastify plugin for Workflow DevKit integration
 *
 * This plugin provides:
 * - Native Fastify route registration
 * - Request/response handling with Web API compatibility
 * - Error handling integration with Fastify's error system
 * - Performance optimizations and caching
 * - HMR support in development
 */
export const workflowFastifyPlugin = fp(
  async function workflowPlugin(
    fastify: FastifyInstance,
    options: WorkflowFastifyOptions = {}
  ) {
    const mergedOptions = mergeDefaultOptions(options);

    // Register workflow routes with Fastify's route system
    await registerWorkflowRoutes(fastify, mergedOptions);

    // Add hooks for workflow lifecycle management
    if (mergedOptions.logging?.enabled) {
      fastify.addHook('onRequest', createRequestLogger(mergedOptions));
    }

    // Register custom error handler if requested
    if (mergedOptions.errorHandler !== false) {
      fastify.setErrorHandler(createWorkflowErrorHandler(mergedOptions));
    }

    // Performance monitoring hook
    fastify.addHook('onResponse', createResponseLogger(mergedOptions));

    // Log plugin registration
    fastify.log.info(
      {
        plugin: FASTIFY_PLUGIN_NAME,
        version: FASTIFY_PLUGIN_VERSION,
        options: mergedOptions,
      },
      'Workflow Fastify plugin registered'
    );
  },
  {
    name: FASTIFY_PLUGIN_NAME,
    fastify: FASTIFY_PLUGIN_VERSION,
  }
);

/**
 * Merge user options with sensible defaults
 */
function mergeDefaultOptions(
  options: WorkflowFastifyOptions
): Required<WorkflowFastifyOptions> {
  return {
    dirs: ['workflows', 'src/workflows'],
    outputDir: DEFAULT_OUTPUT_DIR,
    prefix: WORKFLOW_ROUTES.base,
    errorHandler: true,
    logging: {
      enabled: true,
      level: 'info',
      includeExecutionDetails: false,
      ...options.logging,
    },
    caching: {
      enabled: true,
      maxHandlers: 100,
      ...options.caching,
    },
    validation: true,
    hmr: process.env.NODE_ENV !== 'production',
    ...options,
  };
}

/**
 * Register workflow routes with Fastify's route system
 */
async function registerWorkflowRoutes(
  fastify: FastifyInstance,
  options: Required<WorkflowFastifyOptions>
): Promise<void> {
  const routePrefix = options.prefix || WORKFLOW_ROUTES.base;

  // Flow execution endpoint
  fastify.route({
    method: 'POST',
    url: `${routePrefix}/flow`,
    handler: (request, reply) => handleFlowRequest(request, reply, options),
    schema: options.validation
      ? {
          summary: 'Execute workflow orchestration logic',
          tags: ['workflows'],
          body: {
            type: 'object',
            description: 'Workflow execution request',
            additionalProperties: true,
          },
          response: {
            200: { description: 'Workflow executed successfully' },
            400: { description: 'Invalid request' },
            404: { description: 'Workflow not found' },
            500: { description: 'Internal server error' },
          },
        }
      : undefined,
  });

  // Step execution endpoint
  fastify.route({
    method: 'POST',
    url: `${routePrefix}/step`,
    handler: (request, reply) => handleStepRequest(request, reply, options),
    schema: options.validation
      ? {
          summary: 'Execute individual workflow step',
          tags: ['workflows'],
          body: {
            type: 'object',
            description: 'Step execution request',
            additionalProperties: true,
          },
          response: {
            200: { description: 'Step executed successfully' },
            400: { description: 'Invalid request' },
            404: { description: 'Step not found' },
            500: { description: 'Internal server error' },
          },
        }
      : undefined,
  });

  // Webhook delivery endpoint
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    url: `${routePrefix}/webhook/:token`,
    handler: (request, reply) => handleWebhookRequest(request, reply, options),
    schema: options.validation
      ? {
          summary: 'Deliver webhook data to running workflows',
          tags: ['workflows'],
          params: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'Webhook token' },
            },
            required: ['token'],
          },
          response: {
            200: { description: 'Webhook delivered successfully' },
            404: { description: 'Webhook not found' },
            405: { description: 'Method not allowed' },
            500: { description: 'Internal server error' },
          },
        }
      : undefined,
  });

  fastify.log.info(`Workflow routes registered under: ${routePrefix}`);
}

/**
 * Create request logger hook for workflow requests
 */
function createRequestLogger(options: Required<WorkflowFastifyOptions>) {
  return async function requestLogger(request: FastifyRequest) {
    // Only log workflow requests
    if (!request.raw.url?.startsWith(options.prefix || WORKFLOW_ROUTES.base)) {
      return;
    }

    request.log.info(
      {
        url: request.url,
        method: request.method,
        userAgent: request.headers['user-agent'],
        timestamp: new Date().toISOString(),
      },
      'Workflow request received'
    );

    // Add workflow context to request
    (request as any).workflowContext = {
      handlerType: getHandlerTypeFromUrl(request.url),
      startTime: Date.now(),
    };
  };
}

/**
 * Create response logger hook for workflow requests
 */
function createResponseLogger(_options: Required<WorkflowFastifyOptions>) {
  return async function responseLogger(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Only log workflow requests
    const workflowContext = (request as any).workflowContext;
    if (!workflowContext) {
      return;
    }

    const duration = Date.now() - workflowContext.startTime;

    request.log.info(
      {
        url: request.url,
        method: request.method,
        statusCode: reply.statusCode,
        duration: `${duration}ms`,
        handlerType: workflowContext.handlerType,
        timestamp: new Date().toISOString(),
      },
      'Workflow request completed'
    );
  };
}

/**
 * Create custom error handler for workflow errors
 */
function createWorkflowErrorHandler(options: Required<WorkflowFastifyOptions>) {
  return function workflowErrorHandler(
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Only handle workflow-related errors
    if (!request.raw.url?.startsWith(options.prefix || WORKFLOW_ROUTES.base)) {
      // Let Fastify handle non-workflow errors
      return reply.send(error);
    }

    request.log.error(
      {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
        statusCode: reply.statusCode,
        timestamp: new Date().toISOString(),
      },
      'Workflow error occurred'
    );

    // Determine error response based on error type
    if (error.message.includes('not found')) {
      reply.status(404).send({
        error: 'Not Found',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    } else if (error.message.includes('workflow bundles missing')) {
      reply.status(500).send({
        error: 'Configuration Error',
        message: 'Please run "workflow build" before starting your server',
        hint: 'See https://useworkflow.dev/docs/how-it-works/framework-integrations',
        timestamp: new Date().toISOString(),
      });
    } else {
      reply.status(500).send({
        error: 'Internal Workflow Error',
        message: options.logging?.includeExecutionDetails
          ? error.message
          : 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Determine handler type from URL
 */
function getHandlerTypeFromUrl(
  url: string
): 'flow' | 'step' | 'webhook' | 'unknown' {
  if (url.includes('/flow')) return 'flow';
  if (url.includes('/step')) return 'step';
  if (url.includes('/webhook')) return 'webhook';
  return 'unknown';
}

/**
 * HMR support for development
 */
export function enableHMR(fastify: FastifyInstance): void {
  // Clear handler cache when HMR events are received
  process.on('message', (message: any) => {
    if (message?.type === 'workflow:hmr') {
      fastify.log.info(
        { filename: message.filename },
        'Workflow HMR: Clearing handler cache'
      );
      clearHandlerCache();
    }
  });
}

export default workflowFastifyPlugin;
