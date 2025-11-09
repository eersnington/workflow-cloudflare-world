import type { CloudflareEnv } from './config.js';

interface StreamMetadata {
  chunkCount: number;
  closed: boolean;
}

type StreamWatcher = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  nextIndex: number;
};

const METADATA_KEY = 'metadata';
const INTERNAL_CONTENT_TYPE = 'application/octet-stream';

type StreamCoordinatorEnv = Pick<CloudflareEnv, 'STREAM_BUCKET'>;

export class StreamCoordinator implements DurableObject {
  private metadata: StreamMetadata | null = null;
  private watchers = new Set<StreamWatcher>();
  private streamName: string | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: StreamCoordinatorEnv
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const streamName = request.headers.get('X-Stream-Name');
    if (!streamName) {
      return new Response('Missing stream name', { status: 400 });
    }

    if (this.streamName === null) {
      this.streamName = streamName;
    } else if (this.streamName !== streamName) {
      return new Response('Stream name mismatch', { status: 409 });
    }

    switch (url.pathname) {
      case '/write':
        return this.handleWrite(request);
      case '/close':
        return this.handleClose();
      case '/read':
        return this.handleRead(url);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleWrite(request: Request): Promise<Response> {
    const name = this.ensureStreamName();
    const chunk = new Uint8Array(await request.arrayBuffer());
    const metadata = await this.loadMetadata();
    const chunkIndex = metadata.chunkCount;

    await this.env.STREAM_BUCKET.put(chunkKey(name, chunkIndex), chunk);
    metadata.chunkCount++;
    await this.persistMetadata(metadata);
    this.broadcastChunk(chunkIndex, chunk);

    return new Response(null, { status: 204 });
  }

  private async handleClose(): Promise<Response> {
    const metadata = await this.loadMetadata();
    metadata.closed = true;
    await this.persistMetadata(metadata);
    this.broadcastClose();
    return new Response(null, { status: 204 });
  }

  private async handleRead(url: URL): Promise<Response> {
    const name = this.ensureStreamName();
    const startIndex = Number(url.searchParams.get('startIndex') ?? 0) || 0;
    let metadata = await this.loadMetadata();

    let watcher: StreamWatcher | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        await this.replayExisting(controller, name, startIndex, metadata);

        metadata = await this.loadMetadata();
        if (metadata.closed) {
          controller.close();
          return;
        }

        watcher = {
          controller,
          nextIndex:
            startIndex > metadata.chunkCount ? startIndex : metadata.chunkCount,
        };
        this.watchers.add(watcher);
      },
      cancel: () => {
        if (watcher) {
          this.watchers.delete(watcher);
          watcher = null;
        }
      },
      pull: () => {
        // no-op: we push when new chunks arrive
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': INTERNAL_CONTENT_TYPE,
      },
    });
  }

  private broadcastChunk(index: number, chunk: Uint8Array) {
    this.watchers.forEach((watcher) => {
      if (index < watcher.nextIndex) {
        return;
      }

      if (index > watcher.nextIndex) {
        // The watcher requested a future index (e.g., startIndex > chunkCount)
        watcher.nextIndex = index;
      }

      try {
        watcher.controller.enqueue(chunk);
        watcher.nextIndex = index + 1;
      } catch {
        this.watchers.delete(watcher);
      }
    });
  }

  private broadcastClose() {
    this.watchers.forEach((watcher) => {
      try {
        watcher.controller.close();
      } finally {
        this.watchers.delete(watcher);
      }
    });
    this.watchers.clear();
  }

  private async replayExisting(
    controller: ReadableStreamDefaultController<Uint8Array>,
    name: string,
    startIndex: number,
    metadata: StreamMetadata
  ): Promise<void> {
    for (let index = startIndex; index < metadata.chunkCount; index++) {
      const obj = await this.env.STREAM_BUCKET.get(chunkKey(name, index));
      if (!obj) {
        continue;
      }
      const buf = await obj.arrayBuffer();
      controller.enqueue(new Uint8Array(buf));
    }

    if (metadata.closed && metadata.chunkCount <= startIndex) {
      controller.close();
    }
  }

  private async loadMetadata(): Promise<StreamMetadata> {
    if (this.metadata) {
      return this.metadata;
    }
    const stored =
      (await this.state.storage.get<StreamMetadata>(METADATA_KEY)) ?? null;
    this.metadata = stored ?? { chunkCount: 0, closed: false };
    if (!stored) {
      await this.state.storage.put(METADATA_KEY, this.metadata);
    }
    return this.metadata;
  }

  private async persistMetadata(metadata: StreamMetadata): Promise<void> {
    this.metadata = metadata;
    await this.state.storage.put(METADATA_KEY, metadata);
  }

  private ensureStreamName(): string {
    if (!this.streamName) {
      throw new Error('Stream name not initialized');
    }
    return this.streamName;
  }
}

const chunkKey = (name: string, index: number): string =>
  `streams/${encodeURIComponent(name)}/${index}`;
