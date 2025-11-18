import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createWorkflowMiddleware } from './middleware.js';

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length) {
    const dir = tempRoots.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('workflow middleware', () => {
  it('passes through non workflow routes', async () => {
    const { options } = await createWorkflowOutput();
    const middleware = createWorkflowMiddleware(options);
    const req = { path: '/api/hello' };
    let nextCalled = false;

    await middleware(req as any, {} as any, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('handles workflow routes via generated handlers', async () => {
    const { options } = await createWorkflowOutput({
      'flow.js': `export const POST = async () => new Response('flow-from-middleware', { status: 299 });`,
    });
    const middleware = createWorkflowMiddleware(options);
    const req = createRequest('POST', '/.well-known/workflow/v1/flow');
    const res = createResponse();
    let nextCalled = false;

    await middleware(req as any, res as any, (err?: unknown) => {
      if (err) {
        throw err;
      }
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(299);
    expect(res.body).toBe('flow-from-middleware');
  });
});

async function createWorkflowOutput(
  overrides: Record<string, string> = {}
): Promise<{ options: { outputDir: string } }> {
  const root = await mkdtemp(join(tmpdir(), 'workflow-express-mw-'));
  tempRoots.push(root);
  const outputDir = join(root, '.well-known', 'workflow', 'v1');
  await mkdir(outputDir, { recursive: true });

  const files: Record<string, string> = {
    'flow.js': `export const POST = async () => new Response('flow-response', { status: 201 });`,
    'step.js': `export const POST = async () => new Response('step-response', { status: 200 });`,
    'webhook.js': `export const POST = async () => new Response('webhook-response', { status: 202 });`,
    'client.js': `export const sampleWorkflow = () => {};`,
    ...overrides,
  };

  await Promise.all(
    Object.entries(files).map(([file, contents]) =>
      writeFile(join(outputDir, file), contents, 'utf8')
    )
  );

  const relativeDir = relative(process.cwd(), outputDir);
  return { options: { outputDir: relativeDir } };
}

function createRequest(method: string, path: string) {
  const headers: Record<string, string> = {
    host: 'example.com',
  };
  return {
    method,
    path,
    protocol: 'http',
    originalUrl: path,
    headers,
    readable: false,
    get(key: string) {
      return headers[key.toLowerCase()];
    },
  };
}

function createResponse() {
  return {
    statusCode: 0,
    headers: new Map<string, string>(),
    body: '',
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers.set(key, String(value));
    },
    end(buffer?: Buffer) {
      this.body = buffer?.toString() ?? '';
    },
  };
}
