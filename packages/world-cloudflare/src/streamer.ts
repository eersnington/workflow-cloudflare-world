import type { Streamer } from '@workflow/world';
import type { CloudflareEnv } from './config.js';

const encodeChunk = (chunk: string | Uint8Array): Uint8Array =>
  typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;

const toBodyInit = (data: Uint8Array): ArrayBuffer => data.slice().buffer;

/**
 * Cloudflare Streamer implementation backed by Durable Objects for fan-out and
 * R2 for durable storage. Writers append chunks via the coordinator object,
 * while readers receive a live stream (no polling) from the same coordinator.
 */
export function createStreamer(env: CloudflareEnv): Streamer {
  const getCoordinator = (name: string): Fetcher => {
    const id = env.STREAM_COORDINATOR.idFromName(name);
    return env.STREAM_COORDINATOR.get(id);
  };

  return {
    async writeToStream(name, chunk) {
      const coordinator = getCoordinator(name);
      const encoded = encodeChunk(chunk);
      const response = await coordinator.fetch(
        // Workers requires Durable Object fetches to use an absolute URL.
        // Only the path/query are inspected by the coordinator, so we supply a
        // fixed placeholder origin to satisfy that requirement.
        new URL('/write', 'https://stream-coordinator.worker'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Stream-Name': name,
          },
          body: toBodyInit(encoded),
        }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to write stream chunk (${response.status}): ${await response.text()}`
        );
      }
    },

    async closeStream(name) {
      const coordinator = getCoordinator(name);
      const response = await coordinator.fetch(
        new URL('/close', 'https://stream-coordinator.worker'),
        {
          method: 'POST',
          headers: {
            'X-Stream-Name': name,
          },
        }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to close stream (${response.status}): ${await response.text()}`
        );
      }
    },

    async readFromStream(name, startIndex = 0) {
      const coordinator = getCoordinator(name);
      const url = new URL('/read', 'https://stream-coordinator.worker');
      url.searchParams.set('startIndex', String(startIndex));
      const response = await coordinator.fetch(url, {
        headers: {
          'X-Stream-Name': name,
        },
      });

      if (!response.ok || !response.body) {
        throw new Error(
          `Failed to read stream (${response.status}): ${await response.text()}`
        );
      }

      return response.body as ReadableStream<Uint8Array>;
    },
  };
}
