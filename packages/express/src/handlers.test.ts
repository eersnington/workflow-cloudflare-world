import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { handleFlow, handleWebhook } from './handlers.js';

const createdDirs: string[] = [];

afterEach(async () => {
  while (createdDirs.length) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('workflow handlers', () => {
  it('loads flow handler bundles and proxies responses', async () => {
    const { options } = await createWorkflowOutput();
    const req = createRequest('POST', '/.well-known/workflow/v1/flow');
    const res = createResponse();

    await handleFlow(req, res, options);

    expect(res.statusCode).toBe(201);
    expect(res.body).toBe('flow-response');
  });

  it('routes webhook methods using generated handlers', async () => {
    const { options } = await createWorkflowOutput({
      'webhook.js': `
        export const POST = async () => new Response('webhook-post', { status: 207 });
        export const DELETE = async () => new Response(null, { status: 204 });
      `,
    });

    const postReq = createRequest(
      'POST',
      '/.well-known/workflow/v1/webhook/example'
    );
    const postRes = createResponse();
    await handleWebhook(postReq, postRes, options);
    expect(postRes.statusCode).toBe(207);
    expect(postRes.body).toBe('webhook-post');

    const deleteReq = createRequest(
      'DELETE',
      '/.well-known/workflow/v1/webhook/example'
    );
    const deleteRes = createResponse();
    await handleWebhook(deleteReq, deleteRes, options);
    expect(deleteRes.statusCode).toBe(204);
  });
});

async function createWorkflowOutput(
  overrides: Record<string, string> = {}
): Promise<{ options: { outputDir: string } }> {
  const root = await mkdtemp(join(tmpdir(), 'workflow-express-'));
  createdDirs.push(root);
  const outputDir = join(root, '.well-known', 'workflow', 'v1');
  await mkdir(outputDir, { recursive: true });

  const files: Record<string, string> = {
    'flow.js': `export const POST = async () => new Response('flow-response', { status: 201 });`,
    'step.js': `export const POST = async () => new Response('step-response', { status: 202 });`,
    'webhook.js': `export const POST = async () => new Response('webhook-response', { status: 203 });`,
    'client.js': `export const mockWorkflow = () => {};`,
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
