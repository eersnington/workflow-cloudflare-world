import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { Flags } from '@oclif/core';
import chokidar from 'chokidar';
import {
  createRequestAdapter,
  createStandaloneServer,
  type StandaloneServer,
} from '@workflow/standalone';
import { start } from 'workflow/api';
import { setWorld } from 'workflow/runtime';
import { BaseCommand } from '../base.js';
import { StandaloneBuilder } from '@workflow/builders';
import { getWorkflowConfig } from '../lib/config/workflow-config.js';

export default class Dev extends BaseCommand {
  static description =
    'Start development server that rebuilds workflows and serves standalone endpoints';

  static examples = [
    '$ workflow dev',
    '$ workflow dev --port 3001',
    '$ workflow dev --workflow-manifest .well-known/workflow/v1/manifest.cjs',
  ];

  static flags = {
    port: Flags.integer({
      char: 'p',
      description: 'port to run dev server on',
      default: 3000,
    }),
    target: Flags.string({
      char: 't',
      description: 'build target for development',
      options: ['standalone', 'vercel-build-output-api'],
      default: 'standalone',
    }),
    'workflow-manifest': Flags.string({
      char: 'm',
      description:
        'output location for workflow manifest (defaults to .well-known/workflow/v1/manifest.cjs)',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Dev);

    if (flags.target !== 'standalone') {
      this.error(
        'workflow dev currently only supports the standalone target. Try `workflow dev --target standalone`.'
      );
      return;
    }

    const manifestPath =
      flags['workflow-manifest'] || '.well-known/workflow/v1/manifest.cjs';

    const config = getWorkflowConfig({
      buildTarget: 'standalone',
      workflowManifest: manifestPath,
    });

    const builder = new StandaloneBuilder(config);
    const workingDir = config.workingDir;
    const dirsToWatch = config.dirs.map((dir) => resolve(workingDir, dir));
    const buildOutputDir = resolve(workingDir, '.well-known/workflow/v1');
    const resolvedManifestPath = resolve(workingDir, manifestPath);
    let requireFromCwd: NodeRequireFn;
    try {
      requireFromCwd = createRequire(resolve(workingDir, 'package.json'));
    } catch {
      requireFromCwd = createRequire(import.meta.url);
    }

    process.env.PORT = String(flags.port);
    process.env.WORKFLOW_TARGET_WORLD = 'embedded';
    if (!process.env.WORKFLOW_EMBEDDED_DATA_DIR) {
      process.env.WORKFLOW_EMBEDDED_DATA_DIR = resolve(
        workingDir,
        '.workflow-data'
      );
    }

    this.logInfo('Building workflows...');
    await builder.build();
    this.logInfo('Initial build complete.');

    setWorld(undefined);

    this.clearRequireCache({
      requireFromCwd,
      buildOutputDir,
      manifestPath: resolvedManifestPath,
    });

    let server = await this.startStandaloneServer({
      port: flags.port,
      buildOutputDir,
      manifestPath: resolvedManifestPath,
      requireFromCwd,
    });

    const watcher = chokidar.watch(dirsToWatch, {
      ignoreInitial: true,
    });

    let rebuildInProgress = false;

    const rebuild = async () => {
      if (rebuildInProgress) {
        return;
      }
      rebuildInProgress = true;
      try {
        this.logInfo('Rebuilding workflows...');
        await builder.build();
        this.logInfo('Rebuild complete. Restarting server...');
        await server.close().catch(() => {});
        this.clearRequireCache({
          requireFromCwd,
          buildOutputDir,
          manifestPath: resolvedManifestPath,
        });
        setWorld(undefined);
        server = await this.startStandaloneServer({
          port: flags.port,
          buildOutputDir,
          manifestPath: resolvedManifestPath,
          requireFromCwd,
        });
      } catch (error) {
        this.logError(
          `Rebuild failed: ${
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error)
          }`
        );
      } finally {
        rebuildInProgress = false;
      }
    };

    watcher.on('all', rebuild);

    const shutdown = async () => {
      this.logInfo('Stopping dev server...');
      await watcher.close().catch(() => {});
      await server.close().catch(() => {});
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private async startStandaloneServer({
    port,
    buildOutputDir,
    manifestPath,
    requireFromCwd,
  }: {
    port: number;
    buildOutputDir: string;
    manifestPath: string;
    requireFromCwd: NodeRequireFn;
  }): Promise<StandaloneServer> {
    const requestAdapter = createRequestAdapter({
      baseUrl: `http://127.0.0.1:${port}`,
    });

    const server = await createStandaloneServer({
      buildDir: buildOutputDir,
      manifestPath,
      port,
      logger: console,
      customHandler: async (
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse
      ) => {
        if (!req.url) {
          return false;
        }
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        if (url.pathname !== '/api/test' || req.method !== 'POST') {
          return false;
        }

        try {
          const workflowRequest = await requestAdapter({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body:
              req.method && ['GET', 'HEAD'].includes(req.method)
                ? undefined
                : req,
          });

          const payload = (await workflowRequest.json().catch(() => ({}))) as {
            name?: string;
            workflowFile?: string;
            workflowFn?: string;
            args?: unknown[];
          };

          const manifest = this.loadManifest(requireFromCwd, manifestPath);

          const workflowFile =
            (typeof payload.workflowFile === 'string' &&
              payload.workflowFile.length > 0 &&
              payload.workflowFile) ||
            Object.keys(manifest ?? {})[0];

          if (!workflowFile || !manifest?.[workflowFile]) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  'Could not determine workflowFile. Provide one in the POST body.',
              })
            );
            return true;
          }

          const workflowFn =
            (typeof payload.workflowFn === 'string' &&
              payload.workflowFn.length > 0 &&
              payload.workflowFn) ||
            Object.keys(manifest[workflowFile] ?? {})[0];

          const workflowEntry = manifest[workflowFile]?.[workflowFn];

          if (!workflowFn || !workflowEntry) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  'Could not determine workflowFn. Provide one in the POST body.',
              })
            );
            return true;
          }

