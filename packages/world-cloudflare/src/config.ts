/**
 * Cloudflare Workers environment bindings required for the world implementation
 */
export interface CloudflareEnv {
  /**
   * D1 database binding
   */
  DB: D1Database;

  /**
   * Cloudflare Queue binding for workflow jobs
   */
  WORKFLOW_QUEUE: Queue;

  /**
   * Cloudflare Queue binding for step jobs
   */
  STEP_QUEUE: Queue;

  /**
   * R2 bucket for stream storage
   */
  STREAM_BUCKET: R2Bucket;

  /**
   * Durable Object namespace that coordinates stream writers/readers
   */
  STREAM_COORDINATOR: DurableObjectNamespace;

  /**
   * Optional deployment ID (defaults to 'cloudflare')
   */
  DEPLOYMENT_ID?: string;

  /**
   * Optional service binding that can invoke the Worker routes handling
   * `/.well-known/workflow` requests without leaving Cloudflare's network.
   *
   * When present, queue consumers will use this binding to deliver workflow
   * and step messages. If omitted, you must provide `WORKFLOW_DISPATCH_URL`.
   */
  WORKFLOW_DISPATCH?: Fetcher;

  /**
   * Absolute origin (for example: https://my-worker.workers.dev) that queue
   * consumers can use to call your Worker's workflow/step endpoints when a
   * service binding is not available.
   */
  WORKFLOW_DISPATCH_URL?: string;
}

export interface CloudflareWorldConfig {
  /**
   * Cloudflare Workers environment bindings
   */
  env: CloudflareEnv;

  /**
   * Optional queue prefix for job names (default: 'workflow_')
   */
  queuePrefix?: string;
}
