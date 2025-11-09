#!/usr/bin/env node
import { confirm, input, select } from '@inquirer/prompts';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

interface QueueConfig {
  workflow: string;
  step: string;
}

interface DispatchConfig {
  mode: 'binding' | 'url';
  value: string;
}

const queueHandlerTemplate = `import {
  StreamCoordinator,
  handleQueueMessage,
  type CloudflareEnv,
  type MessageBatch,
} from 'workflow-cloudflare-world';

export { StreamCoordinator };

export async function queue(
  batch: MessageBatch,
  env: CloudflareEnv
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const result = await handleQueueMessage(env, message);
      if (result?.retryAfterSeconds) {
        message.retry({ delaySeconds: result.retryAfterSeconds });
      } else {
        message.ack();
      }
    } catch (error) {
      console.error('Failed to dispatch queue message', error);
      message.retry();
    }
  }
}
`;

const banner =
  '\n╭──────────────────────────────────────────────╮\n│  Workflow Cloudflare World Configuration CLI │\n╰──────────────────────────────────────────────╯\n';

async function main(): Promise<void> {
  console.log(banner);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      'Interactive prompts require a TTY. Please run this command directly in a local terminal (not through pnpm piping or a non-interactive shell).'
    );
    process.exit(1);
  }

  const deploymentMode = await select({
    message: 'How will you deploy the Cloudflare world?',
    choices: [
      {
        name: 'Bundled with my application Worker',
        value: 'colocated',
      },
      {
        name: 'Dedicated Worker (apps call via service binding)',
        value: 'dedicated',
      },
    ] as const,
  });

  const workerName = await input({
    message: 'Worker name',
    default: deploymentMode === 'dedicated' ? 'workflow-world' : 'workflow-app',
  });

  const d1Binding = await input({
    message: 'D1 binding name',
    default: 'DB',
  });

  const d1DatabaseName = await input({
    message: 'D1 database name',
    default: 'workflow-db',
  });

  const queueConfig: QueueConfig = {
    workflow: await input({
      message: 'Workflow queue name',
      default: 'workflow-queue',
    }),
    step: await input({
      message: 'Step queue name',
      default: 'step-queue',
    }),
  };

  const r2Bucket = await input({
    message: 'R2 bucket name',
    default: 'workflow-streams',
  });

  const deploymentId = await input({
    message: 'Deployment identifier (used when creating runs)',
    default: deploymentMode === 'dedicated' ? workerName : 'cloudflare',
  });

  const useServiceBinding =
    deploymentMode === 'colocated'
      ? await confirm({
          message:
            'Use an internal service binding (recommended) so queue handlers call workflow routes without leaving Cloudflare?',
          default: true,
        })
      : true;

  const dispatchConfig: DispatchConfig = useServiceBinding
    ? {
        mode: 'binding',
        value: await input({
          message:
            'Service binding name (apps will use this to call the world internally)',
          default: 'WORKFLOW_DISPATCH',
        }),
      }
    : {
        mode: 'url',
        value: await input({
          message:
            'Public workflow Worker URL (e.g. https://your-worker.workers.dev)',
          default: 'https://your-worker.workers.dev',
        }),
      };

  const wranglerSnippet = createWranglerSnippet({
    workerName,
    d1Binding,
    d1DatabaseName,
    queueConfig,
    r2Bucket,
    deploymentId,
    dispatchConfig,
  });

  const configPathInput = await input({
    message: 'Path to write Wrangler config (leave blank to skip)?',
    default: 'wrangler.json',
  });
  const configPath =
    configPathInput.trim().length > 0
      ? resolve(process.cwd(), configPathInput.trim())
      : null;

  if (configPath) {
    await ensureDir(dirname(configPath));
    await writeFile(
      configPath,
      JSON.stringify(wranglerSnippet, null, 2),
      'utf-8'
    );
    console.log(`\n✨ Wrote config to ${configPath}`);
  }

  const queueFileInput = await input({
    message:
      'Path to create queue handler + StreamCoordinator export (leave blank to skip)?',
    default: 'src/worker.ts',
  });
  const queueFilePath =
    queueFileInput.trim().length > 0
      ? resolve(process.cwd(), queueFileInput.trim())
      : null;

  if (queueFilePath) {
    await ensureDir(dirname(queueFilePath));
    await writeFile(queueFilePath, queueHandlerTemplate, 'utf-8');
    console.log(`✨ Wrote queue handler to ${queueFilePath}`);
    console.log(
      '   (Ensure @cloudflare/workers-types is installed as a devDependency for MessageBatch types.)'
    );
  }

  printOutput({
    workerName,
    wranglerSnippet,
    dispatchConfig,
    d1DatabaseName,
    outputFile: configPath,
    queueFilePath,
  });
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function createWranglerSnippet({
  workerName,
  d1Binding,
  d1DatabaseName,
  queueConfig,
  r2Bucket,
  deploymentId,
  dispatchConfig,
}: {
  workerName: string;
  d1Binding: string;
  d1DatabaseName: string;
  queueConfig: QueueConfig;
  r2Bucket: string;
  deploymentId: string;
  dispatchConfig: DispatchConfig;
}): Record<string, unknown> {
  const baseConfig: Record<string, unknown> = {
    name: workerName,
    main: 'dist/index.js',
    compatibility_date: '2024-09-26',
    d1_databases: [
      {
        binding: d1Binding,
        database_name: d1DatabaseName,
      },
    ],
    durable_objects: {
      bindings: [
        {
          name: 'STREAM_COORDINATOR',
          class_name: 'StreamCoordinator',
        },
      ],
    },
    migrations: [
      {
        tag: 'stream-coordinator-v1',
        new_classes: ['StreamCoordinator'],
      },
    ],
    queues: {
      producers: [
        { binding: 'WORKFLOW_QUEUE', queue: queueConfig.workflow },
        { binding: 'STEP_QUEUE', queue: queueConfig.step },
      ],
      consumers: [
        {
          queue: queueConfig.workflow,
          max_batch_size: 10,
          max_batch_timeout: 5,
        },
        {
          queue: queueConfig.step,
          max_batch_size: 10,
          max_batch_timeout: 5,
        },
      ],
    },
    r2_buckets: [
      {
        binding: 'STREAM_BUCKET',
        bucket_name: r2Bucket,
      },
    ],
    vars: {
      DEPLOYMENT_ID: deploymentId,
      WORKFLOW_TARGET_WORLD: 'workflow-cloudflare-world',
      ...(dispatchConfig.mode === 'url'
        ? { WORKFLOW_DISPATCH_URL: dispatchConfig.value }
        : {}),
    },
  };

  return baseConfig;
}

