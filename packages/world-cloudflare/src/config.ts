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
   * Durable Object namespace for stream coordination
   */
  STREAM_COORDINATOR: DurableObjectNamespace;

  /**
   * Optional deployment ID (defaults to 'cloudflare')
   */
  DEPLOYMENT_ID?: string;
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
