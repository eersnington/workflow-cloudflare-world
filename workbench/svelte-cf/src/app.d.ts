import type {
  DurableObjectNamespace,
  KVNamespace,
} from '@cloudflare/workers-types';

declare global {
  namespace App {
    interface Platform {
      env?: {
        YOUR_KV_NAMESPACE: KVNamespace;
        YOUR_DURABLE_OBJECT_NAMESPACE: DurableObjectNamespace;
      };
    }
  }
}

export {};