function printOutput({
  workerName,
  wranglerSnippet,
  dispatchConfig,
  d1DatabaseName,
  outputFile,
  queueFilePath,
}: {
  workerName: string;
  wranglerSnippet: Record<string, unknown>;
  dispatchConfig: DispatchConfig;
  d1DatabaseName: string;
  outputFile: string | null;
  queueFilePath: string | null;
}): void {
  if (!outputFile) {
    console.log(
      '\nAdd the following snippet to your wrangler configuration:\n'
    );
    console.log(JSON.stringify(wranglerSnippet, null, 2));
  } else {
    console.log(
      `\nReview ${outputFile} and merge it into your wrangler config.`
    );
  }

  console.log('\nNext steps:');
  console.log(
    queueFilePath
      ? `• Queue handler scaffolded at ${queueFilePath}. Re-export it from your framework entry so Wrangler picks up both fetch routes and the queue handler.`
      : '• Create a worker entry that exports StreamCoordinator + queue handler as shown above.'
  );
  console.log(
    `• Run:\n   wrangler d1 migrations apply ${d1DatabaseName}\n   wrangler deploy`
  );

  if (dispatchConfig.mode === 'binding') {
    console.log(
      `\nService binding "${dispatchConfig.value}" lets other Workers invoke ${workerName} internally.\nAdd this to any consumer Worker that should call the world:\n\n"services": [\n  { "binding": "${dispatchConfig.value}", "service": "${workerName}" }\n]\n`
    );
  } else {
    console.log(
      `\nRemember to keep ${dispatchConfig.value} private—queue consumers will call your workflow endpoints over HTTPS.`
    );
  }
}

main().catch((error) => {
  if (error && typeof error === 'object' && 'isTtyError' in error) {
    console.error(
      '\nInteractive prompts require a TTY. Run this command directly in your terminal (not through pnpm piping).'
    );
  } else if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'ExitPromptError'
  ) {
    console.error('\nPrompt cancelled. No files were written.');
  } else {
    console.error('\nFailed to generate configuration:', error);
  }
  process.exit(1);
});
