import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';
import {
  createStandaloneServer,
  createRequestAdapter,
} from '@workflow/standalone';
import { start } from 'workflow/api';

const ROOT = process.cwd();
const BUILD_DIR = resolve(ROOT, '.well-known/workflow/v1');
const MANIFEST_PATH = resolve(ROOT, 'manifest.cjs');
const require = createRequire(import.meta.url);

if (!existsSync(BUILD_DIR)) {
  console.error(
    'Missing build output. Run `pnpm --filter @workflow/frameworkless-app build` first.'
  );
  process.exit(1);
}

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const manifest = loadManifest();
const requestAdapter = createRequestAdapter({
  baseUrl: `http://127.0.0.1:${port}`,
});

const { url, close } = await createStandaloneServer({
  buildDir: BUILD_DIR,
  manifestPath: MANIFEST_PATH,
  port,
  logger: console,
  customHandler: async (req, res) => {
    if (!req.url) {
      return false;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname !== '/api/test' || req.method !== 'POST') {
      return false;
    }

    try {
      const request = await requestAdapter({
        method: req.method,
        url: req.url ?? '/api/test',
        headers: req.headers,
        body:
          req.method && ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      });
      const payload = (await request.json().catch(() => ({}))) as {
        name?: string;
      };
      const name =
        typeof payload?.name === 'string' && payload.name.length > 0
          ? payload.name
          : 'curl';

      const workflowEntry =
        manifest?.['workflows/hello.ts'] &&
        manifest['workflows/hello.ts']?.hello;

      if (!workflowEntry) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            error: 'hello workflow not found in manifest. rebuild the project.',
          })
        );
        return true;
      }

      const run = await start(workflowEntry, [name]);

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ runId: run.runId, name }));
    } catch (error) {
      console.error('Failed to start workflow from /api/test', error);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'failed to start workflow',
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }

    return true;
  },
});

console.log(`frameworkless server ready on ${url}`);

const shutdown = async () => {
  console.log('Shutting down frameworkless server…');
  await close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function loadManifest(): Record<string, any> | undefined {
  try {
    return require(MANIFEST_PATH) as Record<string, any>;
  } catch (error) {
    console.warn(
      'Unable to load manifest.cjs. /api/test endpoint will fail:',
      error
    );
    return undefined;
  }
}
