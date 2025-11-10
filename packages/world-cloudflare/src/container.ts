import { Container } from '@cloudflare/containers';
import { runInContext, createContext } from 'node:vm';
import { seedrandom } from 'seedrandom';

export interface WorkflowExecutionContext {
  seed: string;
  fixedTimestamp: number;
  workflowRunId: string;
  deploymentId?: string;
}

export interface WorkflowExecutionRequest {
  workflowCode: string;
  context: WorkflowExecutionContext;
  inputs: any;
  workflowRun: {
    workflowName: string;
    runId: string;
  };
}

export interface WorkflowExecutionResponse {
  success: boolean;
  result?: any;
  error?: string;
  retryAfterSeconds?: number;
}

/**
 * Container that provides Node.js VM execution environment for workflows
 */
export class WorkflowExecutorContainer extends Container {
  defaultPort = 8080;
  instance_type = 'basic' as const; // 1 vCPU, 1 GiB Memory, 4 GB Disk
  sleepAfter = '10m'; // Keep containers warm for 10 minutes

  envVars = {
    NODE_ENV: 'production',
  };

  async fetch(request: Request): Promise<Response> {
    try {
      // Only handle POST requests to /execute
      if (request.method !== 'POST' || !request.url.endsWith('/execute')) {
        return new Response('Not Found', { status: 404 });
      }

      const execRequest: WorkflowExecutionRequest = await request.json();

      // Validate required fields
      if (
        !execRequest.workflowCode ||
        !execRequest.context ||
        !execRequest.workflowRun
      ) {
        return Response.json(
          {
            success: false,
            error:
              'Missing required fields: workflowCode, context, workflowRun',
          },
          { status: 400 }
        );
      }

      // Create deterministic VM context
      const vmContext = this.createVMContext(execRequest.context);

      // Execute workflow with VM context
      try {
        const workflowFn = runInContext(
          `${execRequest.workflowCode}; globalThis.__private_workflows?.get(${JSON.stringify(execRequest.workflowRun.workflowName)})`,
          vmContext.context
        );

        if (typeof workflowFn !== 'function') {
          throw new Error(
            `Workflow function '${execRequest.workflowRun.workflowName}' not found`
          );
        }

        // Execute the workflow function with inputs
        const result = await workflowFn(execRequest.inputs);

        return Response.json({
          success: true,
          result,
        } satisfies WorkflowExecutionResponse);
      } catch (workflowError) {
        console.error('Workflow execution error:', workflowError);

        // Check if this is a retryable error
        if (workflowError.message.includes('RetryableError')) {
          return Response.json(
            {
              success: false,
              error: workflowError.message,
              retryAfterSeconds: 30,
            } satisfies WorkflowExecutionResponse,
            { status: 503 }
          );
        }

        // Non-retryable error
        return Response.json(
          {
            success: false,
            error: workflowError.message,
          } satisfies WorkflowExecutionResponse,
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('Container error:', error);
      return Response.json(
        {
          success: false,
          error: error.message,
        } satisfies WorkflowExecutionResponse,
        { status: 500 }
      );
    }
  }

  private createVMContext(options: WorkflowExecutionContext) {
    const { fixedTimestamp, seed } = options;
    const rng = seedrandom(seed);
    const context = createContext();

    const g = runInContext('globalThis', context);

    // Deterministic Math.random()
    g.Math.random = rng;

    // Deterministic Date constructor
    const Date_ = g.Date;
    (g as any).Date = function Date(...args: any[]) {
      if (args.length === 0) {
        return new Date_(fixedTimestamp);
      }
      return new Date_(...args);
    };
    (g as any).Date.prototype = Date_.prototype;
    Object.setPrototypeOf(g.Date, Date_);
    g.Date.now = () => fixedTimestamp;

    // Deterministic crypto using Proxy
    const originalCrypto = globalThis.crypto;
    const originalSubtle = originalCrypto.subtle;

    function getRandomValues(array: Uint8Array) {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(rng() * 256);
      }
      return array;
    }

    const randomUUID = () => {
      const bytes = new Uint8Array(16);
      getRandomValues(bytes);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10

      const hexChars = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, '0')
      );
      return [
        hexChars.slice(0, 4).join(''),
        hexChars.slice(4, 6).join(''),
        hexChars.slice(6, 8).join(''),
        hexChars.slice(8, 10).join(''),
        hexChars.slice(10, 16).join(''),
      ].join('-');
    };

    const boundDigest = originalSubtle.digest.bind(originalSubtle);

    g.crypto = new Proxy(originalCrypto, {
      get(target, prop) {
        if (prop === 'getRandomValues') {
          return getRandomValues;
        }
        if (prop === 'randomUUID') {
          return randomUUID;
        }
        if (prop === 'subtle') {
          return new Proxy(originalSubtle, {
            get(target, prop) {
              if (prop === 'generateKey') {
                return () => {
                  throw new Error('Not implemented');
                };
              } else if (prop === 'digest') {
                return boundDigest;
              }
              return target[prop as keyof typeof originalSubtle];
            },
          });
        }
        return target[prop as keyof typeof originalCrypto];
      },
    });

    // Preserve environment variables
    (g as any).process = {
      env: Object.freeze({ ...process.env }),
    };

    // Add required Web APIs
    g.Headers = globalThis.Headers;
    g.TextEncoder = globalThis.TextEncoder;
    g.TextDecoder = globalThis.TextDecoder;
    g.console = globalThis.console;
    g.URL = globalThis.URL;
    g.URLSearchParams = globalThis.URLSearchParams;
    g.structuredClone = globalThis.structuredClone;

    // HACK: Shim exports for bundle compatibility
    g.exports = {};
    (g as any).module = { exports: g.exports };

    return {
      context,
      globalThis: g,
      updateTimestamp: (timestamp: number) => {
        fixedTimestamp = timestamp;
      },
    };
  }
}
