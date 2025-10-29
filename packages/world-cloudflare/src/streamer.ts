import type { Streamer } from '@workflow/world';
import type { CloudflareEnv } from './config.js';

/**
 * Cloudflare Streamer implementation using R2 for stream storage
 *
 * Stores stream chunks as objects in R2 bucket, indexed by stream name and chunk number.
 * Each stream is stored as a series of objects: streams/{name}/{index}
 */
export function createStreamer(env: CloudflareEnv): Streamer {
  const bucket = env.STREAM_BUCKET;

  return {
    async writeToStream(
      name: string,
      chunk: string | Uint8Array
    ): Promise<void> {
      const metadataKey = `metadata/${name}`;
      const metadataObj = await bucket.get(metadataKey);
      let chunkIndex = 0;
      if (metadataObj) {
        const metadata = await metadataObj.json<{ chunkCount: number }>();
        chunkIndex = metadata.chunkCount;
      }
      const data =
        typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
      const chunkKey = `streams/${name}/${chunkIndex}`;
      await bucket.put(chunkKey, data);
      await bucket.put(
        metadataKey,
        JSON.stringify({ chunkCount: chunkIndex + 1 })
      );
    },

    async closeStream(name: string): Promise<void> {
      const metadataKey = `metadata/${name}`;
      const metadataObj = await bucket.get(metadataKey);
      let chunkCount = 0;
      if (metadataObj) {
        const metadata = await metadataObj.json<{ chunkCount: number }>();
        chunkCount = metadata.chunkCount;
      }
      await bucket.put(
        metadataKey,
        JSON.stringify({ chunkCount, closed: true })
      );
    },

    async readFromStream(
      name: string,
      startIndex = 0
    ): Promise<ReadableStream<Uint8Array>> {
      return new ReadableStream({
        async start(controller) {
          try {
            let index = startIndex;
            const metadataKey = `metadata/${name}`;
            const metadataObj = await bucket.get(metadataKey);
            if (!metadataObj) {
              controller.close();
              return;
            }
            const metadata = await metadataObj.json<{
              chunkCount: number;
              closed?: boolean;
            }>();
            while (index < metadata.chunkCount) {
              const chunkKey = `streams/${name}/${index}`;
              const chunkObj = await bucket.get(chunkKey);
              if (!chunkObj) {
                break;
              }
              const data = await chunkObj.arrayBuffer();
              controller.enqueue(new Uint8Array(data));
              index++;
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    },
  };
}
