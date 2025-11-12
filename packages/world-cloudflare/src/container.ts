import { createContext, runInContext } from 'node:vm';
import seedrandom from 'seedrandom';

/**
 * NOTE:
 * The real Cloudflare Container implementation depends on `@cloudflare/containers`
 * which imports non-standard ESM specifiers (eg. `cloudflare:workers`) that Node
 * cannot resolve in local dev/build contexts. To avoid crashing `wrangler dev`
 * or bundlers, we do NOT import `@cloudflare/containers` at module-evaluation
 * time. Instead we provide a loader that dynamically imports the package at
 * runtime and constructs the container class only when the environment supports it.
 */

/**
 * Types
 */
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
 * createWorkflowExecutorContainerClass
 *
 * Dynamically imports `@cloudflare/containers` and returns the concrete
 * `WorkflowExecutorContainer` class that extends the runtime `Container`.
 *
 * If the import fails (for example in local Node dev where the cloudflare:
 * scheme is unsupported), the function returns `undefined` and logs a
 * non-fatal warning. Callers should handle the `undefined` case or use the
 * proxy helper that exposes a safe loader (`loadWorkflowExecutorContainer`)
 * which the CLI and runtime code already use.
 */
export async function createWorkflowExecutorContainerClass(): Promise<
  any | undefined
> {
  try {
    // Dynamic import is typed as any to accommodate both CJS/ESM shapes.
    const cloudflareContainers: any = await import('@cloudflare/containers');
    const Container =
      cloudflareContainers.Container ??
      cloudflareContainers.default?.Container ??
      cloudflareContainers.default ??
      null;
    if (!Container) {
      // Unexpected shape; bail gracefully.
      console.warn(
        'Could not locate Container export on @cloudflare/containers; container support unavailable in this environment.'
      );
      return undefined;
    }

    // Define the concrete WorkflowExecutorContainer inside the loader so this
    // module can be safely imported during build/dev without evaluating any
    // runtime-only code.
    class WorkflowExecutorContainer extends Container {
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
            if (
              workflowError instanceof Error &&
              workflowError.message.includes('RetryableError')
            ) {
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
            const errorMessage =
              workflowError instanceof Error
                ? workflowError.message
                : 'Unknown error';
            return Response.json(
              {
                success: false,
                error: errorMessage,
              } satisfies WorkflowExecutionResponse,
              { status: 500 }
            );
          }
        } catch (error) {
          console.error('Container error:', error);
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          return Response.json(
            {
              success: false,
              error: errorMessage,
            } satisfies WorkflowExecutionResponse,
            { status: 500 }
          );
        }
      }

      private createVMContext(options: WorkflowExecutionContext) {
        let { fixedTimestamp, seed } = options;
        const rng = seedrandom(seed);
        const context = createContext();

        const g = runInContext('globalThis', context);

        // Deterministic Math.random()
        g.Math.random = rng;

        // Deterministic Date constructor
        const originalDate = g.Date;
        (g as any).Date = (...args: any[]) => {
          if (args.length === 0) {
            return new originalDate(fixedTimestamp);
          }
          return new originalDate(...args);
        };
        (g as any).Date.prototype = originalDate.prototype;
        Object.setPrototypeOf(g.Date, originalDate);
        g.Date.now = () => fixedTimestamp;

        // Deterministic crypto using Proxy
        const originalCrypto = (globalThis as any).crypto;
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
        g.Headers = (globalThis as any).Headers;
        g.TextEncoder = (globalThis as any).TextEncoder;
        g.TextDecoder = (globalThis as any).TextDecoder;
        g.console = (globalThis as any).console;
        g.URL = (globalThis as any).URL;
        g.URLSearchParams = (globalThis as any).URLSearchParams;
        g.structuredClone = (globalThis as any).structuredClone;

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

    return WorkflowExecutorContainer;
  } catch (err) {
    // Import failed — likely running in local Node where the `cloudflare:` scheme
    // or `@cloudflare/containers` layout is unsupported. Return undefined so
    // callers can handle the absence of container support gracefully.
    console.warn(
      'WorkflowExecutorContainer is not available in this environment:',
      err
    );
    return undefined;
  }
}