          const args = Array.isArray(payload.args) ? payload.args : [];
          const run = await start(workflowEntry as any, args as any);
          const name =
            typeof payload.name === 'string' && payload.name.length > 0
              ? payload.name
              : workflowFn;
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              runId: run.runId,
              workflowFile,
              workflowFn,
              name,
            })
          );
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'Failed to start workflow',
              message: error instanceof Error ? error.message : String(error),
            })
          );
        }
        return true;
      },
    });

    console.log(`→ Workflow dev server listening on http://127.0.0.1:${port}`);
    console.log(
      '  POST /api/test with { "workflowFile", "workflowFn", "args": [] } to start runs.'
    );
    return server;
  }

  private clearRequireCache({
    requireFromCwd,
    buildOutputDir,
    manifestPath,
  }: {
    requireFromCwd: NodeRequireFn;
    buildOutputDir: string;
    manifestPath: string;
  }) {
    const candidates = [
      resolve(buildOutputDir, 'step.js'),
      resolve(buildOutputDir, 'step.mjs'),
      resolve(buildOutputDir, 'step.cjs'),
      resolve(buildOutputDir, 'flow.js'),
      resolve(buildOutputDir, 'flow.mjs'),
      resolve(buildOutputDir, 'flow.cjs'),
      resolve(buildOutputDir, 'webhook.js'),
      resolve(buildOutputDir, 'webhook.mjs'),
      resolve(buildOutputDir, 'webhook.cjs'),
      manifestPath,
    ];

    for (const candidate of candidates) {
      try {
        const resolved = requireFromCwd.resolve(candidate);
        delete requireFromCwd.cache[resolved];
      } catch {}
    }
  }

  private loadManifest(
    requireFromCwd: NodeRequireFn,
    manifestPath: string
  ): Record<string, Record<string, unknown>> | undefined {
    try {
      return requireFromCwd(manifestPath) as Record<
        string,
        Record<string, unknown>
      >;
    } catch {
      return undefined;
    }
  }
}
type NodeRequireFn = ReturnType<typeof createRequire>;
